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
import { DispatchGuidesService } from './dispatch-guides.service';
import { CreateDispatchGuideDto } from './dto/create-dispatch-guide.dto';
import { ListDispatchGuidesQueryDto } from './dto/list-dispatch-guides.query.dto';
import {
  DispatchGuideListResponseDto,
  DispatchGuideResponseDto,
} from './dto/dispatch-guide-response.dto';

@ApiTags('Guías de Despacho')
@Controller('dispatch-guides')
@UseGuards(StoreContextGuard)
export class DispatchGuidesController {
  constructor(private readonly dispatchGuidesService: DispatchGuidesService) {}

  @Post()
  @RequirePermission('dispatch-guides:write')
  @ApiOperation({
    summary: 'Crear guía de despacho (DTE 52)',
    description:
      'Crea la guía en estado PENDIENTE, la emite vía Openfactura con stock reservado (movimiento DISPATCH_GUIDE) y la marca EMITIDA cuando el DTE 52 queda EMITIDO. No registra movimientos financieros: la factura/boleta que la referencia registra ingreso y COGS.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Tienda activa desde la que se emite la guía',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para evitar duplicados',
  })
  @ApiBody({ type: CreateDispatchGuideDto })
  @ApiResponse({ status: 201, type: DispatchGuideResponseDto })
  create(
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetUser('masterUserId') impersonatedBy: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateDispatchGuideDto,
  ) {
    return this.dispatchGuidesService.create(
      storeID,
      idempotencyKey,
      dto,
      userId,
      impersonatedBy,
    );
  }

  @Get()
  @RequirePermission('dispatch-guides:read')
  @ApiOperation({
    summary: 'Listar guías de despacho',
    description:
      'Lista guías de la tienda activa con filtros opcionales por estado y rango de fechas, con paginación.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Tienda activa',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDIENTE', 'EMITIDA', 'ANULACION_PENDIENTE', 'ANULADA'],
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: DispatchGuideListResponseDto })
  findAll(
    @GetStoreId() storeID: string,
    @Query() query: ListDispatchGuidesQueryDto,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.dispatchGuidesService.findAll(storeID, query, userId, ability);
  }

  @Get(':dispatchGuideID')
  @RequirePermission('dispatch-guides:read')
  @ApiOperation({ summary: 'Obtener guía de despacho por ID' })
  @ApiParam({ name: 'dispatchGuideID', description: 'UUID de la guía' })
  @ApiResponse({ status: 200, type: DispatchGuideResponseDto })
  findOne(
    @Param('dispatchGuideID', ParseUUIDPipe) dispatchGuideID: string,
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.dispatchGuidesService.findOne(
      dispatchGuideID,
      storeID,
      userId,
      ability,
    );
  }

  @Post(':dispatchGuideID/reconcile')
  @RequirePermission('dispatch-guides:reconcile')
  @ApiOperation({
    summary: 'Reconciliar guía de despacho pendiente',
    description:
      'Reintenta la emisión del DTE 52 contra Openfactura para guías PENDIENTE, o completa la anulación para guías ANULACION_PENDIENTE.',
  })
  @ApiParam({ name: 'dispatchGuideID', description: 'UUID de la guía' })
  @ApiResponse({ status: 200, type: DispatchGuideResponseDto })
  reconcile(
    @Param('dispatchGuideID', ParseUUIDPipe) dispatchGuideID: string,
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.dispatchGuidesService.reconcile(
      dispatchGuideID,
      storeID,
      userId,
      ability,
    );
  }

  @Post(':dispatchGuideID/anular')
  @RequirePermission('dispatch-guides:anular')
  @ApiOperation({
    summary: 'Anular guía de despacho',
    description:
      'Marca la guía ANULACION_PENDIENTE, llama a anularDTE52 en Openfactura y, al confirmar, la marca ANULADA revirtiendo el stock reservado. Bloqueada si la guía ya está referenciada por una factura/boleta. Si Openfactura falla, la guía queda ANULACION_PENDIENTE para completar vía reconcile.',
  })
  @ApiParam({ name: 'dispatchGuideID', description: 'UUID de la guía' })
  @ApiResponse({ status: 200, type: DispatchGuideResponseDto })
  anular(
    @Param('dispatchGuideID', ParseUUIDPipe) dispatchGuideID: string,
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.dispatchGuidesService.anular(
      dispatchGuideID,
      storeID,
      userId,
      ability,
    );
  }
}
