import { Body, Controller, Headers, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CreateDteDocumentDto } from './dto/create-dte-document.dto';
import { DteDocumentResponseDto } from './dto/dte-document-response.dto';
import { DteService } from './dte.service';

@ApiTags('DTE')
@Controller('v2/dte')
export class DteController {
  constructor(private readonly dteService: DteService) {}

  @Public()
  @Post('document')
  @ApiOperation({
    summary: 'Crear documento DTE compatible con v2_dte_document',
    description:
      'Recibe el payload del facturador, lo normaliza al modelo interno y persiste el documento local junto con la OC asociada cuando corresponde.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para evitar duplicados',
  })
  @ApiBody({ type: CreateDteDocumentDto })
  @ApiResponse({ status: 201, type: DteDocumentResponseDto })
  create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateDteDocumentDto,
  ) {
    return this.dteService.create(idempotencyKey, dto);
  }
}
