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
import {
  CreateDteDocumentDto,
  DteReferenciaDto,
} from '../dte/dto/create-dte-document.dto';
import { OpenfacturaClientService } from '../dte/openfactura-client.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { PricingService } from '../pricing/pricing.service';
import { StoresService } from '../stores/stores.service';
import { ClientsService } from '../clients/clients.service';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { CreateDispatchGuideDto } from './dto/create-dispatch-guide.dto';
import { ListDispatchGuidesQueryDto } from './dto/list-dispatch-guides.query.dto';
import { InvoiceDispatchGuidesDto } from './dto/invoice-dispatch-guides.dto';
import {
  DispatchGuide,
  DispatchGuideStatus,
} from './entities/dispatch-guide.entity';
import { DispatchGuideItem } from './entities/dispatch-guide-item.entity';
import { DispatchGuideReference } from './entities/dispatch-guide-reference.entity';
import { DispatchGuideReferenceItem } from './entities/dispatch-guide-reference-item.entity';
import { DispatchGuideDteMapperService } from './dispatch-guide-dte-mapper.service';
import { DispatchGuideInvoiceMapperService } from './dispatch-guide-invoice-mapper.service';
import {
  assertCanAnular,
  assertCanConfirmAnulacion,
  assertCanReference,
  buildPreparedDispatchGuide,
  buildPreparedDispatchGuideWithoutPrices,
  computeGuideTotalsFromItems,
  planConsumption,
  toDateOnly,
} from './dispatch-guides-engine';
import {
  createDispatchGuideEntity,
  createDispatchGuideItems,
  findDispatchGuideByIdempotencyKey,
  findDispatchGuideReferenceItems,
  findEmittedDispatchGuidesForUpdate,
  findStoreById,
  findStoreProductsForGuide,
  listDispatchGuides,
  loadDispatchGuide,
  loadDispatchGuideForUpdate,
} from './dispatch-guides-repository.helpers';
import { toDispatchGuideView } from './dispatch-guides-view.mapper';
import { DispatchGuideView } from './dispatch-guides.types';
import { TenantAbility } from '../auth/ability/ability.factory';
import { PermissionScope } from '../roles/entities/role-permission.entity';
import { AbilityFactory } from '../auth/ability/ability.factory';

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
    private readonly dispatchGuideInvoiceMapperService: DispatchGuideInvoiceMapperService,
    private readonly inventoryService: InventoryService,
    private readonly storesService: StoresService,
    private readonly openfacturaClient: OpenfacturaClientService,
    @Optional() private readonly clientsService?: ClientsService,
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
    impersonatedBy?: string,
  ): Promise<DispatchGuideView> {
    const ownerId =
      userId ??
      (this.abilityFactory
        ? await this.abilityFactory.getSystemUserId()
        : undefined);
    const { dispatchGuideID, dteDto, reserveStock } =
      await this.runInTransaction(async (manager) => {
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

        const tenantID = this.tenantContext?.getTenantId() ?? store.tenantID;
        let receiver = dto.receiver;
        let clientID = dto.clientID ?? null;

        if (this.clientsService) {
          if (clientID && !receiver) {
            const client = await this.clientsService.findOne(clientID);
            receiver = {
              rut: client.rut,
              name: client.name,
              giro: client.giro ?? undefined,
              address: client.address ?? undefined,
              city: client.city ?? undefined,
              email: client.email ?? undefined,
            };
          }

          if (receiver?.rut && tenantID) {
            const client = await this.clientsService.findOrCreate(
              tenantID,
              receiver,
              manager,
            );
            if (client) {
              clientID = client.clientID;
              receiver = {
                rut: client.rut,
                name: client.name,
                giro: client.giro ?? undefined,
                address: client.address ?? undefined,
                city: client.city ?? undefined,
                email: client.email ?? undefined,
              };
            }
          }
        }

        const includePrices = dto.includePrices ?? true;
        let prepared;
        const dtoWithResolvedReceiver = {
          ...dto,
          ...(receiver ? { receiver } : {}),
        };
        if (includePrices) {
          const pricing = await this.pricingService.calculateCart({
            storeID,
            items: dto.items.map((item) => ({
              storeProductID: item.storeProductID,
              quantity: item.quantity,
            })),
            userID: ownerId!,
            ...(dto.manualDiscount !== undefined && dto.manualDiscount > 0
              ? { manualDiscount: dto.manualDiscount }
              : {}),
            pricingDate: toDateOnly(dto.issueDate ?? new Date()),
          });
          prepared = buildPreparedDispatchGuide(
            dtoWithResolvedReceiver as CreateDispatchGuideDto,
            pricing,
          );
        } else {
          const resolvedItems = await findStoreProductsForGuide(
            manager,
            storeID,
            dto.items,
          );
          prepared = buildPreparedDispatchGuideWithoutPrices(
            dtoWithResolvedReceiver as CreateDispatchGuideDto,
            resolvedItems,
          );
        }
        let referencedDte: DteDocument | null = null;
        let dteReferences: DteReferenciaDto[] | undefined;
        if (dto.referencedDteDocumentID) {
          referencedDte = await manager.getRepository(DteDocument).findOne({
            where: { dteDocumentID: dto.referencedDteDocumentID, storeID },
          });
          if (!referencedDte) {
            throw new BadRequestException(
              `El documento DTE referenciado ${dto.referencedDteDocumentID} no existe en la tienda`,
            );
          }
          if (referencedDte.status !== DteDocumentStatus.EMITIDO) {
            throw new BadRequestException(
              `El documento DTE referenciado debe estar en estado EMITIDO (actual: ${referencedDte.status})`,
            );
          }
          if (!referencedDte.folio) {
            throw new BadRequestException(
              'El documento DTE referenciado no tiene folio SII asignado',
            );
          }

          const docType = (referencedDte.documentType ?? 33) as
            | 33
            | 39
            | 41
            | 52;
          const docName = docType === 39 ? 'Boleta' : 'Factura';
          dteReferences = [
            {
              NroLinRef: 1,
              TpoDocRef: docType,
              FolioRef: referencedDte.folio,
              FchRef: toDateOnly(referencedDte.issueDate)
                .toISOString()
                .slice(0, 10),
              RazonRef: `Despacho por ${docName} #${referencedDte.folio}`,
            },
          ];
        }

        const reserveStock = referencedDte
          ? !referencedDte.stockReserved
          : true;

        const dteDto = this.dispatchGuideDteMapperService.mapDispatchGuideToDte(
          {
            issueDate: prepared.issueDate,
            indTraslado: prepared.indTraslado,
            includePrices: prepared.includePrices,
            receiver: prepared.receiver,
            destination: prepared.destination,
            transport: prepared.transport,
            items: prepared.items,
            store,
            references: dteReferences,
          },
        );

        const dispatchGuideID = randomUUID();
        const guide = createDispatchGuideEntity(manager, {
          dispatchGuideID,
          tenantID,
          storeID,
          userID: ownerId!,
          impersonatedBy: impersonatedBy ?? null,
          idempotencyKey: idempotencyKey ?? null,
          clientID,
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
            reserveStock: true,
            referencedDteID: null,
            referencedSaleID: null,
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

        if (referencedDte) {
          await manager.save(
            manager.create(DispatchGuideReference, {
              tenantID,
              dispatchGuideID,
              dteDocumentID: referencedDte.dteDocumentID,
              saleID: referencedDte.saleID ?? null,
            }),
          );
        }

        return {
          dispatchGuideID,
          dteDto,
          existing: false,
          reserveStock,
          referencedDteID: referencedDte?.dteDocumentID ?? null,
          referencedSaleID: referencedDte?.saleID ?? null,
        };
      });

    if (dteDto === null) {
      return this.findOne(dispatchGuideID, storeID);
    }

    try {
      const dteResponse = await this.dteService.create(
        storeID,
        idempotencyKey,
        dteDto,
        {
          reserveStock,
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

  async findAll(
    storeID: string,
    query: ListDispatchGuidesQueryDto,
    userId?: string,
    ability?: TenantAbility,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const { dispatchGuides, total } = await this.runInTransaction((manager) =>
      listDispatchGuides(
        manager,
        storeID,
        query,
        userId && ability
          ? {
              scope:
                ability.scopeFor('dispatch-guides:read') ?? PermissionScope.ALL,
              ownerId: userId,
            }
          : undefined,
      ),
    );

    return {
      dispatchGuides: dispatchGuides.map((guide) => toDispatchGuideView(guide)),
      meta: { page, limit, total },
    };
  }

  async findOne(
    dispatchGuideID: string,
    storeID: string,
    userId?: string,
    ability?: TenantAbility,
  ): Promise<DispatchGuideView> {
    return this.runInTransaction(async (manager) =>
      toDispatchGuideView(
        await loadDispatchGuide(
          manager,
          dispatchGuideID,
          storeID,
          userId && ability
            ? {
                scope:
                  ability.scopeFor('dispatch-guides:read') ??
                  PermissionScope.ALL,
                ownerId: userId,
              }
            : undefined,
        ),
      ),
    );
  }

  async reconcile(
    dispatchGuideID: string,
    storeID: string,
    userId?: string,
    ability?: TenantAbility,
  ): Promise<DispatchGuideView> {
    const current = await this.runInTransaction((manager) =>
      loadDispatchGuide(manager, dispatchGuideID, storeID),
    );
    if (
      userId &&
      ability &&
      !ability.can('dispatch-guides:reconcile', current.userID, userId)
    ) {
      throw new BadRequestException('La guía de despacho no está disponible');
    }

    if (current.status === DispatchGuideStatus.EMITIDA) {
      return toDispatchGuideView(current);
    }
    if (current.status === DispatchGuideStatus.ANULADA) {
      throw new BadRequestException(
        'Una guía de despacho anulada no puede reconciliarse',
      );
    }
    if (current.status === DispatchGuideStatus.ANULACION_PENDIENTE) {
      if (!current.folio || !current.dteDocumentID) {
        throw new BadRequestException(
          'La guía de despacho no tiene folio SII o documento DTE asociado para completar su anulación',
        );
      }

      const apikey = await this.storesService.resolveOpenfacturaKey(storeID);
      const result = await this.openfacturaClient.anularDte52(
        apikey,
        current.folio,
        toDateOnly(current.issueDate).toISOString().slice(0, 10),
      );
      if (!result.ok) {
        await this.runInTransaction(async (manager) => {
          const guide = await loadDispatchGuideForUpdate(
            manager,
            dispatchGuideID,
            storeID,
          );
          if (guide.status === DispatchGuideStatus.ANULACION_PENDIENTE) {
            guide.errorDetail = result.errorDetail;
            await manager.save(guide);
          }
        });
        throw new BadGatewayException(
          `No se pudo completar la anulación de la guía de despacho en Openfactura: ${result.errorDetail}`,
        );
      }

      await this.confirmAnulacion(dispatchGuideID, storeID);
      return this.findOne(dispatchGuideID, storeID);
    }
    const items = (current.items ?? []).map((item) => ({
      storeProductID: item.storeProductID,
      variationID: item.variationID,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
      lineTotal: Number(item.lineTotal),
      baseTotal: Number(item.lineTotal),
    }));

    const dto = this.dispatchGuideDteMapperService.mapDispatchGuideToDte({
      issueDate: current.issueDate,
      indTraslado: current.indTraslado,
      includePrices: current.includePrices,
      receiver: current.receiver,
      destination: current.destination,
      transport: current.transport,
      items,
      store: current.store,
    });

    // Los montos persistidos se recalculan desde el detalle antes de reenviar,
    // de modo que la guía, el payload y el DTE queden matemáticamente cuadrados.
    const totals = current.includePrices
      ? computeGuideTotalsFromItems(items)
      : { netTotal: 0, taxTotal: 0, total: 0 };

    await this.runInTransaction(async (manager) => {
      const guide = await loadDispatchGuideForUpdate(
        manager,
        dispatchGuideID,
        storeID,
      );
      guide.payloadRaw = dto as unknown as Record<string, unknown>;
      guide.netTotal = totals.netTotal;
      guide.taxTotal = totals.taxTotal;
      guide.total = totals.total;
      await manager.save(guide);
    });

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
    userId?: string,
    ability?: TenantAbility,
  ): Promise<DispatchGuideView> {
    const current = await this.runInTransaction((manager) =>
      loadDispatchGuide(manager, dispatchGuideID, storeID),
    );
    if (
      userId &&
      ability &&
      !ability.can('dispatch-guides:anular', current.userID, userId)
    ) {
      throw new BadRequestException('La guía de despacho no está disponible');
    }

    if (current.status === DispatchGuideStatus.ANULADA) {
      return toDispatchGuideView(current);
    }
    if (current.status === DispatchGuideStatus.ANULACION_PENDIENTE) {
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

      guide.status = DispatchGuideStatus.ANULACION_PENDIENTE;
      guide.errorDetail = null;
      await manager.save(guide);
    });

    const apikey = await this.storesService.resolveOpenfacturaKey(storeID);
    const result = await this.openfacturaClient.anularDte52(
      apikey,
      current.folio,
      toDateOnly(current.issueDate).toISOString().slice(0, 10),
    );
    if (!result.ok) {
      await this.runInTransaction(async (manager) => {
        const guide = await loadDispatchGuideForUpdate(
          manager,
          dispatchGuideID,
          storeID,
        );
        if (guide.status === DispatchGuideStatus.ANULACION_PENDIENTE) {
          guide.errorDetail = result.errorDetail;
          await manager.save(guide);
        }
      });
      throw new BadGatewayException(
        `No se pudo anular la guía de despacho en Openfactura: ${result.errorDetail}`,
      );
    }

    await this.confirmAnulacion(dispatchGuideID, storeID);

    return this.findOne(dispatchGuideID, storeID);
  }

  async invoiceGuides(
    storeID: string,
    primaryDispatchGuideID: string,
    dto: InvoiceDispatchGuidesDto,
    userId?: string,
    impersonatedBy?: string,
    idempotencyKey?: string,
    ability?: TenantAbility,
  ): Promise<DteDocumentResponseDto> {
    const guideIDs = Array.from(
      new Set([
        primaryDispatchGuideID,
        ...(dto.additionalDispatchGuideIDs ?? []),
      ]),
    );

    const { dteDto, cogsTotal, consumptionPlan, tenantID } =
      await this.runInTransaction(async (manager) => {
        const store = await findStoreById(manager, storeID);
        if (!store.hasOpenfacturaKey) {
          throw new BadRequestException(
            'La tienda no tiene configurada la API key de Openfactura. No es posible emitir facturas.',
          );
        }

        const tenant = this.tenantContext?.getTenantId() ?? store.tenantID;

        const guides = await findEmittedDispatchGuidesForUpdate(
          manager,
          storeID,
          guideIDs,
        );

        if (guides.length !== guideIDs.length) {
          throw new BadRequestException(
            'Una o más guías de despacho no existen, no pertenecen a la tienda o no están en estado EMITIDA',
          );
        }

        for (const guide of guides) {
          if (
            userId &&
            ability &&
            !ability.can('dispatch-guides:write', guide.userID, userId)
          ) {
            throw new BadRequestException(
              `Sin autorización para facturar la guía de despacho ${guide.dispatchGuideID}`,
            );
          }
          assertCanReference(guide);
        }

        const { dteDto, consolidatedItems, cogsTotal } =
          this.dispatchGuideInvoiceMapperService.mapGuidesToInvoice(
            guides,
            store,
            dto,
          );

        const consumedItems = await findDispatchGuideReferenceItems(
          manager,
          guideIDs,
        );

        const consumptionPlan = planConsumption(
          guides,
          consumedItems,
          consolidatedItems.map((item) => ({
            variationID: item.variationID,
            quantity: item.quantity,
          })),
        );

        return {
          dteDto,
          cogsTotal,
          consumptionPlan,
          tenantID: tenant,
        };
      });

    const dteResponse = await this.dteService.create(
      storeID,
      idempotencyKey,
      dteDto,
      {
        reserveStock: false,
        paymentType: dto.paymentType,
        cogsTotalOverride: cogsTotal,
      },
    );

    await this.runInTransaction(async (manager) => {
      const savedReferences = await manager.save(
        guideIDs.map((dispatchGuideID) =>
          manager.create(DispatchGuideReference, {
            tenantID,
            dispatchGuideID,
            dteDocumentID: dteResponse.dteDocumentID,
            saleID: null,
          }),
        ),
      );

      const referenceIDByGuide = new Map(
        savedReferences.map((ref) => [
          ref.dispatchGuideID,
          ref.dispatchGuideReferenceID,
        ]),
      );

      await manager.save(
        consumptionPlan.map((allocation) =>
          manager.create(DispatchGuideReferenceItem, {
            tenantID,
            dispatchGuideReferenceID: referenceIDByGuide.get(
              allocation.dispatchGuideID,
            )!,
            dispatchGuideID: allocation.dispatchGuideID,
            variationID: allocation.variationID,
            quantity: allocation.quantity,
          }),
        ),
      );
    });

    return dteResponse;
  }

  private async confirmAnulacion(
    dispatchGuideID: string,
    storeID: string,
  ): Promise<void> {
    await this.runInTransaction(async (manager) => {
      const guide = await loadDispatchGuideForUpdate(
        manager,
        dispatchGuideID,
        storeID,
      );
      if (guide.status === DispatchGuideStatus.ANULADA) return;
      assertCanConfirmAnulacion(guide.status);

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
