import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ChannelRoute } from '../auth/decorators/channel-route.decorator';
import {
  CommerceBinding,
  CommerceSalesService,
} from './commerce-sales.service';
import { CreateCommerceSaleDto } from './dto/create-commerce-sale.dto';
import { CommerceSaleResponseDto } from './dto/commerce-sale-response.dto';

type ChannelRequest = FastifyRequest & { user: CommerceBinding };

@ApiTags('Canal ecommerce')
@ApiBearerAuth()
@ChannelRoute()
@Controller('internal/commerce/sales')
export class CommerceSalesController {
  constructor(private readonly commerceSales: CommerceSalesService) {}
  @Post()
  @ApiOperation({
    summary: 'Confirmar un pedido pagado como nota de venta, sin caja fisica',
    description:
      'Exclusivo para backends de ecommerce. El proveedor debe haber sido verificado por el adaptador de pago. El tenant y tienda se resuelven del token; repetir el mismo externalOrderID devuelve la misma venta.',
  })
  @ApiResponse({
    status: 201,
    type: CommerceSaleResponseDto,
    description:
      'Venta e ingreso registrados, o respuesta idempotente de la venta existente',
  })
  @ApiResponse({
    status: 403,
    description: 'Canal no habilitado para ventas o pagos de prueba',
  })
  @ApiResponse({
    status: 409,
    description:
      'Pago reutilizado, contenido diferente, total distinto o stock insuficiente; requiere conciliacion del pago',
  })
  confirm(@Req() request: ChannelRequest, @Body() dto: CreateCommerceSaleDto) {
    return this.commerceSales.confirm(request.user, dto);
  }
  @Get(':externalOrderID')
  @ApiOperation({ summary: 'Consultar la venta asociada al pedido del canal' })
  find(
    @Req() request: ChannelRequest,
    @Param('externalOrderID') externalOrderID: string,
  ) {
    return this.commerceSales.find(request.user, externalOrderID);
  }
}
