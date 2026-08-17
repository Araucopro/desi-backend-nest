import { DteDocument } from '../dte/entities/dte-document.entity';
import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { Sale } from './entities/sale.entity';
import { SaleView } from './sales.types';

export function toDteSummary(
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

export function toSaleView(
  sale: Sale,
  dteResponse?: DteDocumentResponseDto | null,
): SaleView {
  return {
    sale,
    dte: dteResponse ?? toDteSummary(sale.dteDocument),
  };
}
