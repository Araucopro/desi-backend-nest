import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { DteService } from '../dte/dte.service';
import {
  DteDocument,
  DteDocumentStatus,
} from '../dte/entities/dte-document.entity';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { FinancialMovementsService } from '../financial-movements/financial-movements.service';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { CreateReturnDto } from './dto/create-return.dto';
import { ListReturnsQueryDto } from './dto/list-returns.query.dto';
import { Return, ReturnStatus, ReturnType } from './entities/return.entity';
import { ReturnItem } from './entities/return-item.entity';
import { ReturnFolioCounter } from './entities/return-folio-counter.entity';
import { ReturnDteMapperService } from './return-dte-mapper.service';
import {
  createReturnEntity,
  createReturnItems,
  findActiveReturnsForSale,
  findReturnByIdempotencyKey,
  findSaleForReturn,
  listReturns,
  loadReturn,
  loadReturnForUpdate,
  nextReturnFolio,
} from './returns-repository.helpers';
import {
  resolveEffectiveDocument,
  validateReturnRequest,
} from './returns-engine';
import { toReturnView } from './returns-view.mapper';
import { ReturnView } from './returns.types';
import { TenantAbility } from '../auth/ability/ability.factory';
import { PermissionScope } from '../roles/entities/role-permission.entity';
import { AbilityFactory } from '../auth/ability/ability.factory';

@Injectable()
export class ReturnsService implements OnModuleInit {
  constructor(
    @InjectRepository(Return)
    private readonly returnRepository: Repository<Return>,
    @InjectRepository(ReturnItem)
    private readonly returnItemRepository: Repository<ReturnItem>,
    @InjectRepository(ReturnFolioCounter)
    private readonly returnFolioCounterRepository: Repository<ReturnFolioCounter>,
    private readonly dataSource: DataSource,
    private readonly dteService: DteService,
    private readonly returnDteMapperService: ReturnDteMapperService,
    private readonly inventoryService: InventoryService,
    private readonly financialMovementsService: FinancialMovementsService,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
    @Optional() private readonly abilityFactory?: AbilityFactory,
  ) {}

  onModuleInit(): void {
    if (typeof this.dteService.registerFinalizedListener === 'function') {
      this.dteService.registerFinalizedListener((manager, document) =>
        this.onDteFinalized(manager, document),
      );
    }
    if (typeof this.dteService.registerFailedListener === 'function') {
      this.dteService.registerFailedListener((manager, document) =>
        this.onDteFailed(manager, document),
      );
    }
  }

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.transactionRunner) {
      return this.transactionRunner.run(callback);
    }

    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.dataSource.transaction(callback);
  }

  async create(
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateReturnDto,
    userId?: string,
    impersonatedBy?: string,
  ): Promise<ReturnView> {
    const ownerId =
      userId ??
      (this.abilityFactory
        ? await this.abilityFactory.getSystemUserId()
        : undefined);
    return this.runInTransaction(async (manager) => {
      if (idempotencyKey) {
        const existing = await findReturnByIdempotencyKey(
          manager,
          idempotencyKey,
        );
        if (existing) {
          if (existing.storeID !== storeID) {
            throw new BadRequestException(
              'La Idempotency-Key ya fue utilizada en otra tienda',
            );
          }
          return toReturnView(await loadReturn(manager, existing.returnID));
        }
      }

      const sale = await findSaleForReturn(manager, dto.saleID, storeID);
      const activeReturns = await findActiveReturnsForSale(manager, dto.saleID);
      const prepared = validateReturnRequest({
        sale,
        storeID,
        returnType: dto.returnType,
        items: dto.items,
        discountAmount: dto.discountAmount,
        reason: dto.reason,
        issueDate: dto.issueDate,
        activeReturns,
      });

      const tenantID = this.tenantContext?.getTenantId() ?? sale.tenantID;
      const returnID = randomUUID();
      const ret = createReturnEntity(manager, {
        returnID,
        tenantID,
        storeID,
        saleID: dto.saleID,
        userID: ownerId!,
        impersonatedBy: impersonatedBy ?? null,
        prepared,
        idempotencyKey: idempotencyKey ?? null,
      });
      try {
        await manager.save(ret);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (!idempotencyKey) throw error;
        const concurrent = await findReturnByIdempotencyKey(
          manager,
          idempotencyKey,
        );
        if (!concurrent) throw error;
        if (concurrent.storeID !== storeID) {
          throw new BadRequestException(
            'La Idempotency-Key ya fue utilizada en otra tienda',
          );
        }
        return toReturnView(await loadReturn(manager, concurrent.returnID));
      }

      if (prepared.items.length > 0) {
        await manager.save(
          createReturnItems(manager, tenantID, returnID, prepared.items),
        );
      }

      return toReturnView(await loadReturn(manager, returnID));
    });
  }

  async findAll(
    storeID: string,
    query: ListReturnsQueryDto,
    userId?: string,
    ability?: TenantAbility,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { returns, total } = await this.runInTransaction((manager) =>
      listReturns(
        manager,
        storeID,
        query,
        userId && ability
          ? {
              scope: ability.scopeFor('returns:read') ?? PermissionScope.ALL,
              ownerId: userId,
            }
          : undefined,
      ),
    );
    return {
      returns: returns.map((ret) => toReturnView(ret)),
      meta: { page, limit, total },
    };
  }

  async findOne(
    returnID: string,
    storeID: string,
    userId?: string,
    ability?: TenantAbility,
  ): Promise<ReturnView> {
    return this.runInTransaction(async (manager) =>
      toReturnView(
        await loadReturn(
          manager,
          returnID,
          storeID,
          userId && ability
            ? {
                scope: ability.scopeFor('returns:read') ?? PermissionScope.ALL,
                ownerId: userId,
              }
            : undefined,
        ),
      ),
    );
  }

  async approve(
    returnID: string,
    storeID: string,
    userId?: string,
    ability?: TenantAbility,
  ): Promise<ReturnView> {
    const current = await this.runInTransaction((manager) =>
      loadReturnForUpdate(manager, returnID, storeID),
    );
    if (
      userId &&
      ability &&
      !ability.can('returns:approve', current.userID, userId)
    ) {
      throw new BadRequestException('La devolución no está disponible');
    }

    if (current.status === ReturnStatus.COMPLETADA) {
      return toReturnView(current);
    }
    if (current.status === ReturnStatus.APROBADA) {
      return toReturnView(current);
    }
    if (current.status !== ReturnStatus.PENDIENTE) {
      throw new BadRequestException(
        `Solo devoluciones PENDIENTE pueden aprobarse (actual: ${current.status})`,
      );
    }

    const effective = resolveEffectiveDocument(
      current.sale,
      current.returnType,
    );

    if (!effective.requiresNce) {
      return this.runInTransaction(async (manager) => {
        const ret = await loadReturnForUpdate(manager, returnID, storeID);
        if (ret.status === ReturnStatus.COMPLETADA) {
          return toReturnView(ret);
        }
        if (ret.status !== ReturnStatus.PENDIENTE) {
          throw new BadRequestException(
            `Solo devoluciones PENDIENTE pueden aprobarse (actual: ${ret.status})`,
          );
        }
        ret.approvedBy = userId ?? null;
        ret.approvedAt = new Date();
        await this.completeReturnInManager(manager, ret);
        return toReturnView(await loadReturn(manager, returnID, storeID));
      });
    }

    const dteDto = this.returnDteMapperService.mapReturnToNce({
      sale: current.sale,
      ret: current,
      originalDocumentType: effective.documentType!,
      codRef: effective.codRef,
    });
    const dteResponse = await this.dteService.create(
      storeID,
      returnID,
      dteDto,
      {
        reserveStock: false,
        cogsTotalOverride: Number(current.cogsTotal),
      },
    );

    if (dteResponse.STATUS === 'EMITIDO') {
      return this.runInTransaction(async (manager) => {
        const ret = await loadReturnForUpdate(manager, returnID, storeID);
        if (ret.status !== ReturnStatus.COMPLETADA) {
          ret.dteDocumentID = ret.dteDocumentID ?? dteResponse.dteDocumentID;
          if (dteResponse.FOLIO && Number(dteResponse.FOLIO) > 0) {
            ret.folio = Number(dteResponse.FOLIO);
          }
          ret.approvedBy = userId ?? null;
          ret.approvedAt = new Date();
          await this.completeReturnInManager(manager, ret);
        } else if (ret.approvedBy == null) {
          if (dteResponse.FOLIO && Number(dteResponse.FOLIO) > 0) {
            ret.folio = Number(dteResponse.FOLIO);
          }
          ret.approvedBy = userId ?? null;
          ret.approvedAt = new Date();
          await manager.save(ret);
        }
        return toReturnView(
          await loadReturn(manager, returnID, storeID),
          dteResponse,
        );
      });
    }

    return this.runInTransaction(async (manager) => {
      const ret = await loadReturnForUpdate(manager, returnID, storeID);
      if (ret.status === ReturnStatus.COMPLETADA) {
        return toReturnView(ret, dteResponse);
      }
      if (ret.status !== ReturnStatus.PENDIENTE) {
        return toReturnView(ret, dteResponse);
      }
      ret.dteDocumentID = ret.dteDocumentID ?? dteResponse.dteDocumentID;
      if (dteResponse.FOLIO && Number(dteResponse.FOLIO) > 0) {
        ret.folio = Number(dteResponse.FOLIO);
      }
      ret.approvedBy = userId ?? null;
      ret.approvedAt = new Date();
      ret.status = ReturnStatus.APROBADA;
      await manager.save(ret);
      return toReturnView(
        await loadReturn(manager, returnID, storeID),
        dteResponse,
      );
    });
  }

  async reject(
    returnID: string,
    storeID: string,
    userId?: string,
    ability?: TenantAbility,
  ): Promise<ReturnView> {
    return this.runInTransaction(async (manager) => {
      const ret = await loadReturnForUpdate(manager, returnID, storeID);
      if (
        userId &&
        ability &&
        !ability.can('returns:reject', ret.userID, userId)
      ) {
        throw new BadRequestException('La devolución no está disponible');
      }
      if (ret.status === ReturnStatus.RECHAZADA) {
        return toReturnView(ret);
      }
      if (ret.status !== ReturnStatus.PENDIENTE) {
        throw new BadRequestException(
          `Solo devoluciones PENDIENTE pueden rechazarse (actual: ${ret.status})`,
        );
      }
      ret.status = ReturnStatus.RECHAZADA;
      await manager.save(ret);
      return toReturnView(await loadReturn(manager, returnID, storeID));
    });
  }

  async cancel(
    returnID: string,
    storeID: string,
    userId?: string,
    ability?: TenantAbility,
  ): Promise<ReturnView> {
    return this.runInTransaction(async (manager) => {
      const ret = await loadReturnForUpdate(manager, returnID, storeID);
      if (
        userId &&
        ability &&
        !ability.can('returns:cancel', ret.userID, userId)
      ) {
        throw new BadRequestException('La devolución no está disponible');
      }
      if (ret.status === ReturnStatus.CANCELADA) {
        return toReturnView(ret);
      }
      if (ret.status !== ReturnStatus.PENDIENTE) {
        throw new BadRequestException(
          `Solo devoluciones PENDIENTE pueden cancelarse (actual: ${ret.status})`,
        );
      }
      ret.status = ReturnStatus.CANCELADA;
      await manager.save(ret);
      return toReturnView(await loadReturn(manager, returnID, storeID));
    });
  }

  async reconcile(
    returnID: string,
    storeID: string,
    userId?: string,
    ability?: TenantAbility,
  ): Promise<ReturnView> {
    const current = await this.runInTransaction((manager) =>
      loadReturn(manager, returnID, storeID),
    );
    if (
      userId &&
      ability &&
      !ability.can('returns:reconcile', current.userID, userId)
    ) {
      throw new BadRequestException('La devolución no está disponible');
    }

    if (current.status === ReturnStatus.COMPLETADA) {
      return toReturnView(current);
    }
    if (
      current.status !== ReturnStatus.PENDIENTE &&
      current.status !== ReturnStatus.APROBADA
    ) {
      throw new BadRequestException(
        `La devolución no está en estado reconciliable (actual: ${current.status})`,
      );
    }
    if (!current.dteDocumentID) {
      throw new BadRequestException(
        'La devolución no tiene documento DTE asociado para reconciliar',
      );
    }

    let dteResponse;
    try {
      dteResponse = await this.dteService.reconcile(
        current.dteDocumentID,
        storeID,
      );
    } catch (error) {
      if (error instanceof BadGatewayException) {
        const after = await this.runInTransaction((manager) =>
          loadReturn(manager, returnID, storeID),
        );
        if (after.status === ReturnStatus.PENDIENTE) {
          return toReturnView(after);
        }
      }
      throw error;
    }

    if (dteResponse.STATUS === 'EMITIDO') {
      await this.runInTransaction(async (manager) => {
        const ret = await loadReturnForUpdate(manager, returnID, storeID);
        if (ret.status !== ReturnStatus.COMPLETADA) {
          await this.completeReturnInManager(manager, ret);
        }
      });
    }

    return this.runInTransaction(async (manager) =>
      toReturnView(await loadReturn(manager, returnID, storeID), dteResponse),
    );
  }

  private async onDteFinalized(
    manager: EntityManager,
    document: DteDocument,
  ): Promise<void> {
    if (document.status !== DteDocumentStatus.EMITIDO) return;

    const returns = await manager.getRepository(Return).find({
      where: [
        {
          dteDocumentID: document.dteDocumentID,
          status: In([ReturnStatus.PENDIENTE, ReturnStatus.APROBADA]),
        },
        {
          idempotencyKey: document.idempotencyKey ?? '',
          status: In([ReturnStatus.PENDIENTE, ReturnStatus.APROBADA]),
        },
      ],
    });

    for (const ret of returns) {
      const locked = await loadReturnForUpdate(manager, ret.returnID);
      if (locked.status !== ReturnStatus.COMPLETADA) {
        locked.dteDocumentID = locked.dteDocumentID ?? document.dteDocumentID;
        if (!locked.folio) locked.folio = document.folio;
        await this.completeReturnInManager(manager, locked);
      }
    }
  }

  private async onDteFailed(
    manager: EntityManager,
    document: DteDocument,
  ): Promise<void> {
    if (document.status !== DteDocumentStatus.ERROR) return;

    const returns = await manager.getRepository(Return).find({
      where: [
        {
          dteDocumentID: document.dteDocumentID,
          status: ReturnStatus.APROBADA,
        },
        {
          idempotencyKey: document.idempotencyKey ?? '',
          status: ReturnStatus.APROBADA,
        },
      ],
    });

    for (const ret of returns) {
      const locked = await loadReturnForUpdate(manager, ret.returnID);
      if (locked.status !== ReturnStatus.APROBADA) continue;
      locked.status = ReturnStatus.PENDIENTE;
      locked.approvedBy = null;
      locked.approvedAt = null;
      // Se conserva dteDocumentID para trazabilidad y re-emisión idempotente.
      await manager.save(locked);
    }
  }

  private async completeReturnInManager(
    manager: EntityManager,
    ret: Return,
  ): Promise<void> {
    if (ret.status === ReturnStatus.COMPLETADA) return;
    if (
      ret.status !== ReturnStatus.PENDIENTE &&
      ret.status !== ReturnStatus.APROBADA
    ) {
      throw new BadRequestException(
        `La devolución no puede completarse desde ${ret.status}`,
      );
    }

    if (ret.returnType !== ReturnType.DESCUENTO) {
      for (const item of ret.items ?? []) {
        await this.inventoryService.applyMovement(manager, {
          storeID: ret.storeID,
          variationID: item.variationID,
          reason: InventoryMovementReason.RETURN,
          quantity: item.quantity,
          referenceID: ret.returnID,
          tenantID: ret.tenantID,
          allowNegativeStock: true,
          createIfMissing: true,
          condition: item.condition,
        });
      }
    }

    const requiresNce = resolveEffectiveDocument(
      ret.sale,
      ret.returnType,
    ).requiresNce;
    if (!requiresNce) {
      await this.financialMovementsService.recordReturnForSaleNote(manager, {
        returnID: ret.returnID,
        tenantID: ret.tenantID,
        storeID: ret.storeID,
        issueDate: ret.issueDate,
        netTotal: Number(ret.netTotal),
        taxTotal: Number(ret.taxTotal),
        cogsTotal: Number(ret.cogsTotal),
      });
      if (ret.folio == null) {
        ret.folio = await nextReturnFolio(manager, ret.storeID, ret.tenantID);
      }
    }

    ret.status = ReturnStatus.COMPLETADA;
    ret.completedAt = new Date();
    await manager.save(ret);
  }
}
