import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GetStoreId } from '../common/decorators/get-store-id.decorator';
import { StoreContextGuard } from '../common/guards/store-context.guard';
import { CreateDteDocumentDto } from './dto/create-dte-document.dto';
import { DteDocumentResponseDto } from './dto/dte-document-response.dto';
import { DteService } from './dte.service';

@ApiTags('DTE')
@Controller('v2/dte')
@UseGuards(StoreContextGuard)
export class DteController {
  constructor(private readonly dteService: DteService) {}

  @Post('document')
  @RequirePermission('sales:write')
  @ApiOperation({
    summary: 'Crear documento DTE compatible con v2_dte_document',
    description:
      'Recibe el payload del POS/frontend autenticado, lo normaliza al modelo interno y persiste el documento local junto con la OC asociada cuando corresponde. Requiere sesión de tenant y tienda activa.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Tienda activa desde la que se emite el documento',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para evitar duplicados',
  })
  @ApiBody({ type: CreateDteDocumentDto })
  @ApiResponse({ status: 201, type: DteDocumentResponseDto })
  create(
    @GetStoreId() storeID: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateDteDocumentDto,
  ) {
    return this.dteService.create(storeID, idempotencyKey, dto);
  }

  @Post(':dteDocumentID/reconcile')
  @RequirePermission('dte:reconcile')
  @ApiOperation({
    summary: 'Reconciliar un documento DTE pendiente contra Openfactura',
    description:
      'Consulta el TOKEN del documento en Openfactura y transiciona PENDIENTE a EMITIDO (con ledger) o a ERROR (revirtiendo la reserva de stock).',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Tienda a la que pertenece el documento',
  })
  @ApiParam({
    name: 'dteDocumentID',
    required: true,
    description: 'UUID del documento DTE',
  })
  @ApiResponse({ status: 200, type: DteDocumentResponseDto })
  reconcile(
    @Param('dteDocumentID', ParseUUIDPipe) dteDocumentID: string,
    @GetStoreId() storeID: string,
  ) {
    return this.dteService.reconcile(dteDocumentID, storeID);
  }
}
