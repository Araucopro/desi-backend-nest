import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { CustomMessage } from '../common/decorators/response-message';
import { CashTransfersService } from './cash-transfers.service';
import { ApproveCashTransferDto } from './dto/approve-cash-transfer.dto';
import { CancelCashTransferDto } from './dto/cancel-cash-transfer.dto';
import { CompleteCashTransferDto } from './dto/complete-cash-transfer.dto';
import { CreateCashTransferDto } from './dto/create-cash-transfer.dto';
import { QueryCashTransfersDto } from './dto/query-cash-transfers.dto';
import { RejectCashTransferDto } from './dto/reject-cash-transfer.dto';
import { CashTransfer } from './entities/cash-transfer.entity';

@ApiTags('Cajas')
@Controller('cash-registers/:cashRegisterID/sessions/:sessionId/transfers')
export class CashTransfersController {
  constructor(private readonly cashTransfersService: CashTransfersService) {}

  @Post()
  @ApiOperation({
    summary: 'Solicitar un traslado de efectivo entre cajas o hacia bóveda',
    description:
      'Crea la transferencia en estado PENDING desde la sesión abierta de la caja de origen. No mueve efectivo todavía: al completarla se descuenta de la caja origen y, si el destino es otra caja, se ingresa a su sesión abierta. Requiere aprobación de un supervisor.',
  })
  @ApiParam({
    name: 'cashRegisterID',
    description: 'ID UUID de la caja de origen',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'ID UUID de la sesión de origen',
  })
  @ApiResponse({
    status: 201,
    description: 'Transferencia solicitada exitosamente.',
    type: CashTransfer,
  })
  @ApiResponse({
    status: 400,
    description:
      'La sesión no está abierta, la caja destino es inválida o el destino no corresponde al tipo informado.',
  })
  @CustomMessage('Transferencia de fondos solicitada exitosamente')
  create(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CreateCashTransferDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashTransfersService.create(
      cashRegisterID,
      sessionId,
      dto,
      user,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Listar transferencias de fondos de una sesión',
    description:
      'Devuelve las transferencias solicitadas (SENT), recibidas (RECEIVED) o ambas (ALL), con filtros por estado, tipo de destino y rango de solicitud.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 200,
    description: 'Transferencias obtenidas exitosamente.',
    type: [CashTransfer],
  })
  @CustomMessage('Transferencias de fondos obtenidas exitosamente')
  findAll(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: QueryCashTransfersDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashTransfersService.findAll(
      cashRegisterID,
      sessionId,
      query,
      user,
    );
  }

  @Get(':transferID')
  @ApiOperation({
    summary: 'Obtener una transferencia de fondos de la sesión',
    description:
      'Devuelve el detalle de una transferencia que sale de la sesión o que llega a ella.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiParam({ name: 'transferID', description: 'ID UUID de la transferencia' })
  @ApiResponse({
    status: 200,
    description: 'Transferencia obtenida exitosamente.',
    type: CashTransfer,
  })
  @ApiResponse({
    status: 404,
    description: 'La transferencia no existe o no pertenece a la sesión.',
  })
  @CustomMessage('Transferencia de fondos obtenida exitosamente')
  findOne(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('transferID', ParseUUIDPipe) transferID: string,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashTransfersService.findOne(
      cashRegisterID,
      sessionId,
      transferID,
      user,
    );
  }

  @Post(':transferID/approve')
  @ApiOperation({
    summary: 'Aprobar una transferencia de fondos',
    description:
      'Revisión de supervisor: deja la transferencia en APPROVED sin mover efectivo. Exclusivo de administradores, jefes de tienda o tokens MASTER.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiParam({ name: 'transferID', description: 'ID UUID de la transferencia' })
  @ApiResponse({
    status: 201,
    description: 'Transferencia aprobada exitosamente.',
    type: CashTransfer,
  })
  @ApiResponse({
    status: 403,
    description:
      'El usuario no tiene rol de supervisor (admin, store_manager o MASTER) para aprobar transferencias.',
  })
  @ApiResponse({
    status: 409,
    description: 'La transferencia no está en estado PENDING.',
  })
  @CustomMessage('Transferencia de fondos aprobada exitosamente')
  approve(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('transferID', ParseUUIDPipe) transferID: string,
    @Body() dto: ApproveCashTransferDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashTransfersService.approve(
      cashRegisterID,
      sessionId,
      transferID,
      dto,
      user,
    );
  }

  @Post(':transferID/complete')
  @ApiOperation({
    summary: 'Completar una transferencia de fondos',
    description:
      'Ejecuta el traslado: genera el movimiento CASH_OUT en la sesión de origen y, si el destino es otra caja, el CASH_IN en su sesión abierta. Un supervisor puede completar directamente una transferencia PENDING (la aprobación queda registrada). Valida que el monto no supere el efectivo esperado de la caja.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiParam({ name: 'transferID', description: 'ID UUID de la transferencia' })
  @ApiResponse({
    status: 201,
    description: 'Transferencia completada exitosamente.',
    type: CashTransfer,
  })
  @ApiResponse({
    status: 400,
    description:
      'El monto supera el efectivo esperado, la caja destino no tiene sesión abierta o la sesión origen está cerrada.',
  })
  @ApiResponse({
    status: 409,
    description: 'La transferencia ya fue completada, rechazada o cancelada.',
  })
  @CustomMessage('Transferencia de fondos completada exitosamente')
  complete(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('transferID', ParseUUIDPipe) transferID: string,
    @Body() dto: CompleteCashTransferDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashTransfersService.complete(
      cashRegisterID,
      sessionId,
      transferID,
      dto,
      user,
    );
  }

  @Post(':transferID/reject')
  @ApiOperation({
    summary: 'Rechazar una transferencia de fondos',
    description:
      'Revisión de supervisor: deja la transferencia en REJECTED sin mover efectivo. Exclusivo de administradores, jefes de tienda o tokens MASTER.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiParam({ name: 'transferID', description: 'ID UUID de la transferencia' })
  @ApiResponse({
    status: 201,
    description: 'Transferencia rechazada exitosamente.',
    type: CashTransfer,
  })
  @ApiResponse({
    status: 403,
    description:
      'El usuario no tiene rol de supervisor (admin, store_manager o MASTER) para rechazar transferencias.',
  })
  @ApiResponse({
    status: 409,
    description:
      'La transferencia ya fue completada, cancelada o ya estaba rechazada.',
  })
  @CustomMessage('Transferencia de fondos rechazada exitosamente')
  reject(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('transferID', ParseUUIDPipe) transferID: string,
    @Body() dto: RejectCashTransferDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashTransfersService.reject(
      cashRegisterID,
      sessionId,
      transferID,
      dto,
      user,
    );
  }

  @Post(':transferID/cancel')
  @ApiOperation({
    summary: 'Cancelar una transferencia de fondos',
    description:
      'Descarta una transferencia PENDING o APPROVED sin mover efectivo. Puede cancelarla quien la solicitó o un supervisor.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiParam({ name: 'transferID', description: 'ID UUID de la transferencia' })
  @ApiResponse({
    status: 201,
    description: 'Transferencia cancelada exitosamente.',
    type: CashTransfer,
  })
  @CustomMessage('Transferencia de fondos cancelada exitosamente')
  cancel(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('transferID', ParseUUIDPipe) transferID: string,
    @Body() dto: CancelCashTransferDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashTransfersService.cancel(
      cashRegisterID,
      sessionId,
      transferID,
      dto,
      user,
    );
  }
}
