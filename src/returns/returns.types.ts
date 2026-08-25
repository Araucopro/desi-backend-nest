import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { Return } from './entities/return.entity';

export type ReturnView = {
  ret: Return;
  dte: DteDocumentResponseDto | null;
};
