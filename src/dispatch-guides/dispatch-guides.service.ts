import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DteService } from '../dte/dte.service';
import {
  DteDocument,
  DteDocumentStatus,
} from '../dte/entities/dte-document.entity';
import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { CreateDteDocumentDto } from '../dte/dto/create-dte-document.dto';
import { OpenfacturaClientService } from '../dte/openfactura-client.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { PricingService } from '../pricing/pricing.service';
import { StoresService } from '../stores/stores.service';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { CreateDispatchGuideDto } from './dto/create-dispatch-guide.dto';
import { ListDispatchGuidesQueryDto } from './dto/list-dispatch-guides.query.dto';
import {
  DispatchGuide,
  DispatchGuideStatus,
} from './entities/dispatch-guide.entity';
import { DispatchGuideItem } from './entities/dispatch-guide-item.entity';
import { DispatchGuideReference } from './entities/dispatch-guide-reference.entity';
import { DispatchGuideDteMapperService } from './dispatch-guide-dte-mapper.service';
import {
  assertCanAnular,
  buildPreparedDispatchGuide,
  toDateOnly,
} from './dispatch-guides-engine';
import {
  createDispatchGuideEntity,
  createDispatchGuideItems,
  findDispatchGuideByIdempotencyKey,
  findStoreById,
  listDispatchGuides,
  loadDispatchGuide,
  loadDispatchGuideForUpdate,
} from './dispatch-guides-repository.helpers';
import { toDispatchGuideView } from './dispatch-guides-view.mapper';
import { DispatchGuideView } from './dispatch-guides.types';

@Injectable()
export class DispatchGuidesService implements OnModuleInit {
  private readonly logger = new Logger(DispatchGuidesService.name);

  constructor(
    @InjectRepository(DispatchGuide)
    private readonly dispatchGuideRepository: Repository<DispatchGuide>,
    @InjectRepository(DispatchGuideItem)
    private readonly dispatchGuideItemRepository: Repository<DispatchGuideItem>,
    @InjectRepository(DispatchGuideReference)
    private readonly dispatchGuideReferenceRepository: Repository<DispatchGuideReference>,
    private readonly dataSource: DataSource,
    private readonly pricingService: PricingService,
    private readonly dteService: DteService,
    private readonly dispatchGuideDteMapperService: DispatchGuideDteMapperService,
    private readonly inventoryService: InventoryService,
    private readonly storesService: StoresService,
    private readonly openfacturaClient: OpenfacturaClientService,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
  ) {}

  onModuleInit(): void {
    if (typeof this.dteService.registerFinalizedListener === 'function') {
      this.dteService.registerFinalizedListener((manager, document) =>
        this.onDteFinalized(manager, document),
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
    dto: CreateDispatchGuideDto,
    userId?: string,
  ): Promise<DispatchGuideView> {
    const { dispatchGuideID, dteDto } = await this.runInTransaction(
      async (manager) => {
        if (idempotencyKey) {
          const existing = await findDispatchGuideByIdempotencyKey(
            manager,
            idempotencyKey,
          );
          if (existing) {
            if (existing.storeID !== storeID) {
              throw new BadRequestException(
                'La Idempotency-Key ya fue utilizada en otra tienda',
              );
            }
            return {
              dispatchGuideID: existing.dispatchGuideID,
              dteDto: null,
              existing: true,
            };
          }
        }

        const store = await findStoreById(manager, storeID);
        if (!store.hasOpenfacturaKey) {
          throw new BadRequestException(
            'La tienda no tiene configurada la API key de Openfactura. No es posible emitir guías de despacho.',
          );
        }

        const pricing = await this.pricingService.calculateCart({
          storeID,
          items: dto.items.map((item) => ({
            storeProductID: item.storeProductID,
            quantity: item.quantity,
          })),
          userID: userId ?? null,
          ...(dto.manualDiscount !== undefined && dto.manualDiscount > 0
            ? { manualDiscount: dto.manualDiscount }
            : {}),
          pricingDate: toDateOnly(dto.issueDate ?? new Date()),
        });
        const prepared = buildPreparedDispatchGuide(dto, pricing);
        const dteDto = this.dispatchGuideDteMapperService.mapDispatchGuideToDte(
          {
            issueDate: prepared.issueDate,
            receiver: prepared.receiver,
            destination: prepared.destination,
            transport: prepared.transport,
            items: prepared.items,
            total: prepared.total,
            netTotal: prepared.netTotal,
            taxTotal: prepared.taxTotal,
            store,
          },
        );

        const tenantID = this.tenantContext?.getTenantId() ?? store.tenantID;
        const dispatchGuideID = randomUUID();
        const guide = createDispatchGuideEntity(manager, {
          dispatchGuideID,
          tenantID,
          storeID,
          userID: userId ?? null,
          idempotencyKey: idempotencyKey ?? null,
          prepared,
        });
        guide.payloadRaw = dteDto as unknown as Record<string, unknown>;

        try {
          await manager.save(guide);
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          if (!idempotencyKey) throw error;
          const concurrent = await findDispatchGuideByIdempotencyKey(
            manager,
            idempotencyKey,
          );
          if (!concurrent) throw error;
          if (concurrent.storeID !== storeID) {
            throw new BadRequestException(
              'La Idempotency-Key ya fue utilizada en otra tienda',
            );
          }
          return {
            dispatchGuideID: concurrent.dispatchGuideID,
            dteDto: null,
            existing: true,
          };
        }

        await manager.save(
          createDispatchGuideItems(
            manager,
            tenantID,
            dispatchGuideID,
            prepared.items,
          ),
        );

        return { dispatchGuideID, dteDto, existing: false };
      },
    );

    if (dteDto === null) {
      return this.findOne(dispatchGuideID, storeID);
    }

    try {
      const dteResponse = await this.dteService.create(
        storeID,
        idempotencyKey,
        dteDto,
        {
          reserveStock: true,
          reserveReason: InventoryMovementReason.DISPATCH_GUIDE,
        },
      );

      return this.withDteResponse(dispatchGuideID, storeID, dteResponse);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.runInTransaction(async (manager) => {
        const guide = await loadDispatchGuideForUpdate(
          manager,
          dispatchGuideID,
          storeID,
        );
        guide.errorDetail = detail;
        await manager.save(guide);
      });

      if (idempotencyKey) {
        const dteDocument =
          await this.dteService.findByIdempotencyKey(idempotencyKey);
        if (dteDocument && dteDocument.storeID === storeID) {
          await this.runInTransaction(async (manager) => {
            const guide = await loadDispatchGuideForUpdate(
              manager,
              dispatchGuideID,
              storeID,
            );
            if (guide.dteDocumentID == null) {
              guide.dteDocumentID = dteDocument.dteDocumentID;
              await manager.save(guide);
            }
          });
        }
      }

      return this.findOne(dispatchGuideID, storeID);
    }
  }

  async findAll(storeID: string, query: ListDispatchGuidesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const { dispatchGuides, total } = await this.runInTransaction((manager) =>
      listDispatchGuides(manager, storeID, query),
    );

    return {
      dispatchGuides: dispatchGuides.map((guide) => toDispatchGuideView(guide)),
      meta: { page, limit, total },
    };
  }

  async findOne(
    dispatchGuideID: string,
    storeID: string,
  ): Promise<DispatchGuideView> {
    return this.runInTransaction(async (manager) =>
      toDispatchGuideView(
        await loadDispatchGuide(manager, dispatchGuideID, storeID),
      ),
    );
  }

  async reconcile(
    dispatchGuideID: string,
    storeID: string,
  ): Promise<DispatchGuideView> {
    const current = await this.runInTransaction((manager) =>
      loadDispatchGuide(manager, dispatchGuideID, storeID),
    );

    if (current.status === DispatchGuideStatus.EMITIDA) {
      return toDispatchGuideView(current);
    }
    if (current.status === DispatchGuideStatus.ANULADA) {
      throw new BadRequestException(
        'Una guía de despacho anulada no puede reconciliarse',
      );
    }
    if (!current.payloadRaw) {
      throw new BadRequestException(
        'La guía de despacho no tiene payload DTE para reintentar',
      );
    }

    const dto = current.payloadRaw as unknown as CreateDteDocumentDto;

    try {
      const dteResponse =
        current.dteDocumentID &&
        current.dteDocument?.status === DteDocumentStatus.PENDIENTE
          ? await this.dteService.reconcile(current.dteDocumentID, storeID)
          : await this.dteService.create(
              storeID,
              current.idempotencyKey ?? undefined,
              dto,
              {
                reserveStock: true,
                reserveReason: InventoryMovementReason.DISPATCH_GUIDE,
              },
            );

      return this.withDteResponse(dispatchGuideID, storeID, dteResponse);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.runInTransaction(async (manager) => {
        const guide = await loadDispatchGuideForUpdate(
          manager,
          dispatchGuideID,
          storeID,
        );
        guide.errorDetail = detail;
        await manager.save(guide);
      });
      throw error;
    }
  }

  async anular(
    dispatchGuideID: string,
    storeID: string,
  ): Promise<DispatchGuideView> {
    const current = await this.runInTransaction((manager) =>
      loadDispatchGuide(manager, dispatchGuideID, storeID),
    );

    if (current.status === DispatchGuideStatus.ANULADA) {
      return toDispatchGuideView(current);
    }
    assertCanAnular(current.status);

    if (!current.folio) {
      throw new BadRequestException(
        'La guía de despacho no tiene folio SII para anular',
      );
    }
    if (!current.dteDocumentID) {
      throw new BadRequestException(
        'La guía de despacho no tiene documento DTE asociado',
      );
    }

    const hasReferences = await this.runInTransaction((manager) =>
      manager.getRepository(DispatchGuideReference).count({
        where: { dispatchGuideID },
      }),
    );
    if (hasReferences > 0) {
      throw new BadRequestException(
        'La guía de despacho ya está referenciada por una factura/boleta y no puede anularse',
      );
    }

    const apikey = await this.storesService.resolveOpenfacturaKey(storeID);
    const result = await this.openfacturaClient.anularDte52(
      apikey,
      current.folio,
      toDateOnly(current.issueDate).toISOString().slice(0, 10),
    );
    if (!result.ok) {
      throw new BadGatewayException(
        `No se pudo anular la guía de despacho en Openfactura: ${result.errorDetail}`,
      );
    }

    await this.runInTransaction(async (manager) => {
      const guide = await loadDispatchGuideForUpdate(
        manager,
        dispatchGuideID,
        storeID,
      );
      assertCanAnular(guide.status);

      const referenceCount = await manager
        .getRepository(DispatchGuideReference)
        .count({ where: { dispatchGuideID } });
      if (referenceCount > 0) {
        throw new BadRequestException(
          'La guía de despacho ya está referenciada por una factura/boleta y no puede anularse',
        );
      }

      guide.status = DispatchGuideStatus.ANULADA;
      guide.errorDetail = null;

      if (guide.dteDocumentID) {
        await this.inventoryService.revertReservedStock(
          manager,
          storeID,
          guide.items.map((item) => ({
            variationID: item.variationID,
            QtyItem: item.quantity,
          })),
          guide.dteDocumentID,
          this.tenantContext?.getTenantId() ?? guide.tenantID,
          (variationID) => {
            this.logger.error(
              `No se pudo revertir stock de la guía ${guide.dispatchGuideID}: StoreProduct no encontrado para variationID=${variationID}`,
            );
          },
        );
      }

      await manager.save(guide);
    });

    return this.findOne(dispatchGuideID, storeID);
  }

  private async withDteResponse(
    dispatchGuideID: string,
    storeID: string,
    dteResponse: DteDocumentResponseDto,
  ): Promise<DispatchGuideView> {
    const view = await this.findOne(dispatchGuideID, storeID);
    return { ...view, dte: dteResponse };
  }

  private async onDteFinalized(
    manager: EntityManager,
    document: DteDocument,
  ): Promise<void> {
    if (document.status !== DteDocumentStatus.EMITIDO) return;

    const guides = await manager.getRepository(DispatchGuide).find({
      where: [
        { dteDocumentID: document.dteDocumentID },
        { idempotencyKey: document.idempotencyKey ?? '' },
      ],
    });

    for (const guide of guides) {
      const locked = await loadDispatchGuideForUpdate(
        manager,
        guide.dispatchGuideID,
      );
      if (locked.status === DispatchGuideStatus.EMITIDA) continue;
      if (locked.status !== DispatchGuideStatus.PENDIENTE) continue;

      locked.status = DispatchGuideStatus.EMITIDA;
      locked.dteDocumentID = locked.dteDocumentID ?? document.dteDocumentID;
      locked.folio = document.folio;
      locked.errorDetail = null;
      await manager.save(locked);
    }
  }
}
