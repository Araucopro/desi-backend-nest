import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Store } from '../stores/entities/store.entity';
import { PricingService } from '../pricing/pricing.service';
import { DteService } from '../dte/dte.service';
import { DteMapperService } from '../dte/dte-mapper.service';
import {
  DteDocument,
  DteDocumentStatus,
} from '../dte/entities/dte-document.entity';
import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { FinancialMovementsService } from '../financial-movements/financial-movements.service';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { reserveStockAndSnapshotCosts } from '../inventory/inventory-stock.helper';
import {
  Sale,
  SalePaymentType,
  SaleReceiver,
  SaleStatus,
  SaleType,
} from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SaleFolioCounter } from './entities/sale-folio-counter.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales.query.dto';
import { ConvertDocumentType, ConvertSaleDto } from './dto/convert-sale.dto';

const TAX_RATE = 0.19;

type PreparedSaleItem = {
  storeProductID: string;
  variationID: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
  baseTotal: number;
};

type PreparedSale = {
  saleType: SaleType;
  paymentType: SalePaymentType;
  issueDate: Date;
  receiver: SaleReceiver | null;
  items: PreparedSaleItem[];
  subtotal: number;
  discount: number;
  netTotal: number;
  taxTotal: number;
  total: number;
  cogsTotal: number;
};

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
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.dataSource.transaction(callback);
  }

  private toMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toDateOnly(value: string | Date): Date {
    const text =
      value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
    const date = new Date(`${text}T12:00:00`);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private isUniqueViolation(error: unknown): boolean {
    const code =
      (error as { code?: string })?.code ??
      (error as { driverError?: { code?: string } })?.driverError?.code;
    return code === '23505';
  }

  private async buildPreparedSale(
    manager: EntityManager,
    storeID: string,
    dto: CreateSaleDto,
    userId?: string,
  ): Promise<PreparedSale> {
    const store = await manager.findOne(Store, {
      where: { storeID },
    });
    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
    }

    if (
      dto.saleType === SaleType.FACTURA &&
      (!dto.receiver?.rut || !dto.receiver?.name)
    ) {
      throw new BadRequestException(
        'La factura requiere receptor con RUT y nombre',
      );
    }

    const pricing = await this.pricingService.calculateCart({
      storeID,
      items: dto.items.map((item) => ({
        storeProductID: item.storeProductID,
        quantity: item.quantity,
      })),
      userID: userId ?? null,
      pricingDate: this.toDateOnly(dto.issueDate ?? new Date()),
    });

    const items: PreparedSaleItem[] = pricing.items.map((item) => ({
      storeProductID: item.storeProductID,
      variationID: item.variationID,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.finalUnitPrice,
      unitCost: item.unitCost,
      lineTotal: item.lineTotal,
      baseTotal: item.basePrice,
    }));
    const cogsTotal = this.toMoney(
      items.reduce((acc, item) => acc + item.unitCost * item.quantity, 0),
    );

    const total = Math.round(
      items.reduce((acc, item) => acc + item.lineTotal, 0),
    );
    const subtotal = Math.round(
      items.reduce((acc, item) => acc + item.baseTotal, 0),
    );
    const discount = Math.max(subtotal - total, 0);
    const netTotal = Math.round(total / (1 + TAX_RATE));
    const taxTotal = total - netTotal;

    return {
      saleType: dto.saleType,
      paymentType: dto.paymentType,
      issueDate: this.toDateOnly(dto.issueDate ?? new Date()),
      receiver: dto.receiver ?? null,
      items,
      subtotal,
      discount,
      netTotal,
      taxTotal,
      total,
      cogsTotal,
    };
  }

  async create(
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateSaleDto,
    userId?: string,
  ) {
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
        const existing = await manager.getRepository(Sale).findOne({
          where: { idempotencyKey },
        });
        if (existing) {
          if (existing.storeID !== storeID) {
            throw new BadRequestException(
              'La Idempotency-Key ya fue utilizada en otra tienda',
            );
          }
          return this.toView(await this.loadSale(manager, existing.saleID));
        }
      }

      const prepared = await this.buildPreparedSale(
        manager,
        storeID,
        dto,
        userId,
      );
      const tenantID = this.tenantContext?.getTenantId();
      const saleID = randomUUID();
      const folio = await this.nextFolio(manager, storeID, tenantID);

      const sale = await manager.save(
        manager.create(Sale, {
          saleID,
          tenantID,
          store: { storeID },
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
        }),
      );

      await reserveStockAndSnapshotCosts(
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
        prepared.items.map((item) =>
          manager.create(SaleItem, {
            tenantID,
            sale: { saleID },
            storeProductID: item.storeProductID,
            variationID: item.variationID,
            productName: item.productName,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            lineTotal: item.lineTotal,
          }),
        ),
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

      return this.toView(await this.loadSale(manager, saleID));
    });
  }

  private async nextFolio(
    manager: EntityManager,
    storeID: string,
    tenantID: string | undefined,
  ): Promise<number> {
    let counter = await manager.findOne(SaleFolioCounter, {
      where: { storeID },
      lock: { mode: 'pessimistic_write' },
    });

    if (!counter) {
      try {
        counter = await manager.save(
          manager.create(SaleFolioCounter, {
            tenantID,
            storeID,
            currentFolio: 0,
          }),
        );
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
        counter = await manager.findOne(SaleFolioCounter, {
          where: { storeID },
          lock: { mode: 'pessimistic_write' },
        });
        if (!counter) throw error;
      }
    }

    counter.currentFolio += 1;
    await manager.save(counter);
    return counter.currentFolio;
  }

  private async createElectronicSale(
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateSaleDto,
    userId?: string,
  ) {
    if (idempotencyKey) {
      const existing = await this.runInTransaction((manager) =>
        manager.getRepository(Sale).findOne({
          where: { idempotencyKey },
        }),
      );
      if (existing) {
        if (existing.storeID !== storeID) {
          throw new BadRequestException(
            'La Idempotency-Key ya fue utilizada en otra tienda',
          );
        }
        const loaded = await this.runInTransaction((manager) =>
          this.loadSale(manager, existing.saleID),
        );
        return this.toView(loaded);
      }
    }

    const prepared = await this.runInTransaction((manager) =>
      this.buildPreparedSale(manager, storeID, dto, userId),
    );
    const documentType = dto.saleType === SaleType.FACTURA ? 33 : 39;
    const store = await this.runInTransaction((manager) =>
      manager.findOne(Store, { where: { storeID } }),
    );
    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
    }

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
      { documentType },
    );

    const dteResponse = await this.dteService.create(
      storeID,
      idempotencyKey,
      dteDto,
      { reserveStock: true },
    );

    const sale = await this.persistElectronicSale(
      storeID,
      idempotencyKey,
      dto,
      prepared,
      dteResponse,
      userId,
    );

    return this.toView(sale, dteResponse);
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
        const existing = await manager.getRepository(Sale).findOne({
          where: { idempotencyKey },
        });
        if (existing) {
          if (existing.storeID !== storeID) {
            throw new BadRequestException(
              'La Idempotency-Key ya fue utilizada en otra tienda',
            );
          }
          return this.loadSale(manager, existing.saleID);
        }
      }

      const tenantID = this.tenantContext?.getTenantId();
      const saleID = randomUUID();
      const sale = manager.create(Sale, {
        saleID,
        tenantID,
        store: { storeID },
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
        if (!this.isUniqueViolation(error)) throw error;
        const concurrent = await manager.getRepository(Sale).findOne({
          where: { idempotencyKey },
        });
        if (!concurrent) throw error;
        if (concurrent.storeID !== storeID) {
          throw new BadRequestException(
            'La Idempotency-Key ya fue utilizada en otra tienda',
          );
        }
        return this.loadSale(manager, concurrent.saleID);
      }

      await manager.save(
        prepared.items.map((item) =>
          manager.create(SaleItem, {
            tenantID,
            sale: { saleID },
            storeProductID: item.storeProductID,
            variationID: item.variationID,
            productName: item.productName,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            lineTotal: item.lineTotal,
          }),
        ),
      );

      return this.loadSale(manager, saleID);
    });
  }

  async findAll(storeID: string, query: ListSalesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    return this.runInTransaction(async (manager) => {
      const qb = manager
        .getRepository(Sale)
        .createQueryBuilder('sale')
        .leftJoinAndSelect('sale.items', 'items')
        .leftJoinAndSelect('sale.store', 'store')
        .leftJoinAndSelect('sale.dteDocument', 'dteDocument')
        .where('sale.storeID = :storeID', { storeID });

      if (query.saleType) {
        qb.andWhere('sale.saleType = :saleType', {
          saleType: query.saleType,
        });
      }
      if (query.status) {
        qb.andWhere('sale.status = :status', { status: query.status });
      }
      if (query.from) {
        qb.andWhere('sale.createdAt >= :from', { from: query.from });
      }
      if (query.to) {
        qb.andWhere('sale.createdAt < :to', { to: query.to });
      }

      const [sales, total] = await qb
        .orderBy('sale.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        sales: sales.map((sale) => this.toView(sale)),
        meta: { page, limit, total },
      };
    });
  }

  async findOne(saleID: string, storeID: string) {
    return this.runInTransaction(async (manager) => {
      const sale = await this.loadSale(manager, saleID, storeID);
      return this.toView(sale);
    });
  }

  async convert(saleID: string, storeID: string, dto?: ConvertSaleDto) {
    const sale = await this.runInTransaction((manager) =>
      this.loadSale(manager, saleID, storeID),
    );

    if (sale.saleType !== SaleType.NOTA_VENTA) {
      throw new BadRequestException(
        'Solo las notas de venta pueden convertirse a DTE',
      );
    }
    if (sale.status === SaleStatus.CONVERTIDA) {
      return this.toView(sale);
    }
    if (sale.status !== SaleStatus.EMITIDA) {
      throw new BadRequestException(
        `Venta en estado ${String(sale.status)} no puede convertirse`,
      );
    }
    if (sale.dteDocument?.status === DteDocumentStatus.EMITIDO) {
      return this.finishConversion(saleID, storeID);
    }

    const documentType =
      dto?.documentType === ConvertDocumentType.BOLETA
        ? 39
        : dto?.documentType === ConvertDocumentType.FACTURA
          ? 33
          : sale.receiver?.rut
            ? 33
            : 39;

    const dteDto = this.dteMapperService.mapSaleToDte(sale, { documentType });
    const dteResponse = await this.dteService.create(storeID, saleID, dteDto, {
      reserveStock: false,
      saleID,
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
      const sale = await manager.getRepository(Sale).findOne({
        where: { saleID, store: { storeID } },
        lock: { mode: 'pessimistic_write' },
        relations: ['dteDocument'],
      });
      if (!sale) {
        throw new NotFoundException(`Venta con ID ${saleID} no encontrada`);
      }
      if (sale.status === SaleStatus.CONVERTIDA) {
        return this.toView(await this.loadSale(manager, saleID, storeID));
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

      const updated = await this.loadSale(manager, saleID, storeID);
      return this.toView(
        updated,
        dteResponse ?? this.dteSummary(updated.dteDocument),
      );
    });
  }

  private async loadSale(
    manager: EntityManager,
    saleID: string,
    storeID?: string,
  ): Promise<Sale> {
    const sale = await manager.getRepository(Sale).findOne({
      where: storeID ? { saleID, store: { storeID } } : { saleID },
      relations: ['items', 'store', 'dteDocument'],
    });
    if (!sale) {
      throw new NotFoundException(`Venta con ID ${saleID} no encontrada`);
    }
    return sale;
  }

  private dteSummary(
    dte: DteDocument | null | undefined,
  ): DteDocumentResponseDto | null {
    if (!dte) return null;
    return {
      dteDocumentID: dte.dteDocumentID,
      TOKEN: dte.token,
      FOLIO: dte.folio,
      STATUS: dte.status,
      saleID: dte.saleID,
    };
  }

  private toView(
    sale: Sale,
    dteResponse?: DteDocumentResponseDto | null,
  ): { sale: Sale; dte: DteDocumentResponseDto | null } {
    return {
      sale,
      dte: dteResponse ?? this.dteSummary(sale.dteDocument),
    };
  }
}
