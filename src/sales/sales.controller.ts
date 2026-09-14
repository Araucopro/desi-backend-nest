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
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales.query.dto';
import { ConvertSaleDto } from './dto/convert-sale.dto';
import { SaleListResponseDto, SaleResponseDto } from './dto/sale-response.dto';

@ApiTags('Ventas')
@Controller('sales')
@UseGuards(StoreContextGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @RequirePermission('sales:write')
  @ApiOperation({
    summary: 'Crear venta (boleta, factura o nota de venta)',
    description:
      'Boleta (39) y factura (33) se emiten vía Openfactura a través de DteService. La nota de venta descuenta stock, registra movimientos de inventario y ledger financiero sin facturador. Las ofertas activas se aplican automáticamente; opcionalmente se acepta manualDiscount validado contra el rol/usuario y el margen mínimo.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Tienda activa desde la que se emite la venta',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para evitar duplicados',
  })
  @ApiBody({ type: CreateSaleDto })
  @ApiResponse({ status: 201, type: SaleResponseDto })
  create(
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetUser('masterUserId') impersonatedBy: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateSaleDto,
  ) {
    return this.salesService.create(
      storeID,
      idempotencyKey,
      dto,
      userId,
      impersonatedBy,
    );
  }

  @Get()
  @RequirePermission('sales:read')
  @ApiOperation({
    summary: 'Listar ventas',
    description:
      'Lista ventas de la tienda activa (header X-Store-ID) con filtros por tipo de venta, estado y rango de fechas, con paginación.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Tienda activa desde la que se consultan las ventas',
  })
  @ApiQuery({
    name: 'saleType',
    required: false,
    enum: ['BOLETA', 'FACTURA', 'NOTA_VENTA'],
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['EMITIDA', 'CONVERTIDA', 'ANULADA', 'DEVUELTA', 'CORREGIDA'],
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: SaleListResponseDto })
  findAll(
    @GetStoreId() storeID: string,
    @Query() query: ListSalesQueryDto,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.salesService.findAll(storeID, query, userId, ability);
  }

  @Get(':saleID')
  @RequirePermission('sales:read')
  @ApiOperation({ summary: 'Obtener venta por ID' })
  @ApiParam({ name: 'saleID', description: 'UUID de la venta' })
  @ApiResponse({ status: 200, type: SaleResponseDto })
  findOne(
    @Param('saleID', ParseUUIDPipe) saleID: string,
    @GetStoreId() storeID: string,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.salesService.findOne(saleID, storeID, userId, ability);
  }

  @Post(':saleID/convert')
  @RequirePermission('sales:convert')
  @ApiOperation({
    summary: 'Convertir nota de venta a boleta o factura electrónica',
    description:
      'Emite el DTE sin volver a descontar stock (ya salió con la nota) y reemplaza el ledger SALE_NOTE por DTE_DOCUMENT. Idempotente: si la venta ya está CONVERTIDA devuelve el DTE existente.',
  })
  @ApiParam({ name: 'saleID', description: 'UUID de la nota de venta' })
  @ApiBody({ type: ConvertSaleDto, required: false })
  @ApiResponse({ status: 200, type: SaleResponseDto })
  convert(
    @Param('saleID', ParseUUIDPipe) saleID: string,
    @GetStoreId() storeID: string,
    @Body() dto: ConvertSaleDto | undefined,
    @GetUser('userId') userId: string | undefined,
    @GetAbility() ability: TenantAbility | undefined,
  ) {
    return this.salesService.convert(saleID, storeID, dto, userId, ability);
  }
}
