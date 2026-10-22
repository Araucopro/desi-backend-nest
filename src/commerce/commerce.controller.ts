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

type ChannelRequest = FastifyRequest & {
  user: {
    type: 'channel';
    channelId: string;
    channelCode: string;
    channelName: string;
    domain: string | null;
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
    };
  }

  @Get('catalog')
  @ApiOkResponse({ type: [CommerceCatalogProductDto] })
  @ApiOperation({
    summary: 'Catalogo y stock de la tienda vinculada',
    description:
      'Solo productos con foto HTTP/HTTPS, descripcion y slug. image contiene hasta cinco URLs separadas por comas. Sin requisito de categoria ni de stock positivo.',
  })
  catalog(@Req() request: ChannelRequest) {
    return this.commerce.catalog(request.user.storeId);
  }

  @Post('quote')
  @ApiCreatedResponse({ type: CommerceQuoteResponseDto })
  @ApiOperation({
    summary: 'Cotizar productos de la tienda vinculada',
    description:
      'Cada item incluye storeProductID, sku, name, image (portada), size, color, quantity, unitPrice, lineTotal y available. Productos sin contenido web completo: 400.',
  })
  quote(@Req() request: ChannelRequest, @Body() dto: CommerceQuoteDto) {
    return this.commerce.quote(request.user.storeId, dto);
  }
}
