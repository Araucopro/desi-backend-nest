import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { DispatchGuide } from './entities/dispatch-guide.entity';

export type DispatchGuideReferenceView = {
  dispatchGuideReferenceID: string;
  items: DispatchGuideReferenceItemView[];
  dteDocumentID: string;
  saleID: string | null;
  createdAt: Date;
  dte: DteDocumentResponseDto | null;
};

export type DispatchGuideReferenceItemView = {
  dispatchGuideReferenceItemID: string;
  variationID: string;
  quantity: number;
};

export type DispatchGuideView = {
  dispatchGuide: DispatchGuide;
  dte: DteDocumentResponseDto | null;
  references: DispatchGuideReferenceView[];
};
