import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { CustomMessage } from '../common/decorators/response-message';
import { CashClosingsService } from './cash-closings.service';
import { CompleteCashRegisterClosingDto } from './dto/complete-cash-register-closing.dto';
import { CountCashRegisterClosingDto } from './dto/count-cash-register-closing.dto';
import { RejectCashRegisterClosingDto } from './dto/reject-cash-register-closing.dto';
import { StartCashRegisterClosingDto } from './dto/start-cash-register-closing.dto';
import { CashRegisterClosing } from './entities/cash-register-closing.entity';

@ApiTags('Cajas')
@Controller('cash-registers/:cashRegisterID/sessions/:sessionId/closing')
export class CashClosingsController {
  constructor(private readonly cashClosingsService: CashClosingsService) {}

  @Post('start')
  @ApiOperation({
    summary: 'Iniciar el arqueo formal de la sesión de caja',
    description:
      'Deja el cierre en estado PENDING y toma la fotografía del saldo esperado de efectivo y de los cobros en tarjetas u otros medios. La sesión permanece OPEN hasta completar el arqueo.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 201,
    description: 'Arqueo iniciado exitosamente.',
    type: CashRegisterClosing,
  })
  @ApiResponse({
    status: 409,
    description: 'La sesión ya tiene un arqueo en curso (PENDING).',
  })
  @CustomMessage('Arqueo de caja iniciado exitosamente')
  startClosing(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: StartCashRegisterClosingDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashClosingsService.startClosing(
      cashRegisterID,
      sessionId,
      dto,
      user,
    );
  }

  @Patch('count')
  @ApiOperation({
    summary: 'Registrar el efectivo contado del arqueo',
    description:
      'Guarda el monto de efectivo físico contado y computa la diferencia contra el saldo esperado (countedCashAmount - expectedCashAmount). La sesión permanece OPEN.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 200,
    description: 'Conteo registrado exitosamente.',
    type: CashRegisterClosing,
  })
  @ApiResponse({
    status: 404,
    description: 'La sesión no tiene un arqueo en curso (PENDING).',
  })
  @CustomMessage('Conteo de efectivo registrado exitosamente')
  registerCount(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CountCashRegisterClosingDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashClosingsService.registerCount(
      cashRegisterID,
      sessionId,
      dto,
      user,
    );
  }

  @Post('complete')
  @ApiOperation({
    summary: 'Completar el arqueo y cerrar la sesión de caja',
    description:
      'Sella los montos finales del cierre (esperado, contado y diferencia) y pasa la sesión a CLOSED. Una vez cerrada, la sesión no admite nuevos movimientos ni cobros.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 201,
    description: 'Arqueo completado y sesión cerrada exitosamente.',
    type: CashRegisterClosing,
  })
  @ApiResponse({
    status: 400,
    description: 'El arqueo no tiene efectivo contado registrado.',
  })
  @ApiResponse({
    status: 404,
    description: 'La sesión no tiene un arqueo en curso (PENDING).',
  })
  @CustomMessage('Arqueo completado y sesión cerrada exitosamente')
  completeClosing(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CompleteCashRegisterClosingDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashClosingsService.completeClosing(
      cashRegisterID,
      sessionId,
      dto,
      user,
    );
  }

  @Post('reject')
  @ApiOperation({
    summary: 'Rechazar el arqueo en curso (revisión de supervisor)',
    description:
      'Marca el cierre PENDING como REJECTED y deja la sesión OPEN para rehacer el conteo. Requiere rol admin, jefe de tienda o token MASTER.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 201,
    description: 'Arqueo rechazado exitosamente.',
    type: CashRegisterClosing,
  })
  @ApiResponse({
    status: 403,
    description: 'El usuario no tiene facultad de aprobación.',
  })
  @ApiResponse({
    status: 404,
    description: 'La sesión no tiene un arqueo en curso (PENDING).',
  })
  @CustomMessage('Arqueo de caja rechazado exitosamente')
  rejectClosing(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: RejectCashRegisterClosingDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashClosingsService.rejectClosing(
      cashRegisterID,
      sessionId,
      dto,
      user,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Historial de arqueos de una sesión de caja',
    description:
      'Devuelve los arqueos de la sesión ordenados del más reciente al más antiguo, incluyendo el que esté en curso (PENDING).',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 200,
    description: 'Arqueos obtenidos exitosamente.',
    type: [CashRegisterClosing],
  })
  @CustomMessage('Arqueos de caja obtenidos exitosamente')
  findClosings(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.cashClosingsService.findClosings(cashRegisterID, sessionId);
  }
}
