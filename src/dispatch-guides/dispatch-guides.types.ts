import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { DispatchGuide } from './entities/dispatch-guide.entity';

export type DispatchGuideReferenceView = {
  dispatchGuideReferenceID: string;
  dteDocumentID: string;
  saleID: string | null;
  createdAt: Date;
  dte: DteDocumentResponseDto | null;
};

export type DispatchGuideView = {
  dispatchGuide: DispatchGuide;
  dte: DteDocumentResponseDto | null;
  references: DispatchGuideReferenceView[];
};
