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
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { GetStoreId } from '../common/decorators/get-store-id.decorator';
import { StoreContextGuard } from '../common/guards/store-context.guard';
import { UserRole } from '../users/entities/user.entity';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales.query.dto';
import { ConvertSaleDto } from './dto/convert-sale.dto';
import { SaleListResponseDto, SaleResponseDto } from './dto/sale-response.dto';

const SALE_ROLES = [
  UserRole.ADMIN,
  UserRole.STORE_MANAGER,
  UserRole.CONSIGNADO,
  UserRole.TERCERO,
];

@ApiTags('Ventas')
@Controller('sales')
@UseGuards(StoreContextGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @Roles(...SALE_ROLES)
  @ApiOperation({
    summary: 'Crear venta (boleta, factura o nota de venta)',
    description:
      'Boleta (39) y factura (33) se emiten vía Openfactura a través de DteService. La nota de venta descuenta stock, registra movimientos de inventario y ledger financiero sin facturador. Los descuentos se aplican automáticamente desde las ofertas activas del motor de precios; no se aceptan descuentos manuales en la venta.',
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
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateSaleDto,
  ) {
    return this.salesService.create(storeID, idempotencyKey, dto, userId);
  }

  @Get()
  @Roles(...SALE_ROLES)
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
    enum: ['EMITIDA', 'CONVERTIDA'],
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: SaleListResponseDto })
  findAll(@GetStoreId() storeID: string, @Query() query: ListSalesQueryDto) {
    return this.salesService.findAll(storeID, query);
  }

  @Get(':saleID')
  @Roles(...SALE_ROLES)
  @ApiOperation({ summary: 'Obtener venta por ID' })
  @ApiParam({ name: 'saleID', description: 'UUID de la venta' })
  @ApiResponse({ status: 200, type: SaleResponseDto })
  findOne(
    @Param('saleID', ParseUUIDPipe) saleID: string,
    @GetStoreId() storeID: string,
  ) {
    return this.salesService.findOne(saleID, storeID);
  }

  @Post(':saleID/convert')
  @Roles(...SALE_ROLES)
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
    @Body() dto?: ConvertSaleDto,
  ) {
    return this.salesService.convert(saleID, storeID, dto);
  }
}
