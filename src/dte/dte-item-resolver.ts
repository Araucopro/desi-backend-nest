import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { Store } from '../stores/entities/store.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import {
  PurchaseOrder,
  PurchaseOrderCommercialStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import {
  BoletaEncabezadoDto,
  CreateDteDocumentDto,
  DteEncabezadoDto,
} from './dto/create-dte-document.dto';
import { NormalizedDteItem } from './dte-response.mapper';

const logger = new Logger('DteItemResolver');

function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeRut(rut: string): string {
  return rut.trim().toUpperCase();
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function isBoletaEncabezado(
  encabezado: DteEncabezadoDto,
): encabezado is BoletaEncabezadoDto {
  return encabezado.IdDoc.TipoDTE === 39;
}

export async function resolveVariation(
  manager: EntityManager,
  item: CreateDteDocumentDto['dte']['Detalle'][number],
  stats: { count: number },
): Promise<ProductVariation & { product?: Product; resolvedByName?: boolean }> {
  const code = item.CdgItem?.VlrCodigo?.trim();

  if (code) {
    const bySku = await manager.findOne(ProductVariation, {
      where: { sku: code },
      relations: ['product'],
    });
    if (!bySku) {
      throw new BadRequestException(
        `No se pudo resolver la variación para el SKU "${code}"`,
      );
    }
    return bySku;
  }

  const normalizedName = normalizeName(item.NmbItem);
  const candidates = await manager
    .createQueryBuilder(Product, 'product')
    .innerJoinAndSelect('product.variations', 'variations')
    .where(
      `LOWER(REPLACE(product.name, ' ', '')) = LOWER(REPLACE(:name, ' ', ''))`,
      { name: normalizedName },
    )
    .getMany();
  const byName = candidates.find(
    (product) => normalizeName(product.name) === normalizedName,
  );

  if (candidates.length > 1 || byName?.variations?.length !== 1) {
    const detail = byName
      ? `El ítem "${item.NmbItem}" tiene ${byName.variations?.length ?? 0} variaciones; usa SKU para resolverlo`
      : candidates.length > 1
        ? `El nombre "${item.NmbItem}" es ambiguo; usa SKU para resolverlo`
        : `No se pudo resolver la variación para el item "${item.NmbItem}"`;
    throw new BadRequestException(detail);
  }

  if (byName) {
    stats.count += 1;
    const variation = byName.variations[0];
    logger.warn(
      `Resolución de ítem por nombre | item="${item.NmbItem}" | variationID=${variation.variationID} | sku=${variation.sku}`,
    );
    return { ...variation, product: byName, resolvedByName: true };
  }

  throw new BadRequestException(
    `No se pudo resolver la variación para el item "${item.NmbItem}"`,
  );
}

export async function snapshotItemCosts(
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

    const costPrice = toMoney(Number(storeProduct?.priceCost ?? 0));
    const costTotal = toMoney(costPrice * item.QtyItem);
    item.costPrice = costPrice;
    item.costTotal = costTotal;
    cogsTotal = toMoney(cogsTotal + costTotal);
  }

  return { items, cogsTotal };
}

export async function mapToDocumentPayload(
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
    dto.dte.Encabezado.Emisor?.RUTEmisor &&
    normalizeRut(dto.dte.Encabezado.Emisor.RUTEmisor) !==
      normalizeRut(store.rut)
  ) {
    throw new BadRequestException(
      `El RUTEmisor del payload no coincide con el RUT de la tienda de sesión`,
    );
  }

  if (dto.purchaseOrderID) {
    const po = await manager.findOne(PurchaseOrder, {
      where: {
        purchaseOrderID: dto.purchaseOrderID,
        store: { storeID: store.storeID },
      },
    });
    if (!po) {
      throw new BadRequestException(
        `Orden de compra ${dto.purchaseOrderID} no encontrada para esta tienda`,
      );
    }
    if (po.status !== PurchaseOrderCommercialStatus.ACEPTADO) {
      throw new BadRequestException(
        `La orden de compra ${dto.purchaseOrderID} no está en estado Aceptado (actual: ${po.status})`,
      );
    }
  }

  // Auto-completar/construir datos del Emisor a partir de la tienda (Store),
  // respetando el esquema de Boleta (RznSocEmisor/GiroEmisor, sin
  // Acteco/Telefono) o Factura (RznSoc/GiroEmis con Acteco/Telefono) que
  // exige Openfactura.
  const encabezado = dto.dte.Encabezado;
  if (isBoletaEncabezado(encabezado)) {
    const existing = encabezado.Emisor;
    encabezado.Emisor = {
      RUTEmisor: store.rut,
      RznSocEmisor: store.businessName || store.name,
      GiroEmisor: store.giro || existing?.GiroEmisor || 'VENTA AL POR MENOR',
      DirOrigen: store.address || existing?.DirOrigen || 'DIRECCION',
      CmnaOrigen: store.city || existing?.CmnaOrigen || 'SANTIAGO',
      CdgSIISucur: store.cdgSIISucur || existing?.CdgSIISucur || undefined,
    };

    // La Boleta 39 exige IndServicio en IdDoc y no acepta campos propios de
    // Factura en Totales (TasaIVA, MontoPeriodo).
    encabezado.IdDoc = {
      TipoDTE: 39 as const,
      ...(encabezado.IdDoc.Folio !== undefined
        ? { Folio: encabezado.IdDoc.Folio }
        : {}),
      FchEmis: encabezado.IdDoc.FchEmis,
      IndServicio: encabezado.IdDoc.IndServicio ?? '3',
    };

    if (encabezado.Totales) {
      const { MntNeto, MntExe, IVA, MontoNF, MntTotal, VlrPagar } =
        encabezado.Totales;
      encabezado.Totales = {
        ...(MntNeto !== undefined ? { MntNeto } : {}),
        ...(MntExe !== undefined ? { MntExe } : {}),
        ...(IVA !== undefined ? { IVA } : {}),
        ...(MontoNF !== undefined ? { MontoNF } : {}),
        ...(MntTotal !== undefined ? { MntTotal } : {}),
        ...(VlrPagar !== undefined ? { VlrPagar } : {}),
      };
    }
  } else {
    const existing = encabezado.Emisor;
    encabezado.Emisor = {
      RUTEmisor: store.rut,
      RznSoc: store.businessName || store.name,
      GiroEmis: store.giro || existing?.GiroEmis || 'VENTA AL POR MENOR',
      Acteco: store.acteco
        ? store.acteco.split(',').map((a) => a.trim())
        : existing?.Acteco || ['479100'],
      DirOrigen: store.address || existing?.DirOrigen || 'DIRECCION',
      CmnaOrigen: store.city || existing?.CmnaOrigen || 'SANTIAGO',
      Telefono: store.phone || existing?.Telefono || '0 0',
      CdgSIISucur: store.cdgSIISucur || existing?.CdgSIISucur || undefined,
    };
  }

  const nameFallbackStats = { count: 0 };
  const normalizedItems: NormalizedDteItem[] = [];
  let subtotal = 0;

  for (const item of dto.dte.Detalle) {
    const variation = await resolveVariation(manager, item, nameFallbackStats);
    const quantity = Number(item.QtyItem);
    const unitPrice =
      item.PrcItem !== undefined
        ? Number(item.PrcItem)
        : item.MontoItem !== undefined && quantity > 0
          ? Number(item.MontoItem) / quantity
          : 0;
    const amount = toMoney(
      item.MontoItem !== undefined
        ? Number(item.MontoItem)
        : unitPrice * quantity,
    );

    subtotal += amount;
    normalizedItems.push({
      NroLinDet: item.NroLinDet,
      NmbItem: item.NmbItem,
      QtyItem: quantity,
      PrcItem: toMoney(unitPrice),
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
    logger.warn(
      `DTE: ${nameFallbackStats.count} ítem(s) resuelto(s) por nombre en este documento; auditar payloads para migrar a SKU`,
    );
  }

  const { items: normalizedItemsWithCosts, cogsTotal } =
    await snapshotItemCosts(manager, store.storeID, normalizedItems);

  const net = toMoney(dto.dte.Encabezado.Totales?.MntNeto ?? subtotal);
  const tax = toMoney(dto.dte.Encabezado.Totales?.IVA ?? 0);
  const total = toMoney(dto.dte.Encabezado.Totales?.MntTotal ?? subtotal + tax);

  return {
    normalizedItems: normalizedItemsWithCosts,
    store,
    totals: {
      subtotal: toMoney(subtotal),
      net,
      tax,
      total,
      cogsTotal,
    },
  };
}
