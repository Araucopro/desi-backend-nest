import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ChannelRoute } from '../auth/decorators/channel-route.decorator';
import { CommerceService } from './commerce.service';
import {
  CommerceCatalogProductDto,
  CommerceQuoteResponseDto,
} from './dto/catalog-response.dto';
import { CommerceQuoteDto } from './dto/quote.dto';
import { CommerceContextResponseDto } from './dto/commerce-context-response.dto';

type ChannelRequest = FastifyRequest & {
  user: {
    type: 'channel';
    channelId: string;
    channelCode: string;
    channelName: string;
    domain: string | null;
    salesEnabled: boolean;
    acceptTestPayments: boolean;
    requireProductPhoto: boolean;
    tenantId: string;
    storeId: string;
  };
};

@ApiTags('Canal ecommerce')
@ApiBearerAuth()
@ChannelRoute()
@Controller('internal/commerce')
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}

  @Get('context')
  @ApiOkResponse({ type: CommerceContextResponseDto })
  @ApiOperation({
    summary: 'Verificar la vinculación del canal con tenant y tienda',
  })
  async context(@Req() request: ChannelRequest) {
    return {
      ...(await this.commerce.context(request.user.storeId)),
      channelID: request.user.channelId,
      channelCode: request.user.channelCode,
      channelName: request.user.channelName,
      domain: request.user.domain,
      salesEnabled: request.user.salesEnabled === true,
      acceptTestPayments: request.user.acceptTestPayments === true,
      requireProductPhoto: request.user.requireProductPhoto !== false,
    };
  }

  @Get('catalog')
  @ApiOkResponse({ type: [CommerceCatalogProductDto] })
  @ApiOperation({
    summary: 'Catalogo y stock de la tienda vinculada',
    description:
      'Descripcion y slug son opcionales: si falta el slug, devuelve una URL estable basada en productID. La foto HTTP/HTTPS solo es obligatoria si requireProductPhoto esta activado. Incluye productos sin precio calculable y agotados; las validaciones de compra se aplican al cotizar.',
  })
  catalog(@Req() request: ChannelRequest) {
    return this.commerce.catalog(
      request.user.storeId,
      request.user.requireProductPhoto !== false,
    );
  }

  @Post('quote')
  @ApiCreatedResponse({ type: CommerceQuoteResponseDto })
  @ApiOperation({
    summary: 'Cotizar productos de la tienda vinculada',
    description:
      'Cada item incluye storeProductID, sku, name, image (portada o null), size, color, quantity, unitPrice, lineTotal y available. No exige descripcion ni slug. Aplica la politica requireProductPhoto del canal y conserva el motor de precios y las comprobaciones de stock y tienda.',
  })
  quote(@Req() request: ChannelRequest, @Body() dto: CommerceQuoteDto) {
    return this.commerce.quote(
      request.user.storeId,
      dto,
      request.user.requireProductPhoto !== false,
    );
  }
}
