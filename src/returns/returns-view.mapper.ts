import { DteDocument } from '../dte/entities/dte-document.entity';
import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { Return } from './entities/return.entity';
import { ReturnView } from './returns.types';

function toDteSummary(
  dte: DteDocument | null | undefined,
): DteDocumentResponseDto | null {
  if (!dte) return null;
  return {
    dteDocumentID: dte.dteDocumentID,
    TOKEN: dte.token,
    FOLIO: dte.folio,
    STATUS: dte.status,
  };
}

export function toReturnView(
  ret: Return,
  dteResponse?: DteDocumentResponseDto | null,
): ReturnView {
  return {
    ret,
    dte: dteResponse ?? toDteSummary(ret.dteDocument),
  };
}
