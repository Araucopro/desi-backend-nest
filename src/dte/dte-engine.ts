import { randomBytes, randomInt } from 'crypto';
import { Store } from '../stores/entities/store.entity';
import { CreateDteDocumentDto } from './dto/create-dte-document.dto';
import {
  buildNormalizedPayload,
  formatJson,
  NormalizedDteItem,
  normalizeStatus,
  previewText,
} from './dte-response.mapper';
import {
  DteDocument,
  DteDocumentPaymentType,
  DteDocumentStatus,
} from './entities/dte-document.entity';
import { OpenfacturaCallResult } from './openfactura-client.service';
import { DteFinalizePlan, DtePreparationValues } from './dte.types';

export const LOCAL_TOKEN_PREFIX = 'local-';

export function toDateOnly(value: string): Date {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function buildLocalToken(): string {
  return `${LOCAL_TOKEN_PREFIX}${randomBytes(28).toString('hex')}`;
}

export function resolveFolio(existing?: number | null): number {
  return existing && existing > 0 ? existing : randomInt(100000, 999999);
}

export function readNormalizedItems(
  document: DteDocument,
): NormalizedDteItem[] {
  const items = (document.payloadNormalized as { items?: unknown } | null)
    ?.items;
  return Array.isArray(items) ? (items as NormalizedDteItem[]) : [];
}

export function costSnapshotChanged(
  document: DteDocument,
  normalizedItems: NormalizedDteItem[],
  reservedCogsTotal: number,
): boolean {
  const currentItems = readNormalizedItems(document);

  return (
    reservedCogsTotal !== document.cogsTotal ||
    normalizedItems.some((item, index) => {
      const current = currentItems[index];
      return (
        !current ||
        current.costPrice !== item.costPrice ||
        current.costTotal !== item.costTotal
      );
    })
  );
}

export function buildDtePreparationValues(input: {
  dto: CreateDteDocumentDto;
  store: Store;
  normalizedItems: NormalizedDteItem[];
  totals: {
    subtotal: number;
    net: number;
    tax: number;
    total: number;
    cogsTotal: number;
  };
  tenantID: string;
  apikey: string;
  idempotencyKey: string | null;
  purchaseOrderID: string | undefined;
  saleID: string | undefined;
  reserveStock: boolean;
  token: string;
  folio: number;
  paymentType: DteDocumentPaymentType;
}): DtePreparationValues {
  const { dto, store, normalizedItems, totals } = input;
  const paymentType = input.paymentType;

  return {
    tenantID: input.tenantID,
    apikey: input.apikey,
    idempotencyKey: input.idempotencyKey,
    purchaseOrderID: dto.purchaseOrderID ?? null,
    saleID: input.saleID ?? null,
    stockReserved: input.reserveStock,
    token: input.token,
    folio: input.folio,
    store: { storeID: store.storeID },
    storeID: store.storeID,
    status: DteDocumentStatus.PENDIENTE,
    documentType: dto.dte.Encabezado.IdDoc.TipoDTE ?? null,
    paymentType,
    total: totals.total,
    netTotal: totals.net,
    taxTotal: totals.tax,
    cogsTotal: totals.cogsTotal,
    issueDate: toDateOnly(dto.dte.Encabezado.IdDoc.FchEmis),
    payloadRaw: dto as unknown as Record<string, unknown>,
    payloadNormalized: buildNormalizedPayload(
      dto,
      store,
      normalizedItems,
      totals,
      input.token,
      input.folio,
      paymentType,
      DteDocumentStatus.PENDIENTE,
    ),
    errorDetail: null,
  };
}

export function buildDteFinalizePlan(
  document: DteDocument,
  result: OpenfacturaCallResult,
): DteFinalizePlan {
  const payloadStatus = result.ok
    ? normalizeStatus(result.payload.status)
    : DteDocumentStatus.ERROR;

  if (result.ok && payloadStatus !== DteDocumentStatus.ERROR) {
    const responseToken = result.payload.TOKEN ?? result.payload.token;
    const responseFolio = result.payload.FOLIO ?? result.payload.folio;

    return {
      kind: 'success',
      status: payloadStatus,
      token: responseToken ?? document.token,
      folio:
        responseFolio !== undefined ? Number(responseFolio) : document.folio,
      errorDetail: null,
      extraPayload: result.payload,
    };
  }

  const statusPreview = result.ok ? formatJson(result.payload) : '';
  const errorDetail = result.ok
    ? `Openfactura reportó estado ERROR${
        statusPreview ? `: ${statusPreview}` : ''
      }`
    : result.errorDetail;

  return {
    kind: 'error',
    status: DteDocumentStatus.ERROR,
    token: !result.ok && result.token ? result.token : document.token,
    folio:
      !result.ok && result.folio !== undefined
        ? Number(result.folio)
        : document.folio,
    errorDetail,
    message: `Openfactura no pudo emitir el documento ${
      document.dteDocumentID
    }: ${previewText(errorDetail)}`,
  };
}
