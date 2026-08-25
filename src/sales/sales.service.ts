import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PricingService } from '../pricing/pricing.service';
import { DteService } from '../dte/dte.service';
import { DteMapperService } from './dte-mapper.service';
import { DteDocumentStatus } from '../dte/entities/dte-document.entity';
import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { FinancialMovementsService } from '../financial-movements/financial-movements.service';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { InventoryService } from '../inventory/inventory.service';
import { DispatchGuide } from '../dispatch-guides/entities/dispatch-guide.entity';
import { DispatchGuideReference } from '../dispatch-guides/entities/dispatch-guide-reference.entity';
import { DispatchGuideReferenceItem } from '../dispatch-guides/entities/dispatch-guide-reference-item.entity';
import {
  findDispatchGuideReferenceItems,
  findEmittedDispatchGuidesForUpdate,
} from '../dispatch-guides/dispatch-guides-repository.helpers';
import {
  assertCanReference,
  DispatchGuideConsumptionItem,
  planConsumption,
} from '../dispatch-guides/dispatch-guides-engine';
import { Sale, SaleStatus, SaleType } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SaleFolioCounter } from './entities/sale-folio-counter.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales.query.dto';
import { ConvertSaleDto } from './dto/convert-sale.dto';
import {
  buildPreparedSale,
  createSaleId,
  resolveConversionDocumentType,
  toDateOnly,
  toDtePaymentType,
  validateFacturaReceiver,
  validateStoreDteCapability,
} from './sales-engine';
import {
  createSaleEntity,
  createSaleItems,
  findSaleByIdempotencyKey,
  findSaleForConversion,
  findStoreById,
  listSales,
  loadSale,
  nextSaleFolio,
} from './sales-repository.helpers';
import { toSaleView } from './sales-view.mapper';
import { PreparedSale } from './sales.types';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepository: Repository<SaleItem>,
    @InjectRepository(SaleFolioCounter)
    private readonly saleFolioCounterRepository: Repository<SaleFolioCounter>,
    private readonly dataSource: DataSource,
    private readonly pricingService: PricingService,
    private readonly dteService: DteService,
    private readonly dteMapperService: DteMapperService,
    private readonly financialMovementsService: FinancialMovementsService,
    private readonly inventoryService: InventoryService,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
  ) {}

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

  private async prepareSale(
    manager: EntityManager,
    storeID: string,
    dto: CreateSaleDto,
    userId?: string,
  ) {
    const store = await findStoreById(manager, storeID);
    validateStoreDteCapability(store, dto.saleType);
    validateFacturaReceiver(dto.saleType, dto.receiver);

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

    return buildPreparedSale(dto, pricing);
  }

  async create(
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateSaleDto,
    userId?: string,
  ) {
    if (dto.saleType === SaleType.NOTA_VENTA && dto.dispatchGuideIDs?.length) {
      throw new BadRequestException(
        'Las guías de despacho solo pueden referenciarse en boletas o facturas electrónicas',
      );
    }
    if (dto.saleType === SaleType.NOTA_VENTA) {
      return this.createNotaVenta(storeID, idempotencyKey, dto, userId);
    }
    return this.createElectronicSale(storeID, idempotencyKey, dto, userId);
  }

  private async createNotaVenta(
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateSaleDto,
    userId?: string,
  ) {
    return this.runInTransaction(async (manager) => {
      if (idempotencyKey) {
        const existing = await findSaleByIdempotencyKey(
          manager,
          idempotencyKey,
        );
        if (existing) {
          if (existing.storeID !== storeID) {
            throw new BadRequestException(
              'La Idempotency-Key ya fue utilizada en otra tienda',
            );
          }
          return toSaleView(await loadSale(manager, existing.saleID));
        }
      }

      const prepared = await this.prepareSale(manager, storeID, dto, userId);
      const tenantID = this.tenantContext?.getTenantId();
      const saleID = createSaleId();
      const folio = await nextSaleFolio(manager, storeID, tenantID);

      const sale = createSaleEntity(manager, {
        saleID,
        tenantID,
        storeID,
        userID: userId ?? null,
        saleType: SaleType.NOTA_VENTA,
        status: SaleStatus.EMITIDA,
        paymentType: prepared.paymentType,
        folio,
        issueDate: prepared.issueDate,
        receiver: prepared.receiver,
        subtotal: prepared.subtotal,
        discount: prepared.discount,
        netTotal: prepared.netTotal,
        taxTotal: prepared.taxTotal,
        total: prepared.total,
        cogsTotal: prepared.cogsTotal,
        idempotencyKey: idempotencyKey ?? null,
      });

      await manager.save(sale);

      await this.inventoryService.reserveStock(
        manager,
        storeID,
        prepared.items.map((item) => ({
          variationID: item.variationID,
          QtyItem: item.quantity,
        })),
        saleID,
        tenantID,
      );

      await manager.save(
        createSaleItems(manager, tenantID, saleID, prepared.items),
      );

      await this.financialMovementsService.recordSaleNote(manager, {
        saleID,
        tenantID: tenantID ?? sale.tenantID,
        storeID,
        issueDate: sale.issueDate,
        netTotal: sale.netTotal,
        taxTotal: sale.taxTotal,
        cogsTotal: sale.cogsTotal,
      });

      return toSaleView(await loadSale(manager, saleID));
    });
  }

  private async createElectronicSale(
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateSaleDto,
    userId?: string,
  ) {
    if (idempotencyKey) {
      const existing = await this.runInTransaction((manager) =>
        findSaleByIdempotencyKey(manager, idempotencyKey),
      );
      if (existing) {
        if (existing.storeID !== storeID) {
          throw new BadRequestException(
            'La Idempotency-Key ya fue utilizada en otra tienda',
          );
        }
        const loaded = await this.runInTransaction((manager) =>
          loadSale(manager, existing.saleID),
        );
        return toSaleView(loaded);
      }
    }

    const prepared = await this.runInTransaction((manager) =>
      this.prepareSale(manager, storeID, dto, userId),
    );
    const documentType = dto.saleType === SaleType.FACTURA ? 33 : 39;
    const store = await this.runInTransaction((manager) =>
      findStoreById(manager, storeID),
    );

    let dispatchGuides: DispatchGuide[] = [];
    if (dto.dispatchGuideIDs?.length) {
      dispatchGuides = await this.runInTransaction((manager) =>
        this.loadDispatchGuidesForSale(
          manager,
          storeID,
          dto.dispatchGuideIDs!,
          prepared.items,
        ),
      );
    }

    const references = dispatchGuides.map((guide, index) => ({
      NroLinRef: index + 1,
      TpoDocRef: 52 as const,
      FolioRef: guide.folio ?? 0,
      FchRef: new Date(guide.issueDate).toISOString().slice(0, 10),
      RazonRef: 'Guía de despacho',
    }));

    const dteDto = this.dteMapperService.mapSaleToDte(
      {
        saleType: prepared.saleType,
        paymentType: prepared.paymentType,
        issueDate: prepared.issueDate,
        receiver: prepared.receiver,
        items: prepared.items,
        total: prepared.total,
        netTotal: prepared.netTotal,
        taxTotal: prepared.taxTotal,
        store,
      },
      {
        documentType,
        ...(references.length ? { references } : {}),
      },
    );

    const dteResponse = await this.dteService.create(
      storeID,
      idempotencyKey,
      dteDto,
      {
        reserveStock: dto.dispatchGuideIDs?.length ? false : true,
        ...(dto.dispatchGuideIDs?.length
          ? { cogsTotalOverride: prepared.cogsTotal }
          : {}),
        paymentType: toDtePaymentType(prepared.paymentType),
      },
    );

    const sale = await this.persistElectronicSale(
      storeID,
      idempotencyKey,
      dto,
      prepared,
      dteResponse,
      userId,
    );

    return toSaleView(sale, dteResponse);
  }

  private async persistElectronicSale(
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateSaleDto,
    prepared: PreparedSale,
    dteResponse: DteDocumentResponseDto,
    userId?: string,
  ): Promise<Sale> {
    return this.runInTransaction(async (manager) => {
      if (idempotencyKey) {
        const existing = await findSaleByIdempotencyKey(
          manager,
          idempotencyKey,
        );
        if (existing) {
          if (existing.storeID !== storeID) {
            throw new BadRequestException(
              'La Idempotency-Key ya fue utilizada en otra tienda',
            );
          }
          return loadSale(manager, existing.saleID);
        }
      }

      const tenantID = this.tenantContext?.getTenantId();
      const saleID = createSaleId();
      const sale = createSaleEntity(manager, {
        saleID,
        tenantID,
        storeID,
        userID: userId ?? null,
        saleType: dto.saleType,
        status: SaleStatus.EMITIDA,
        paymentType: prepared.paymentType,
        folio: dteResponse.FOLIO ?? null,
        issueDate: prepared.issueDate,
        receiver: prepared.receiver,
        subtotal: prepared.subtotal,
        discount: prepared.discount,
        netTotal: prepared.netTotal,
        taxTotal: prepared.taxTotal,
        total: prepared.total,
        cogsTotal: prepared.cogsTotal,
        dteDocumentID: dteResponse.dteDocumentID,
        idempotencyKey: idempotencyKey ?? null,
      });

      try {
        await manager.save(sale);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (!idempotencyKey) throw error;
        const concurrent = await findSaleByIdempotencyKey(
          manager,
          idempotencyKey,
        );
        if (!concurrent) throw error;
        if (concurrent.storeID !== storeID) {
          throw new BadRequestException(
            'La Idempotency-Key ya fue utilizada en otra tienda',
          );
        }
        return loadSale(manager, concurrent.saleID);
      }

      await manager.save(
        createSaleItems(manager, tenantID, saleID, prepared.items),
      );

      if (dto.dispatchGuideIDs?.length) {
        const consumptionPlan = await this.planConsumptionForGuides(
          manager,
          storeID,
          dto.dispatchGuideIDs,
          prepared.items,
        );
        const savedReferences = await manager.save(
          dto.dispatchGuideIDs.map((dispatchGuideID) =>
            manager.create(DispatchGuideReference, {
              tenantID,
              dispatchGuideID,
              dteDocumentID: dteResponse.dteDocumentID,
              saleID,
            }),
          ),
        );
        const referenceIDByGuide = new Map(
          savedReferences.map((reference) => [
            reference.dispatchGuideID,
            reference.dispatchGuideReferenceID,
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
      }

      return loadSale(manager, saleID);
    });
  }

  private async loadDispatchGuidesForSale(
    manager: EntityManager,
    storeID: string,
    dispatchGuideIDs: string[],
    saleItems?: PreparedSale['items'],
  ): Promise<DispatchGuide[]> {
    const guides = await findEmittedDispatchGuidesForUpdate(
      manager,
      storeID,
      dispatchGuideIDs,
    );
    if (guides.length !== dispatchGuideIDs.length) {
      throw new BadRequestException(
        'Una o más guías de despacho no existen, no pertenecen a la tienda o no están EMITIDA',
      );
    }
    for (const guide of guides) {
      assertCanReference(guide);
    }
    if (saleItems) {
      const consumedItems = await findDispatchGuideReferenceItems(
        manager,
        dispatchGuideIDs,
      );
      planConsumption(guides, consumedItems, saleItems);
    }
    return guides;
  }

  private async planConsumptionForGuides(
    manager: EntityManager,
    storeID: string,
    dispatchGuideIDs: string[],
    saleItems: PreparedSale['items'],
  ): Promise<DispatchGuideConsumptionItem[]> {
    const guides = await this.loadDispatchGuidesForSale(
      manager,
      storeID,
      dispatchGuideIDs,
    );
    const consumedItems = await findDispatchGuideReferenceItems(
      manager,
      dispatchGuideIDs,
    );
    return planConsumption(guides, consumedItems, saleItems);
  }

  async findAll(storeID: string, query: ListSalesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const { sales, total } = await this.runInTransaction((manager) =>
      listSales(manager, storeID, query),
    );

    return {
      sales: sales.map((sale) => toSaleView(sale)),
      meta: { page, limit, total },
    };
  }

  async findOne(saleID: string, storeID: string) {
    return this.runInTransaction(async (manager) => {
      const sale = await loadSale(manager, saleID, storeID);
      return toSaleView(sale);
    });
  }

  async convert(saleID: string, storeID: string, dto?: ConvertSaleDto) {
    const sale = await this.runInTransaction((manager) =>
      loadSale(manager, saleID, storeID),
    );

    if (sale.saleType !== SaleType.NOTA_VENTA) {
      throw new BadRequestException(
        'Solo las notas de venta pueden convertirse a DTE',
      );
    }
    if (sale.status === SaleStatus.CONVERTIDA) {
      return toSaleView(sale);
    }
    if (sale.status !== SaleStatus.EMITIDA) {
      throw new BadRequestException(
        `Venta en estado ${String(sale.status)} no puede convertirse`,
      );
    }
    if (sale.dteDocument?.status === DteDocumentStatus.EMITIDO) {
      return this.finishConversion(saleID, storeID);
    }

    const store = await this.runInTransaction((manager) =>
      findStoreById(manager, storeID),
    );
    if (!store.hasOpenfacturaKey) {
      throw new BadRequestException(
        'La tienda no tiene configurada la API key de Openfactura. No es posible convertir notas de venta a DTE.',
      );
    }

    const documentType = resolveConversionDocumentType(sale, dto);

    const dteDto = this.dteMapperService.mapSaleToDte(sale, { documentType });
    const dteResponse = await this.dteService.create(storeID, saleID, dteDto, {
      reserveStock: false,
      saleID,
      paymentType: toDtePaymentType(sale.paymentType),
    });

    if (dteResponse.STATUS === 'PENDIENTE') {
      const reconciled = await this.dteService.reconcile(
        dteResponse.dteDocumentID,
        storeID,
      );
      if (reconciled.STATUS !== 'EMITIDO') {
        throw new BadGatewayException(
          `La conversión no quedó EMITIDA: ${reconciled.STATUS}`,
        );
      }
      return this.finishConversion(saleID, storeID, reconciled);
    }

    if (dteResponse.STATUS !== 'EMITIDO') {
      throw new BadGatewayException(
        `La conversión no quedó EMITIDA: ${String(dteResponse.STATUS)}`,
      );
    }

    return this.finishConversion(saleID, storeID, dteResponse);
  }

  private async finishConversion(
    saleID: string,
    storeID: string,
    dteResponse?: DteDocumentResponseDto,
  ) {
    return this.runInTransaction(async (manager) => {
      const sale = await findSaleForConversion(manager, saleID, storeID);
      if (!sale) {
        throw new NotFoundException(`Venta con ID ${saleID} no encontrada`);
      }
      if (sale.status === SaleStatus.CONVERTIDA) {
        return toSaleView(await loadSale(manager, saleID, storeID));
      }
      if (sale.status !== SaleStatus.EMITIDA) {
        throw new BadRequestException(
          `Venta en estado ${String(sale.status)} no puede convertirse`,
        );
      }

      const dteDocumentID = dteResponse?.dteDocumentID ?? sale.dteDocumentID;
      if (!dteDocumentID) {
        throw new InternalServerErrorException(
          'No se pudo asociar el DTE a la venta',
        );
      }

      sale.dteDocumentID = dteDocumentID;
      sale.status = SaleStatus.CONVERTIDA;
      if (dteResponse?.FOLIO) sale.folio = Number(dteResponse.FOLIO);
      await manager.save(sale);
      await this.financialMovementsService.removeSaleNote(manager, saleID);

      const updated = await loadSale(manager, saleID, storeID);
      return toSaleView(updated, dteResponse);
    });
  }
}
