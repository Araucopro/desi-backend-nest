import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { DteDocument } from '../dte/entities/dte-document.entity';
import { DispatchGuide } from './entities/dispatch-guide.entity';
import {
  DispatchGuideReferenceView,
  DispatchGuideView,
} from './dispatch-guides.types';

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

export function toDispatchGuideView(
  guide: DispatchGuide,
  dteResponse?: DteDocumentResponseDto | null,
): DispatchGuideView {
  const references: DispatchGuideReferenceView[] = (guide.references ?? []).map(
    (reference) => ({
      dispatchGuideReferenceID: reference.dispatchGuideReferenceID,
      dteDocumentID: reference.dteDocumentID,
      saleID: reference.saleID,
      createdAt: reference.createdAt,
      dte: toDteSummary(reference.dteDocument),
    }),
  );

  return {
    dispatchGuide: guide,
    dte: dteResponse ?? toDteSummary(guide.dteDocument),
    references,
  };
}
