import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
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

type NormalizedDteItem = {
  NroLinDet: number;
  NmbItem: string;
  QtyItem: number;
  PrcItem: number;
  MontoItem: number;
  variationID: string;
  sku?: string;
  productName?: string;
};

type OpenfacturaDocumentResponse = {
  TOKEN?: string;
  FOLIO?: number;
  status?: string;
};

@Injectable()
export class DteService {
  private readonly logger = new Logger(DteService.name);

  constructor(
    @InjectRepository(DteDocument)
    private readonly dteDocumentRepository: Repository<DteDocument>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.dataSource.transaction(callback);
  }


  private toMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private buildToken(): string {
    return randomBytes(32).toString('hex');
  }

  private buildFolio(existing?: number | null): number {
    return existing && existing > 0 ? existing : randomInt(100000, 999999);
  }

  private async resolveVariation(
    manager: EntityManager,
    item: CreateDteDocumentDto['dte']['Detalle'][number],
  ): Promise<ProductVariation & { product?: Product }> {
    const code = item.CdgItem?.VlrCodigo;

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
      return byName.variations[0];
    }

    throw new BadRequestException(
      `No se pudo resolver la variación para el item "${item.NmbItem}"`,
    );
  }

  private async mapToDocumentPayload(
    manager: EntityManager,
    dto: CreateDteDocumentDto,
  ): Promise<{
    normalizedItems: NormalizedDteItem[];
    store: Store;
    totals: {
      subtotal: number;
      net: number;
      tax: number;
      total: number;
    };
  }> {
    const store = await manager.findOne(Store, {
      where: { rut: dto.dte.Encabezado.Emisor.RUTEmisor },
    });

    if (!store) {
      throw new NotFoundException(
        `Tienda con RUT ${dto.dte.Encabezado.Emisor.RUTEmisor} no encontrada`,
      );
    }

    const normalizedItems: NormalizedDteItem[] = [];
    let subtotal = 0;

    for (const item of dto.dte.Detalle) {
      const variation = await this.resolveVariation(manager, item);
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
        variationID: variation.variationID,
        sku: variation.sku,
        productName: variation.product?.name,
      });
    }

    const net = this.toMoney(dto.dte.Encabezado.Totales?.MntNeto ?? subtotal);
    const tax = this.toMoney(dto.dte.Encabezado.Totales?.IVA ?? 0);
    const total = this.toMoney(
      dto.dte.Encabezado.Totales?.MntTotal ?? subtotal + tax,
    );

    return {
      normalizedItems,
      store,
      totals: {
        subtotal: this.toMoney(subtotal),
        net,
        tax,
        total,
      },
    };
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

  private async applyInventoryMovements(
    manager: EntityManager,
    storeID: string,
    items: NormalizedDteItem[],
    referenceID: string,
  ) {
    for (const item of items) {
      let storeProduct = await manager.findOne(StoreProduct, {
        where: {
          store: { storeID },
          variation: { variationID: item.variationID },
        },
      });

      if (!storeProduct) {
        const variation = await manager.findOne(ProductVariation, {
          where: { variationID: item.variationID },
        });

        if (!variation) {
          throw new NotFoundException(
            `Variación con ID ${item.variationID} no encontrada`,
          );
        }

        storeProduct = manager.create(StoreProduct, {
          store: { storeID },
          variation: { variationID: item.variationID },
          stock: 0,
          priceCost: 0,
          priceList: 0,
        });
        await manager.save(storeProduct);
      }

      if (storeProduct.stock < item.QtyItem) {
        throw new BadRequestException(
          `Stock insuficiente en tienda para VariationID: ${item.variationID}. Solicitado: ${item.QtyItem}, Disponible: ${storeProduct.stock}`,
        );
      }

      const movement = manager.create(InventoryMovement, {
        store: { storeID },
        variation: { variationID: item.variationID },
        delta: -item.QtyItem,
        reason: InventoryMovementReason.SALE,
        referenceID,
      });
      await manager.save(movement);

      storeProduct.stock -= item.QtyItem;
      await manager.save(storeProduct);
    }
  }

  private async createOpenfacturaDocument(
    apikey: string,
    idempotencyKey: string | undefined,
    dto: CreateDteDocumentDto,
  ): Promise<OpenfacturaDocumentResponse> {
    const baseUrl = this.configService.get<string>(
      'OPENFACTURA_BASE_URL',
      'https://dev-api.haulmer.com',
    );
    const url = `${baseUrl.replace(/\/$/, '')}/v2/dte/document`;

    this.logger.log(`Enviando documento a Openfactura | url=${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey,
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(dto),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? ((await response.json()) as OpenfacturaDocumentResponse)
      : ({ status: response.status.toString() } as OpenfacturaDocumentResponse);

    if (!response.ok) {
      this.logger.error(
        `Openfactura respondió error | status=${response.status} | body=${JSON.stringify(payload)}`,
      );
      throw new InternalServerErrorException(
        `Openfactura respondió con estado ${response.status}`,
      );
    }

    this.logger.log(
      `Openfactura respondió OK | TOKEN=${payload.TOKEN ?? 'none'} | FOLIO=${payload.FOLIO ?? 'none'} | status=${payload.status ?? 'none'}`,
    );

    return payload;
  }

  private buildNormalizedPayload(
    dto: CreateDteDocumentDto,
    store: Store,
    normalizedItems: NormalizedDteItem[],
    totals: { subtotal: number; net: number; tax: number; total: number },
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

  async create(
    idempotencyKey: string | undefined,
    dto: CreateDteDocumentDto,
  ): Promise<DteDocumentResponseDto> {
    const apikey = this.configService.get<string>('OPENFACTURA_APIKEY');
    this.logger.log(
      `create() iniciado | idempotencyKey=${idempotencyKey ?? 'none'} | folio=${dto.dte?.Encabezado?.IdDoc?.Folio ?? 'none'} | tipoDTE=${dto.dte?.Encabezado?.IdDoc?.TipoDTE ?? 'none'}`,
    );

    if (!apikey?.trim()) {
      this.logger.error('OPENFACTURA_APIKEY no está configurada');
      throw new InternalServerErrorException(
        'OPENFACTURA_APIKEY no está configurada',
      );
    }

    this.logger.log(
      `OPENFACTURA_APIKEY detectada | length=${apikey.length} | preview=${apikey.slice(0, 4)}...${apikey.slice(-4)}`,
    );

    if (idempotencyKey) {
      this.logger.log(
        `Buscando documento existente por idempotencyKey=${idempotencyKey}`,
      );
      const existing = await this.dteDocumentRepository.findOne({
        where: { idempotencyKey },
      });

      if (existing) {
        this.logger.log(
          `Documento existente reutilizado | dteDocumentID=${existing.dteDocumentID} | status=${existing.status}`,
        );
        return this.buildResponse(existing);
      }
    }

    if (dto.purchaseOrderID) {
      this.logger.log(
        `Buscando documento existente por purchaseOrderID=${dto.purchaseOrderID}`,
      );
      const existingByOrder = await this.dteDocumentRepository.findOne({
        where: { purchaseOrderID: dto.purchaseOrderID },
      });
      if (existingByOrder) {
        this.logger.log(
          `Documento existente reutilizado por purchaseOrderID | dteDocumentID=${existingByOrder.dteDocumentID} | status=${existingByOrder.status}`,
        );
        return this.buildResponse(existingByOrder);
      }
    }

    return this.runInTransaction(async (manager) => {
      if (idempotencyKey) {
        const existing = await manager.findOne(DteDocument, {
          where: { idempotencyKey },
        });
        if (existing) {
          this.logger.log(
            `Documento existente reutilizado dentro de transacción | dteDocumentID=${existing.dteDocumentID} | status=${existing.status}`,
          );
          return this.buildResponse(existing);
        }
      }

      if (dto.purchaseOrderID) {
        const existingByOrder = await manager.findOne(DteDocument, {
          where: { purchaseOrderID: dto.purchaseOrderID },
        });
        if (existingByOrder) {
          this.logger.log(
            `Documento existente reutilizado dentro de transacción por purchaseOrderID | dteDocumentID=${existingByOrder.dteDocumentID} | status=${existingByOrder.status}`,
          );
          return this.buildResponse(existingByOrder);
        }
      }

      this.logger.log('Iniciando transacción DTE');

      const { normalizedItems, store, totals } =
        await this.mapToDocumentPayload(manager, dto);

      let purchaseOrder: PurchaseOrder | null = null;
      if (dto.purchaseOrderID) {
        purchaseOrder = await manager.findOne(PurchaseOrder, {
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

        if (purchaseOrder.store.storeID !== store.storeID) {
          throw new BadRequestException(
            `La orden de compra ${dto.purchaseOrderID} no pertenece a la misma tienda del DTE`,
          );
        }
      }

      const openfacturaResponse = await this.createOpenfacturaDocument(
        apikey,
        idempotencyKey,
        dto,
      );

      const token = openfacturaResponse.TOKEN ?? this.buildToken();
      const folio =
        openfacturaResponse.FOLIO ??
        this.buildFolio(dto.dte.Encabezado.IdDoc.Folio);
      const status = this.normalizeStatus(openfacturaResponse.status);
      const paymentType = DteDocumentPaymentType.CASH;

      const document = manager.create(DteDocument, {
        apikey,
        idempotencyKey: idempotencyKey ?? null,
        token,
        folio,
        store: { storeID: store.storeID },
        storeID: store.storeID,
        purchaseOrder: purchaseOrder
          ? { purchaseOrderID: purchaseOrder.purchaseOrderID }
          : null,
        purchaseOrderID: purchaseOrder?.purchaseOrderID ?? null,
        status,
        documentType: dto.dte.Encabezado.IdDoc.TipoDTE ?? null,
        paymentType,
        total: totals.total,
        payloadRaw: dto as unknown as Record<string, unknown>,
        payloadNormalized: this.buildNormalizedPayload(
          dto,
          store,
          normalizedItems,
          totals,
          token,
          folio,
          paymentType,
          status,
        ) as unknown as Record<string, unknown>,
      });

      const saved = await manager.save(document);

      await this.applyInventoryMovements(
        manager,
        store.storeID,
        normalizedItems,
        saved.dteDocumentID,
      );

      this.logger.log(
        `Documento DTE guardado | dteDocumentID=${saved.dteDocumentID} | folio=${saved.folio} | status=${saved.status} | storeID=${saved.storeID}`,
      );
      return this.buildResponse(saved);
    });
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

