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
import { CashMovementsService } from './cash-movements.service';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { QueryCashMovementsDto } from './dto/query-cash-movements.dto';
import { QuerySessionPaymentsDto } from './dto/query-session-payments.dto';
import { VoidCashMovementDto } from './dto/void-cash-movement.dto';
import { CashMovement } from './entities/cash-movement.entity';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';

@ApiTags('Cajas')
@Controller('cash-registers/:cashRegisterID/sessions')
export class CashSessionsController {
  constructor(
    private readonly cashMovementsService: CashMovementsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post(':sessionId/movements')
  @ApiOperation({
    summary: 'Registrar un movimiento manual de efectivo',
    description:
      'Registra un aporte (CASH_IN) o retiro (CASH_OUT) de efectivo sobre la sesión abierta. SALE y REFUND se generan desde sus módulos de origen, no manualmente.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 201,
    description: 'Movimiento de caja registrado exitosamente.',
    type: CashMovement,
  })
  @ApiResponse({
    status: 400,
    description:
      'La sesión no está abierta o la razón no admite registro manual.',
  })
  @CustomMessage('Movimiento de caja registrado exitosamente')
  createMovement(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CreateCashMovementDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashMovementsService.createManualMovement(
      cashRegisterID,
      sessionId,
      dto,
      user,
    );
  }

  @Get(':sessionId/movements')
  @ApiOperation({
    summary: 'Listar los movimientos de efectivo de una sesión',
    description:
      'Devuelve la bitácora financiera de la sesión con filtros por tipo, estado, origen y rango de ocurrencia.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 200,
    description: 'Movimientos obtenidos exitosamente.',
    type: [CashMovement],
  })
  @CustomMessage('Movimientos de caja obtenidos exitosamente')
  findMovements(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: QueryCashMovementsDto,
  ) {
    return this.cashMovementsService.listSessionMovements(
      cashRegisterID,
      sessionId,
      query,
    );
  }

  @Post(':sessionId/movements/:movementId/void')
  @ApiOperation({
    summary: 'Anular un movimiento de efectivo',
    description:
      'Marca el movimiento como VOIDED y genera el contra-movimiento de compensación. Los movimientos financieros no se eliminan físicamente.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiParam({ name: 'movementId', description: 'ID UUID del movimiento' })
  @ApiResponse({
    status: 201,
    description:
      'Movimiento anulado exitosamente con su contra-movimiento de compensación.',
  })
  @ApiResponse({
    status: 409,
    description: 'El movimiento ya estaba anulado.',
  })
  @CustomMessage('Movimiento de caja anulado exitosamente')
  voidMovement(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('movementId', ParseUUIDPipe) movementId: string,
    @Body() dto: VoidCashMovementDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashMovementsService.voidMovement(
      cashRegisterID,
      sessionId,
      movementId,
      dto,
      user,
    );
  }

  @Get(':sessionId/payments')
  @ApiOperation({
    summary: 'Listar los cobros de una sesión de caja',
    description:
      'Devuelve los pagos registrados en la sesión con su medio de pago, permitiendo saber cuánto se cobró en efectivo, tarjetas o transferencias.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 200,
    description: 'Cobros obtenidos exitosamente.',
    type: [Payment],
  })
  @CustomMessage('Cobros de la sesión obtenidos exitosamente')
  findPayments(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: QuerySessionPaymentsDto,
  ) {
    return this.paymentsService.listSessionPayments(
      cashRegisterID,
      sessionId,
      query,
    );
  }
}
