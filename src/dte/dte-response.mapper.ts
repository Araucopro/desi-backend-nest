import { CreateDteDocumentDto } from './dto/create-dte-document.dto';
import { DteDocumentResponseDto } from './dto/dte-document-response.dto';
import {
  DteDocument,
  DteDocumentPaymentType,
  DteDocumentStatus,
} from './entities/dte-document.entity';
import { Store } from '../stores/entities/store.entity';
import { OpenfacturaDocumentResponse } from './openfactura-client.service';

export const ERROR_DETAIL_PREVIEW_LIMIT = 300;
export const BINARY_RESPONSE_KEYS = ['PDF', 'XML', 'TIMBRE'];

export type NormalizedDteItem = {
  NroLinDet: number;
  NmbItem: string;
  QtyItem: number;
  PrcItem: number;
  MontoItem: number;
  costPrice: number;
  costTotal: number;
  variationID: string | null;
  sku?: string | null;
  productName?: string | null;
  resolvedByName?: boolean;
};

export function buildResponse(
  document: DteDocument,
  extraPayload?: OpenfacturaDocumentResponse,
): DteDocumentResponseDto {
  const base: DteDocumentResponseDto = {
    dteDocumentID: document.dteDocumentID,
    TOKEN: document.token,
    FOLIO: document.folio,
    STATUS: document.status,
    saleID: document.saleID,
  };

  if (extraPayload) {
    if (extraPayload.PDF) base.PDF = String(extraPayload.PDF);
    if (extraPayload.XML) base.XML = String(extraPayload.XML);
    if (Array.isArray(extraPayload.WARNING))
      base.WARNING = extraPayload.WARNING;
    // Copiar cualquier otra clave devuelta por Openfactura
    for (const [key, value] of Object.entries(extraPayload)) {
      if (
        !['TOKEN', 'FOLIO', 'status', 'STATUS', 'token', 'folio'].includes(key)
      ) {
        base[key] = value;
      }
    }
  }

  return base;
}

export function normalizeStatus(status?: string): DteDocumentStatus {
  if (status === DteDocumentStatus.ERROR) return DteDocumentStatus.ERROR;
  if (status === DteDocumentStatus.PENDIENTE) {
    return DteDocumentStatus.PENDIENTE;
  }
  return DteDocumentStatus.EMITIDO;
}

export function buildNormalizedPayload(
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
    store: {
      storeID: store.storeID,
      rut: store.rut,
      name: store.name,
      location: store.location,
    },
    dte: dto.dte,
    customer: dto.customer ?? null,
    customizePage: dto.customizePage ?? null,
    response: dto.response,
    totals,
    items: normalizedItems,
  };
}

export function applyFinalStatusToNormalized(
  document: DteDocument,
  errorDetail?: string | null,
): Record<string, unknown> {
  const current =
    document.payloadNormalized && typeof document.payloadNormalized === 'object'
      ? { ...document.payloadNormalized }
      : {};
  current.status = document.status;
  current.token = document.token;
  current.folio = document.folio;
  if (errorDetail !== undefined) current.errorDetail = errorDetail;
  return current;
}

export function formatJson(payload: OpenfacturaDocumentResponse): string {
  try {
    const safePayload = Object.fromEntries(
      Object.entries(payload).filter(
        ([key]) => !BINARY_RESPONSE_KEYS.includes(key),
      ),
    );
    return JSON.stringify(safePayload) ?? '';
  } catch {
    return '';
  }
}

export function previewText(text: string): string {
  const clean = text.trim();
  if (!clean) return '';
  return clean.length > ERROR_DETAIL_PREVIEW_LIMIT
    ? `${clean.slice(0, ERROR_DETAIL_PREVIEW_LIMIT)}...`
    : clean;
}
