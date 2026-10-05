import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ChannelRoute } from '../auth/decorators/channel-route.decorator';
import { CommerceService } from './commerce.service';
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
  @ApiOperation({ summary: 'Catálogo y stock de la tienda vinculada' })
  catalog(@Req() request: ChannelRequest) {
    return this.commerce.catalog(request.user.storeId);
  }

  @Post('quote')
  @ApiOperation({ summary: 'Cotizar productos de la tienda vinculada' })
  quote(@Req() request: ChannelRequest, @Body() dto: CommerceQuoteDto) {
    return this.commerce.quote(request.user.storeId, dto);
  }
}
