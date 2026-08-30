import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { GetAbility } from '../auth/decorators/get-ability.decorator';
import { TenantAbility } from '../auth/ability/ability.factory';
import { GetStoreId } from '../common/decorators/get-store-id.decorator';
import { StoreContextGuard } from '../common/guards/store-context.guard';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { ListReturnsQueryDto } from './dto/list-returns.query.dto';
import {
  ReturnListResponseDto,
  ReturnResponseDto,
} from './dto/return-response.dto';

@ApiTags('Devoluciones')
@Controller('returns')
@UseGuards(StoreContextGuard)
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @RequirePermission('returns:write')
  @ApiOperation({
    summary: 'Crear devolución (TOTAL, PARCIAL o DESCUENTO)',
    description:
      'Registra la devolución en estado PENDIENTE. La aprobación la realiza un admin y, según el documento original, emite NCE 61 o reintegra directamente el stock de una nota de venta.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Tienda de la venta original',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para evitar duplicados',
  })
  @ApiBody({ type: CreateReturnDto })
  @ApiResponse({ status: 201, type: ReturnResponseDto })
  create(
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetUser('masterUserId') impersonatedBy: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateReturnDto,
  ) {
    return this.returnsService.create(
      storeID,
      idempotencyKey,
      dto,
      userId,
      impersonatedBy,
    );
  }

  @Get()
  @RequirePermission('returns:read')
  @ApiOperation({
    summary: 'Listar devoluciones de la tienda activa',
    description:
      'Devuelve devoluciones con filtros opcionales por venta, estado y tipo, con paginación.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Tienda activa',
  })
  @ApiQuery({ name: 'saleID', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDIENTE', 'APROBADA', 'COMPLETADA', 'RECHAZADA', 'CANCELADA'],
  })
  @ApiQuery({
    name: 'returnType',
    required: false,
    enum: ['TOTAL', 'PARCIAL', 'DESCUENTO'],
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: ReturnListResponseDto })
  findAll(
    @GetStoreId() storeID: string,
    @Query() query: ListReturnsQueryDto,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.returnsService.findAll(storeID, query, userId, ability);
  }

  @Get(':returnID')
  @RequirePermission('returns:read')
  @ApiOperation({ summary: 'Obtener devolución por ID' })
  @ApiParam({ name: 'returnID', description: 'UUID de la devolución' })
  @ApiResponse({ status: 200, type: ReturnResponseDto })
  findOne(
    @Param('returnID', ParseUUIDPipe) returnID: string,
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.returnsService.findOne(returnID, storeID, userId, ability);
  }

  @Post(':returnID/approve')
  @RequirePermission('returns:approve')
  @ApiOperation({
    summary: 'Aprobar devolución',
    description:
      'Emite la NCE 61 si el documento original es boleta/factura (o nota convertida) y completa el retorno cuando queda EMITIDO. Para notas de venta sin DTE reintegra stock y ledger en un solo paso.',
  })
  @ApiParam({ name: 'returnID', description: 'UUID de la devolución' })
  @ApiResponse({ status: 200, type: ReturnResponseDto })
  approve(
    @Param('returnID', ParseUUIDPipe) returnID: string,
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.returnsService.approve(returnID, storeID, userId, ability);
  }

  @Post(':returnID/reject')
  @RequirePermission('returns:reject')
  @ApiOperation({ summary: 'Rechazar devolución pendiente' })
  @ApiParam({ name: 'returnID', description: 'UUID de la devolución' })
  @ApiResponse({ status: 200, type: ReturnResponseDto })
  reject(
    @Param('returnID', ParseUUIDPipe) returnID: string,
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.returnsService.reject(returnID, storeID, userId, ability);
  }

  @Post(':returnID/cancel')
  @RequirePermission('returns:cancel')
  @ApiOperation({ summary: 'Cancelar devolución pendiente' })
  @ApiParam({ name: 'returnID', description: 'UUID de la devolución' })
  @ApiResponse({ status: 200, type: ReturnResponseDto })
  cancel(
    @Param('returnID', ParseUUIDPipe) returnID: string,
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.returnsService.cancel(returnID, storeID, userId, ability);
  }

  @Post(':returnID/reconcile')
  @RequirePermission('returns:reconcile')
  @ApiOperation({
    summary: 'Reconciliar NCE pendiente',
    description:
      'Reintenta la reconciliación del DTE NCE contra Openfactura y completa el retorno si queda EMITIDO.',
  })
  @ApiParam({ name: 'returnID', description: 'UUID de la devolución' })
  @ApiResponse({ status: 200, type: ReturnResponseDto })
  reconcile(
    @Param('returnID', ParseUUIDPipe) returnID: string,
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.returnsService.reconcile(returnID, storeID, userId, ability);
  }
}
