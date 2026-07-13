import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { PricingService } from './pricing.service';
import { OfferService } from './offer.service';
import { UpdatePriceDto } from './dto/update-price.dto';
import { CreateSpecialOfferDto } from './dto/create-special-offer.dto';
import { UpdateSpecialOfferDto } from './dto/update-special-offer.dto';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CalculatePriceDto } from './dto/calculate-price.dto';
import { PricingListQueryDto } from './dto/pricing-list.query.dto';
import { SpecialOfferListQueryDto } from './dto/special-offer-list.query.dto';

@ApiTags('Precios de productos')
@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricingService: PricingService,
    private readonly offerService: OfferService,
  ) {}

  @Post('update')
  @ApiOperation({ summary: 'Actualizar precio y registrar historial' })
  updatePrice(@Body() updatePriceDto: UpdatePriceDto) {
    return this.pricingService.updatePrice(updatePriceDto);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Obtener historial de precios completo o filtrado',
  })
  @ApiQuery({
    name: 'storeProductID',
    required: false,
    description: 'Filtra el historial por producto de tienda',
  })
  @ApiQuery({
    name: 'storeID',
    required: false,
    description: 'Filtra el historial por tienda',
  })
  @ApiQuery({
    name: 'variationID',
    required: false,
    description: 'Filtra el historial por variación',
  })
  getPriceHistory(@Query() query: PricingListQueryDto) {
    return this.pricingService.getPriceHistoryList(query);
  }

  @Get('offers')
  @ApiOperation({
    summary: 'Listar todas las ofertas especiales o filtrar por producto',
  })
  @ApiQuery({
    name: 'storeProductID',
    required: false,
    description: 'Filtra las ofertas por producto de tienda',
  })
  getOffers(@Query() query: SpecialOfferListQueryDto) {
    return this.offerService.getSpecialOffers(query.storeProductID);
  }

  @Post('offers')
  @ApiOperation({ summary: 'Crear una oferta especial' })
  createOffer(@Body() createSpecialOfferDto: CreateSpecialOfferDto) {
    return this.offerService.createSpecialOffer(createSpecialOfferDto);
  }

  @Post('offers/:id')
  @ApiOperation({ summary: 'Actualizar una oferta especial' })
  updateOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSpecialOfferDto: UpdateSpecialOfferDto,
  ) {
    return this.offerService.updateSpecialOffer(id, updateSpecialOfferDto);
  }

  @Post('calculate')
  @ApiOperation({
    summary: 'Calcular precio final con motor de precios y contexto opcional',
  })
  @ApiBody({ type: CalculatePriceDto })
  calculate(@Body() input: CalculatePriceDto) {
    return this.pricingService.calculatePrice(input);
  }

  @Get('price-check/:storeProductID')
  @ApiOperation({
    summary: 'Calcular precio final rápido con cantidad 1 e historial activo',
  })
  checkPrice(@Param('storeProductID', ParseUUIDPipe) storeProductID: string) {
    return this.pricingService.calculatePrice({ storeProductID, quantity: 1 });
  }
}
