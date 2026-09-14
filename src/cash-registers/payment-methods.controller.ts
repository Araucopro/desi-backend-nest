import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CustomMessage } from '../common/decorators/response-message';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { QueryPaymentMethodsDto } from './dto/query-payment-methods.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethod } from './entities/payment-method.entity';
import { PaymentMethodsService } from './payment-methods.service';

@ApiTags('Medios de pago')
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un medio de pago del tenant',
    description:
      'Registra un medio de pago (efectivo, débito, crédito, transferencia, etc.). Solo los medios que afectan efectivo generan movimientos de caja al cobrar.',
  })
  @ApiResponse({
    status: 201,
    description: 'Medio de pago creado exitosamente.',
    type: PaymentMethod,
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un medio de pago con ese código en el tenant.',
  })
  @CustomMessage('Medio de pago creado exitosamente')
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(dto);
  }

  @Post('defaults')
  @ApiOperation({
    summary: 'Generar catálogo estándar de medios de pago',
    description:
      'Crea de forma idempotente el catálogo estándar del tenant: efectivo, débito, crédito y transferencia. Los códigos existentes no se modifican.',
  })
  @ApiResponse({
    status: 201,
    description: 'Catálogo estándar disponible.',
    type: [PaymentMethod],
  })
  @CustomMessage('Catálogo de medios de pago disponible')
  seedDefaults() {
    return this.paymentMethodsService.seedDefaults();
  }

  @Get()
  @ApiOperation({
    summary: 'Listar medios de pago del tenant',
    description:
      'Obtiene los medios de pago con filtros opcionales por estado o tipo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Medios de pago obtenidos exitosamente.',
    type: [PaymentMethod],
  })
  @CustomMessage('Medios de pago obtenidos exitosamente')
  findAll(@Query() query: QueryPaymentMethodsDto) {
    return this.paymentMethodsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un medio de pago' })
  @ApiParam({ name: 'id', description: 'ID UUID del medio de pago' })
  @ApiResponse({
    status: 200,
    description: 'Medio de pago obtenido exitosamente.',
    type: PaymentMethod,
  })
  @ApiResponse({ status: 404, description: 'Medio de pago no encontrado.' })
  @CustomMessage('Medio de pago obtenido exitosamente')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentMethodsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un medio de pago',
    description:
      'Permite renombrar, cambiar el tipo o activar/desactivar un medio de pago. El código es inmutable para no romper integraciones.',
  })
  @ApiParam({ name: 'id', description: 'ID UUID del medio de pago' })
  @ApiResponse({
    status: 200,
    description: 'Medio de pago actualizado exitosamente.',
    type: PaymentMethod,
  })
  @ApiResponse({ status: 404, description: 'Medio de pago no encontrado.' })
  @CustomMessage('Medio de pago actualizado exitosamente')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.paymentMethodsService.update(id, dto);
  }
}
