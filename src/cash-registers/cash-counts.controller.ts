import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { CustomMessage } from '../common/decorators/response-message';
import { CancelCashCountDto } from './dto/cancel-cash-count.dto';
import { CompleteCashCountDto } from './dto/complete-cash-count.dto';
import { StartCashCountDto } from './dto/start-cash-count.dto';
import { UpsertCashCountItemsDto } from './dto/upsert-cash-count-items.dto';
import { CashCountsService } from './cash-counts.service';
import { CashCount } from './entities/cash-count.entity';

@ApiTags('Cajas')
@Controller('cash-registers/:cashRegisterID/sessions/:sessionId/counts')
export class CashCountsController {
  constructor(private readonly cashCountsService: CashCountsService) {}

  @Post()
  @ApiOperation({
    summary: 'Iniciar el arqueo físico detallado por denominaciones',
    description:
      'Abre un conteo en borrador (DRAFT) sobre el arqueo PENDING de la sesión. Requiere que la sesión tenga un arqueo en curso y que no exista otro conteo en borrador.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 201,
    description: 'Conteo detallado iniciado exitosamente.',
    type: CashCount,
  })
  @ApiResponse({
    status: 404,
    description: 'La sesión no tiene un arqueo en curso (PENDING).',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un conteo en curso o uno completado.',
  })
  @CustomMessage('Conteo detallado iniciado exitosamente')
  start(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: StartCashCountDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashCountsService.start(cashRegisterID, sessionId, dto, user);
  }

  @Get('current')
  @ApiOperation({
    summary: 'Obtener el último conteo detallado de la sesión',
    description:
      'Devuelve el conteo en curso o el último sellado, con su desglose de denominaciones (cantidad, valor unitario y subtotal por ítem).',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 200,
    description: 'Conteo detallado obtenido exitosamente.',
    type: CashCount,
  })
  @ApiResponse({
    status: 404,
    description: 'La sesión no tiene conteos detallados registrados.',
  })
  @CustomMessage('Conteo detallado obtenido exitosamente')
  findCurrent(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.cashCountsService.findCurrent(cashRegisterID, sessionId);
  }

  @Put('current/items')
  @ApiOperation({
    summary: 'Registrar o actualizar el desglose de denominaciones',
    description:
      'Carga cantidades por denominación y recalcula el total del conteo. Las cantidades en 0 eliminan el ítem. El total solo se proyecta al arqueo al completar el conteo.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 200,
    description: 'Desglose de denominaciones registrado exitosamente.',
    type: CashCount,
  })
  @ApiResponse({
    status: 404,
    description: 'No hay un conteo en curso (DRAFT) para el arqueo.',
  })
  @CustomMessage('Desglose de denominaciones registrado exitosamente')
  upsertItems(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: UpsertCashCountItemsDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashCountsService.upsertItems(
      cashRegisterID,
      sessionId,
      dto,
      user,
    );
  }

  @Post('current/complete')
  @ApiOperation({
    summary: 'Completar el conteo detallado y conciliar el arqueo',
    description:
      'Sella el conteo con la suma de sus denominaciones y la proyecta como efectivo contado del arqueo en curso (countedCashAmount, diferencia y total real).',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 201,
    description: 'Conteo detallado completado exitosamente.',
    type: CashCount,
  })
  @ApiResponse({
    status: 400,
    description: 'El conteo no tiene denominaciones registradas.',
  })
  @ApiResponse({
    status: 404,
    description: 'No hay un conteo en curso (DRAFT) para el arqueo.',
  })
  @CustomMessage('Conteo detallado completado exitosamente')
  complete(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CompleteCashCountDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashCountsService.complete(
      cashRegisterID,
      sessionId,
      dto,
      user,
    );
  }

  @Post('current/cancel')
  @ApiOperation({
    summary: 'Descartar el conteo detallado en curso',
    description:
      'Marca el conteo en borrador como CANCELLED con su motivo, para poder iniciar uno nuevo. El arqueo permanece PENDING.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 201,
    description: 'Conteo detallado descartado exitosamente.',
    type: CashCount,
  })
  @ApiResponse({
    status: 404,
    description: 'No hay un conteo en curso (DRAFT) para el arqueo.',
  })
  @CustomMessage('Conteo detallado descartado exitosamente')
  cancel(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CancelCashCountDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashCountsService.cancel(cashRegisterID, sessionId, dto, user);
  }
}
