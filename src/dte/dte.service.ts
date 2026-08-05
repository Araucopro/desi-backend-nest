import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomInt } from 'crypto';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import {
  InventoryMovement,
  InventoryMovementReason,
} from '../inventory/entities/inventory-movement.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { Store } from '../stores/entities/store.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import {
  PurchaseOrder,
  PurchaseOrderCommercialStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import { CreateDteDocumentDto } from './dto/create-dte-document.dto';
import { DteDocumentResponseDto } from './dto/dte-document-response.dto';
import {
  DteDocument,
  DteDocumentPaymentType,
  DteDocumentStatus,
} from './entities/dte-document.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { FinancialMovementsService } from '../financial-movements/financial-movements.service';

const OPENFACTURA_TIMEOUT_MS = 15_000;
const LOCAL_TOKEN_PREFIX = 'local-';
const ERROR_DETAIL_PREVIEW_LIMIT = 300;
const BINARY_RESPONSE_KEYS = ['PDF', 'XML', 'TIMBRE'];

type NormalizedDteItem = {
  NroLinDet: number;
  NmbItem: string;
  QtyItem: number;
  PrcItem: number;
  MontoItem: number;
  costPrice: number;
  costTotal: number;
  variationID: string;
  sku?: string;
  productName?: string;
  resolvedByName?: boolean;
};

type OpenfacturaDocumentResponse = {
  TOKEN?: string;
  FOLIO?: number;
  token?: string;
  folio?: number;
  status?: string;
  [key: string]: unknown;
};

type OpenfacturaCallResult =
  | {
      ok: true;
      payload: OpenfacturaDocumentResponse;
    }
  | {
      ok: false;
      errorDetail: string;
      token?: string;
      folio?: number;
    };

type DtePreparation = {
  document: DteDocument;
  idempotencyKeyToUse: string | null;
  checkExistingToken: string | null;
};

type DteCreateOutcome =
  | { kind: 'existing'; response: DteDocumentResponseDto }
  | { kind: 'prepared'; preparation: DtePreparation };

type DteFinalizeOutcome =
  | { kind: 'success'; response: DteDocumentResponseDto }
  | { kind: 'error'; message: string; response: DteDocumentResponseDto };

@Injectable()
export class DteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DteService.name);
  private reconcileTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(DteDocument)
    private readonly dteDocumentRepository: Repository<DteDocument>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly financialMovementsService: FinancialMovementsService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  onModuleInit(): void {
    const enabled =
      this.configService.get<string>('DTE_RECONCILE_ENABLED') === 'true';
    if (!enabled || !this.tenantContext) return;

    const configuredInterval = Number(
      this.configService.get<string>('DTE_RECONCILE_INTERVAL_MS', '300000'),
    );
    const intervalMs =
      Number.isFinite(configuredInterval) && configuredInterval > 0
        ? configuredInterval
        : 300_000;

    this.logger.log(
      `Poller de reconciliación DTE habilitado | intervalMs=${intervalMs}`,
    );
    this.reconcileTimer = setInterval(() => {
      void this.reconcilePendingDocuments();
    }, intervalMs);
    this.reconcileTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = undefined;
    }
  }

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

  private toDateOnly(value: string): Date {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private normalizeRut(rut: string): string {
    return rut.trim().toUpperCase();
  }

  private maskApikey(apikey: string): string {
    if (apikey.length <= 8) return '****';
    return `${apikey.slice(0, 4)}...${apikey.slice(-4)}`;
  }

  private buildToken(): string {
    return `${LOCAL_TOKEN_PREFIX}${randomBytes(28).toString('hex')}`;
  }

  private buildFolio(existing?: number | null): number {
    return existing && existing > 0 ? existing : randomInt(100000, 999999);
  }

  private mapPaymentType(fmaPago?: string): DteDocumentPaymentType {
    const value = fmaPago?.trim();
    if (value === '1') return DteDocumentPaymentType.CASH;
    if (value === '2') return DteDocumentPaymentType.CREDIT;
    this.logger.warn(
      `FmaPago ausente o no reconocido ('${value ?? ''}'); se usará Efectivo`,
    );
    return DteDocumentPaymentType.CASH;
  }

  private async resolveVariation(
    manager: EntityManager,
    item: CreateDteDocumentDto['dte']['Detalle'][number],
    stats: { count: number },
  ): Promise<
    ProductVariation & { product?: Product; resolvedByName?: boolean }
  > {
    const code = item.CdgItem?.VlrCodigo?.trim();

    if (code) {
      const bySku = await manager.findOne(ProductVariation, {
        where: { sku: code },
        relations: ['product'],
      });
      if (bySku) return bySku;
    }

    const byName = await manager.findOne(Product, {
      where: { name: ILike(item.NmbItem) },
      relations: ['variations'],
    });
    if (byName?.variations?.length === 1) {
      stats.count += 1;
      const variation = byName.variations[0];
      this.logger.warn(
        `Resolución de ítem por nombre | item="${item.NmbItem}" | variationID=${variation.variationID} | sku=${variation.sku}`,
      );
      return { ...variation, product: byName, resolvedByName: true };
    }

    throw new BadRequestException(
      `No se pudo resolver la variación para el item "${item.NmbItem}"`,
    );
  }

  private async mapToDocumentPayload(
    manager: EntityManager,
    dto: CreateDteDocumentDto,
    storeID: string,
  ): Promise<{
    normalizedItems: NormalizedDteItem[];
    store: Store;
    totals: {
      subtotal: number;
      net: number;
      tax: number;
      total: number;
      cogsTotal: number;
    };
  }> {
    const store = await manager.findOne(Store, {
      where: { storeID },
    });

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
    }

    if (
      this.normalizeRut(dto.dte.Encabezado.Emisor.RUTEmisor) !==
      this.normalizeRut(store.rut)
    ) {
      throw new BadRequestException(
        `El RUTEmisor del payload no coincide con el RUT de la tienda de sesión`,
      );
    }

    const nameFallbackStats = { count: 0 };
    const normalizedItems: NormalizedDteItem[] = [];
    let subtotal = 0;

    for (const item of dto.dte.Detalle) {
      const variation = await this.resolveVariation(
        manager,
        item,
        nameFallbackStats,
      );
      const quantity = Number(item.QtyItem);
      const unitPrice =
        item.PrcItem !== undefined
          ? Number(item.PrcItem)
          : item.MontoItem !== undefined && quantity > 0
            ? Number(item.MontoItem) / quantity
            : 0;
      const amount = this.toMoney(
        item.MontoItem !== undefined
          ? Number(item.MontoItem)
          : unitPrice * quantity,
      );

      subtotal += amount;
      normalizedItems.push({
        NroLinDet: item.NroLinDet,
        NmbItem: item.NmbItem,
        QtyItem: quantity,
        PrcItem: this.toMoney(unitPrice),
        MontoItem: amount,
        costPrice: 0,
        costTotal: 0,
        variationID: variation.variationID,
        sku: variation.sku,
        productName: variation.product?.name,
        resolvedByName: variation.resolvedByName ?? false,
      });
    }

    if (nameFallbackStats.count > 0) {
      this.logger.warn(
        `DTE: ${nameFallbackStats.count} ítem(s) resuelto(s) por nombre en este documento; auditar payloads para migrar a SKU`,
      );
    }

    const { items: normalizedItemsWithCosts, cogsTotal } =
      await this.snapshotItemCosts(manager, store.storeID, normalizedItems);

    const net = this.toMoney(dto.dte.Encabezado.Totales?.MntNeto ?? subtotal);
    const tax = this.toMoney(dto.dte.Encabezado.Totales?.IVA ?? 0);
    const total = this.toMoney(
      dto.dte.Encabezado.Totales?.MntTotal ?? subtotal + tax,
    );

    return {
      normalizedItems: normalizedItemsWithCosts,
      store,
      totals: {
        subtotal: this.toMoney(subtotal),
        net,
        tax,
        total,
        cogsTotal,
      },
    };
  }

  private async snapshotItemCosts(
    manager: EntityManager,
    storeID: string,
    items: NormalizedDteItem[],
  ): Promise<{ items: NormalizedDteItem[]; cogsTotal: number }> {
    let cogsTotal = 0;

    for (const item of items) {
      const storeProduct = await manager.findOne(StoreProduct, {
        where: {
          store: { storeID },
          variation: { variationID: item.variationID },
        },
      });

      const costPrice = this.toMoney(Number(storeProduct?.priceCost ?? 0));
      const costTotal = this.toMoney(costPrice * item.QtyItem);
      item.costPrice = costPrice;
      item.costTotal = costTotal;
      cogsTotal = this.toMoney(cogsTotal + costTotal);
    }

    return { items, cogsTotal };
  }

  private async validatePurchaseOrder(
    manager: EntityManager,
    dto: CreateDteDocumentDto,
    storeID: string,
  ): Promise<PurchaseOrder | null> {
    if (!dto.purchaseOrderID) return null;

    const purchaseOrder = await manager.findOne(PurchaseOrder, {
      where: { purchaseOrderID: dto.purchaseOrderID },
      relations: ['store'],
    });

    if (!purchaseOrder) {
      throw new NotFoundException(
        `Orden de compra con ID ${dto.purchaseOrderID} no encontrada`,
      );
    }

    if (purchaseOrder.status !== PurchaseOrderCommercialStatus.ACEPTADO) {
      throw new BadRequestException(
        `La orden de compra ${dto.purchaseOrderID} debe estar en estado Aceptado para emitir un DTE`,
      );
    }

    if (purchaseOrder.store?.storeID !== storeID) {
      throw new BadRequestException(
        `La orden de compra ${dto.purchaseOrderID} no pertenece a la misma tienda del DTE`,
      );
    }

    return purchaseOrder;
  }

  private async findExistingDocument(
    manager: EntityManager,
    idempotencyKey: string | undefined,
    purchaseOrderID: string | undefined,
  ): Promise<DteDocument | null> {
    if (idempotencyKey) {
      const byKey = await manager.findOne(DteDocument, {
        where: { idempotencyKey },
      });
      if (byKey) return byKey;
    }

    if (purchaseOrderID) {
      const byPurchaseOrder = await manager.findOne(DteDocument, {
        where: { purchaseOrderID },
      });
      if (byPurchaseOrder) return byPurchaseOrder;
    }

    return null;
  }

  private isUniqueViolation(error: unknown): boolean {
    const code =
      (error as { code?: string })?.code ??
      (error as { driverError?: { code?: string } })?.driverError?.code;
    return code === '23505';
  }

  private readNormalizedItems(document: DteDocument): NormalizedDteItem[] {
    const items = (document.payloadNormalized as { items?: unknown } | null)
      ?.items;
    return Array.isArray(items) ? (items as NormalizedDteItem[]) : [];
  }

  private buildResponse(document: DteDocument): DteDocumentResponseDto {
    return {
      TOKEN: document.token,
      FOLIO: document.folio,
      status: document.status,
    };
  }

  private normalizeStatus(status?: string): DteDocumentStatus {
    if (status === DteDocumentStatus.ERROR) return DteDocumentStatus.ERROR;
    if (status === DteDocumentStatus.PENDIENTE) {
      return DteDocumentStatus.PENDIENTE;
    }
    return DteDocumentStatus.EMITIDO;
  }

  private buildNormalizedPayload(
    dto: CreateDteDocumentDto,
    store: Store,
    normalizedItems: NormalizedDteItem[],
    totals: {
      subtotal: number;
      net: number;
      tax: number;
      total: number;
      cogsTotal: number;
    },
    token: string,
    folio: number,
    paymentType: DteDocumentPaymentType,
    status: DteDocumentStatus,
  ) {
    return {
      token,
      folio,
      status,
      paymentType,
      total: totals.total,
      cogsTotal: totals.cogsTotal,
      purchaseOrderID: dto.purchaseOrderID ?? null,
      store: {
        storeID: store.storeID,
        rut: store.rut,
        name: store.name,
        location: store.location,
      },
      dte: dto.dte,
      customer: dto.customer ?? null,
      customizePage: dto.customizePage ?? null,
      selfService: dto.selfService,
      response: dto.response,
      totals,
      items: normalizedItems,
    };
  }

  private async reserveStockAndSnapshotCosts(
    manager: EntityManager,
    storeID: string,
    items: NormalizedDteItem[],
    referenceID: string,
  ): Promise<{ items: NormalizedDteItem[]; cogsTotal: number }> {
    let cogsTotal = 0;

    for (const item of items) {
      const storeProduct = await manager.findOne(StoreProduct, {
        where: {
          store: { storeID },
          variation: { variationID: item.variationID },
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!storeProduct) {
        throw new BadRequestException(
          `Stock insuficiente en tienda para VariationID: ${item.variationID}. Solicitado: ${item.QtyItem}, Disponible: 0`,
        );
      }

      if (Number(storeProduct.stock) < item.QtyItem) {
        throw new BadRequestException(
          `Stock insuficiente en tienda para VariationID: ${item.variationID}. Solicitado: ${item.QtyItem}, Disponible: ${storeProduct.stock}`,
        );
      }

      const costPrice = this.toMoney(Number(storeProduct.priceCost ?? 0));
      const costTotal = this.toMoney(costPrice * item.QtyItem);
      item.costPrice = costPrice;
      item.costTotal = costTotal;
      cogsTotal = this.toMoney(cogsTotal + costTotal);

      storeProduct.stock -= item.QtyItem;
      await manager.save(storeProduct);
      await manager.save(
        manager.create(InventoryMovement, {
          store: { storeID },
          variation: { variationID: item.variationID },
          delta: -item.QtyItem,
          reason: InventoryMovementReason.SALE,
          referenceID,
        }),
      );
    }

    return { items, cogsTotal };
  }

  private async revertReservedStock(
    manager: EntityManager,
    document: DteDocument,
  ): Promise<void> {
    const items = this.readNormalizedItems(document);

    for (const item of items) {
      const storeProduct = await manager.findOne(StoreProduct, {
        where: {
          store: { storeID: document.storeID },
          variation: { variationID: item.variationID },
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!storeProduct) {
        this.logger.error(
          `No se pudo revertir stock del DTE ${document.dteDocumentID}: StoreProduct no encontrado para variationID=${item.variationID}`,
        );
        continue;
      }

      storeProduct.stock += Number(item.QtyItem);
      await manager.save(storeProduct);
      await manager.save(
        manager.create(InventoryMovement, {
          store: { storeID: document.storeID },
          variation: { variationID: item.variationID },
          delta: Number(item.QtyItem),
          reason: InventoryMovementReason.ADJUSTMENT,
          referenceID: document.dteDocumentID,
        }),
      );
    }
  }

  private applyFinalStatusToNormalized(
    document: DteDocument,
    errorDetail?: string | null,
  ): Record<string, unknown> {
    const current =
      document.payloadNormalized &&
      typeof document.payloadNormalized === 'object'
        ? { ...document.payloadNormalized }
        : {};
    current.status = document.status;
    current.token = document.token;
    current.folio = document.folio;
    if (errorDetail !== undefined) current.errorDetail = errorDetail;
    return current;
  }

  private previewJson(payload: OpenfacturaDocumentResponse): string {
    try {
      const safePayload = Object.fromEntries(
        Object.entries(payload).filter(
          ([key]) => !BINARY_RESPONSE_KEYS.includes(key),
        ),
      );
      const text = JSON.stringify(safePayload);
      if (!text) return '';
      return text.length > ERROR_DETAIL_PREVIEW_LIMIT
        ? `${text.slice(0, ERROR_DETAIL_PREVIEW_LIMIT)}...`
        : text;
    } catch {
      return '';
    }
  }

  private previewText(text: string): string {
    const clean = text.trim();
    if (!clean) return '';
    return clean.length > ERROR_DETAIL_PREVIEW_LIMIT
      ? `${clean.slice(0, ERROR_DETAIL_PREVIEW_LIMIT)}...`
      : clean;
  }

  private async callOpenfactura(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    },
  ): Promise<OpenfacturaCallResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENFACTURA_TIMEOUT_MS);
    timer.unref?.();

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: OpenfacturaDocumentResponse = {};

      if (text) {
        try {
          payload = JSON.parse(text) as OpenfacturaDocumentResponse;
        } catch {
          payload = { status: response.status.toString() };
        }
      }

      if (!response.ok) {
        const preview = this.previewJson(payload) || this.previewText(text);
        const detail = `Openfactura respondió con estado ${response.status}${
          preview ? `: ${preview}` : ''
        }`;
        this.logger.error(
          `Openfactura respondió error | url=${url} | detail=${detail}`,
        );
        return {
          ok: false,
          errorDetail: detail,
          token: payload.TOKEN ?? payload.token,
          folio: payload.FOLIO ?? payload.folio,
        };
      }

      this.logger.log(
        `Openfactura respondió OK | url=${url} | TOKEN=${
          payload.TOKEN ?? payload.token ?? 'none'
        } | FOLIO=${payload.FOLIO ?? payload.folio ?? 'none'} | status=${
          payload.status ?? 'none'
        }`,
      );
      return { ok: true, payload };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      const detail = aborted
        ? `Timeout llamando a Openfactura (${OPENFACTURA_TIMEOUT_MS} ms)`
        : `Error de red llamando a Openfactura: ${
            error instanceof Error ? error.message : String(error)
          }`;
      this.logger.error(
        `Openfactura no respondió | url=${url} | detail=${detail}`,
      );
      return { ok: false, errorDetail: detail };
    } finally {
      clearTimeout(timer);
    }
  }

  private createOpenfacturaDocument(
    apikey: string,
    idempotencyKey: string | null,
    dto: CreateDteDocumentDto,
  ): Promise<OpenfacturaCallResult> {
    const baseUrl = this.configService.get<string>(
      'OPENFACTURA_BASE_URL',
      'https://dev-api.haulmer.com',
    );
    const url = `${baseUrl.replace(/\/$/, '')}/v2/dte/document`;
    this.logger.log(`Enviando documento a Openfactura | url=${url}`);

    return this.callOpenfactura(url, {
      method: 'POST',
      headers: {
        apikey,
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(dto),
    });
  }

  private getOpenfacturaDocument(
    apikey: string,
    token: string,
  ): Promise<OpenfacturaCallResult> {
    const baseUrl = this.configService.get<string>(
      'OPENFACTURA_BASE_URL',
      'https://dev-api.haulmer.com',
    );
    const url = `${baseUrl.replace(/\/$/, '')}/dte/document/${encodeURIComponent(
      token,
    )}/json`;
    this.logger.log(`Consultando documento en Openfactura | url=${url}`);

    return this.callOpenfactura(url, {
      method: 'GET',
      headers: {
        apikey,
        accept: 'application/json',
      },
    });
  }

  private requireApikey(): string {
    const apikey = this.configService.get<string>('OPENFACTURA_APIKEY');
    if (!apikey?.trim()) {
      this.logger.error('OPENFACTURA_APIKEY no está configurada');
      throw new InternalServerErrorException(
        'OPENFACTURA_APIKEY no está configurada',
      );
    }
    this.logger.log(
      `OPENFACTURA_APIKEY detectada | length=${apikey.length} | preview=${this.maskApikey(apikey)}`,
    );
    return apikey;
  }

  private async prepare(
    manager: EntityManager,
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateDteDocumentDto,
    apikey: string,
  ): Promise<DteCreateOutcome> {
    const existing = await this.findExistingDocument(
      manager,
      idempotencyKey,
      dto.purchaseOrderID,
    );

    if (existing && existing.status !== DteDocumentStatus.ERROR) {
      this.logger.log(
        `Documento existente reutilizado | dteDocumentID=${existing.dteDocumentID} | status=${existing.status}`,
      );
      return { kind: 'existing', response: this.buildResponse(existing) };
    }

    const { normalizedItems, store, totals } = await this.mapToDocumentPayload(
      manager,
      dto,
      storeID,
    );

    if (existing && existing.storeID && existing.storeID !== store.storeID) {
      throw new BadRequestException(
        'La Idempotency-Key / orden de compra ya fue utilizada en otra tienda',
      );
    }

    const purchaseOrder = await this.validatePurchaseOrder(
      manager,
      dto,
      storeID,
    );

    const idempotencyKeyToUse =
      existing?.idempotencyKey ?? idempotencyKey ?? null;
    const checkExistingToken =
      existing?.token && !existing.token.startsWith(LOCAL_TOKEN_PREFIX)
        ? existing.token
        : null;
    const token =
      existing?.token && !existing.token.startsWith(LOCAL_TOKEN_PREFIX)
        ? existing.token
        : this.buildToken();
    const folio =
      existing?.folio ?? this.buildFolio(dto.dte.Encabezado.IdDoc.Folio);
    const paymentType = this.mapPaymentType(dto.dte.Encabezado.IdDoc.FmaPago);

    const values = {
      apikey: this.maskApikey(apikey),
      idempotencyKey: idempotencyKeyToUse,
      token,
      folio,
      store: { storeID: store.storeID },
      storeID: store.storeID,
      purchaseOrder: purchaseOrder
        ? { purchaseOrderID: purchaseOrder.purchaseOrderID }
        : null,
      purchaseOrderID: purchaseOrder?.purchaseOrderID ?? null,
      status: DteDocumentStatus.PENDIENTE,
      documentType: dto.dte.Encabezado.IdDoc.TipoDTE ?? null,
      paymentType,
      total: totals.total,
      netTotal: totals.net,
      taxTotal: totals.tax,
      cogsTotal: totals.cogsTotal,
      issueDate: this.toDateOnly(dto.dte.Encabezado.IdDoc.FchEmis),
      payloadRaw: dto as unknown as Record<string, unknown>,
      payloadNormalized: this.buildNormalizedPayload(
        dto,
        store,
        normalizedItems,
        totals,
        token,
        folio,
        paymentType,
        DteDocumentStatus.PENDIENTE,
      ) as unknown as Record<string, unknown>,
      errorDetail: null,
    };

    let document: DteDocument | null = null;

    if (existing) {
      document = await manager.save(
        manager.create(DteDocument, { ...existing, ...values }),
      );
    } else {
      const candidate = manager.create(DteDocument, values);
      await manager.query('SAVEPOINT dte_document_insert');
      try {
        document = await manager.save(candidate);
      } catch (error) {
        await manager.query('ROLLBACK TO SAVEPOINT dte_document_insert');
        if (this.isUniqueViolation(error)) {
          const concurrent = await this.findExistingDocument(
            manager,
            idempotencyKey,
            dto.purchaseOrderID,
          );
          if (concurrent) {
            if (concurrent.status !== DteDocumentStatus.ERROR) {
              this.logger.log(
                `Documento concurrente reutilizado tras 23505 | dteDocumentID=${concurrent.dteDocumentID} | status=${concurrent.status}`,
              );
              return {
                kind: 'existing',
                response: this.buildResponse(concurrent),
              };
            }
            document = await manager.save(
              manager.create(DteDocument, { ...concurrent, ...values }),
            );
          }
        }
        if (!document) throw error;
      } finally {
        await manager.query('RELEASE SAVEPOINT dte_document_insert');
      }
    }

    if (!document) {
      throw new InternalServerErrorException(
        'No se pudo preparar el documento DTE',
      );
    }

    const reserved = await this.reserveStockAndSnapshotCosts(
      manager,
      store.storeID,
      normalizedItems,
      document.dteDocumentID,
    );
    const currentItems = this.readNormalizedItems(document);
    const costsChanged =
      reserved.cogsTotal !== document.cogsTotal ||
      reserved.items.some((item, index) => {
        const current = currentItems[index];
        return (
          !current ||
          current.costPrice !== item.costPrice ||
          current.costTotal !== item.costTotal
        );
      });

    if (costsChanged) {
      document.cogsTotal = reserved.cogsTotal;
      document.payloadNormalized = {
        ...document.payloadNormalized,
        items: reserved.items,
        cogsTotal: reserved.cogsTotal,
        totals: {
          ...(document.payloadNormalized as { totals?: object })?.totals,
          cogsTotal: reserved.cogsTotal,
        },
      } as unknown as Record<string, unknown>;
      document = await manager.save(document);
    }

    this.logger.log(
      `Documento DTE en PENDIENTE | dteDocumentID=${document.dteDocumentID} | folio=${document.folio} | storeID=${document.storeID}`,
    );
    return {
      kind: 'prepared',
      preparation: {
        document,
        idempotencyKeyToUse,
        checkExistingToken,
      },
    };
  }

  private async finalizeInTransaction(
    manager: EntityManager,
    dteDocumentID: string,
    result: OpenfacturaCallResult,
  ): Promise<DteFinalizeOutcome> {
    const document = await manager.findOne(DteDocument, {
      where: { dteDocumentID },
      lock: { mode: 'pessimistic_write' },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento DTE ${dteDocumentID} no encontrado`,
      );
    }

    if (
      document.status === DteDocumentStatus.EMITIDO ||
      document.status === DteDocumentStatus.ERROR
    ) {
      return { kind: 'success', response: this.buildResponse(document) };
    }

    if (document.status !== DteDocumentStatus.PENDIENTE) {
      throw new BadRequestException(
        `Documento ${dteDocumentID} no está en estado PENDIENTE`,
      );
    }

    const payloadStatus = result.ok
      ? this.normalizeStatus(result.payload.status)
      : DteDocumentStatus.ERROR;

    if (result.ok && payloadStatus !== DteDocumentStatus.ERROR) {
      document.status = payloadStatus;
      const responseToken = result.payload.TOKEN ?? result.payload.token;
      const responseFolio = result.payload.FOLIO ?? result.payload.folio;
      if (responseToken) document.token = responseToken;
      if (responseFolio !== undefined) document.folio = Number(responseFolio);
      document.errorDetail = null;
      document.payloadNormalized = this.applyFinalStatusToNormalized(document);

      const saved = await manager.save(document);
      if (saved.status === DteDocumentStatus.EMITIDO) {
        await this.financialMovementsService.recordDte(manager, saved);
      }

      this.logger.log(
        `Documento DTE finalizado | dteDocumentID=${saved.dteDocumentID} | status=${saved.status} | folio=${saved.folio}`,
      );
      return { kind: 'success', response: this.buildResponse(saved) };
    }

    document.status = DteDocumentStatus.ERROR;
    const statusPreview = result.ok ? this.previewJson(result.payload) : '';
    document.errorDetail = result.ok
      ? `Openfactura reportó estado ERROR${
          statusPreview ? `: ${statusPreview}` : ''
        }`
      : result.errorDetail;
    if (!result.ok) {
      if (result.token) document.token = result.token;
      if (result.folio !== undefined) document.folio = Number(result.folio);
    }
    document.payloadNormalized = this.applyFinalStatusToNormalized(
      document,
      document.errorDetail,
    );

    const saved = await manager.save(document);
    await this.revertReservedStock(manager, saved);

    this.logger.error(
      `Documento DTE en ERROR | dteDocumentID=${saved.dteDocumentID} | detail=${document.errorDetail}`,
    );
    return {
      kind: 'error',
      message: `Openfactura no pudo emitir el documento ${saved.dteDocumentID}: ${document.errorDetail}`,
      response: this.buildResponse(saved),
    };
  }

  async create(
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateDteDocumentDto,
  ): Promise<DteDocumentResponseDto> {
    const apikey = this.requireApikey();
    this.logger.log(
      `create() iniciado | storeID=${storeID} | idempotencyKey=${
        idempotencyKey ?? 'none'
      } | folio=${dto.dte?.Encabezado?.IdDoc?.Folio ?? 'none'} | tipoDTE=${
        dto.dte?.Encabezado?.IdDoc?.TipoDTE ?? 'none'
      }`,
    );

    const outcome = await this.runInTransaction((manager) =>
      this.prepare(manager, storeID, idempotencyKey, dto, apikey),
    );

    if (outcome.kind === 'existing') return outcome.response;

    const { document, idempotencyKeyToUse, checkExistingToken } =
      outcome.preparation;
    const callResult = checkExistingToken
      ? await this.getOpenfacturaDocument(apikey, checkExistingToken)
      : await this.createOpenfacturaDocument(apikey, idempotencyKeyToUse, dto);

    const finalOutcome = await this.runInTransaction((manager) =>
      this.finalizeInTransaction(manager, document.dteDocumentID, callResult),
    );

    if (finalOutcome.kind === 'error') {
      throw new BadGatewayException(finalOutcome.message);
    }
    return finalOutcome.response;
  }

  async reconcile(
    dteDocumentID: string,
    storeID: string,
  ): Promise<DteDocumentResponseDto> {
    const apikey = this.requireApikey();

    const document = await this.runInTransaction((manager) =>
      manager.findOne(DteDocument, {
        where: { dteDocumentID, storeID },
      }),
    );

    if (!document) {
      throw new NotFoundException(
        `Documento DTE ${dteDocumentID} no encontrado`,
      );
    }

    if (document.status !== DteDocumentStatus.PENDIENTE) {
      return this.buildResponse(document);
    }

    if (!document.token || document.token.startsWith(LOCAL_TOKEN_PREFIX)) {
      throw new BadRequestException(
        'El documento no tiene un TOKEN de Openfactura para reconciliar',
      );
    }

    const result = await this.getOpenfacturaDocument(apikey, document.token);
    const finalOutcome = await this.runInTransaction((manager) =>
      this.finalizeInTransaction(manager, dteDocumentID, result),
    );

    if (finalOutcome.kind === 'error') {
      throw new BadGatewayException(finalOutcome.message);
    }
    return finalOutcome.response;
  }

  private async reconcilePendingDocuments(): Promise<void> {
    const tenantContext = this.tenantContext;
    if (!tenantContext) return;

    try {
      const tenants = (await this.dataSource.query(
        `SELECT "tenantID" FROM "tenants" WHERE "status" = 'ACTIVE'`,
      )) as Array<{ tenantID: string }>;

      for (const tenant of tenants) {
        await tenantContext.run(
          { tenantId: tenant.tenantID, impersonating: false },
          async () => {
            const pending = await this.runInTransaction((manager) =>
              manager.find(DteDocument, {
                where: { status: DteDocumentStatus.PENDIENTE },
                take: 50,
              }),
            );

            for (const document of pending) {
              try {
                await this.reconcile(document.dteDocumentID, document.storeID);
              } catch (error) {
                this.logger.warn(
                  `Reconciliación DTE falló | dteDocumentID=${document.dteDocumentID} | error=${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Ciclo de reconciliación DTE falló | error=${error instanceof Error ? error.stack : String(error)}`,
      );
    }
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return this.runInTransaction((manager) =>
      manager.getRepository(DteDocument).findOne({
        where: { idempotencyKey },
        relations: ['store'],
      }),
    );
  }
}
