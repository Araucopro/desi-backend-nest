import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { CustomMessage } from '../common/decorators/response-message';
import { CashReportsService } from './cash-reports.service';

@ApiTags('Cajas')
@Controller('cash-registers/:cashRegisterID/sessions')
export class CashReportsController {
  constructor(private readonly cashReportsService: CashReportsService) {}

  @Get(':sessionId/summary')
  @ApiOperation({
    summary: 'Obtener el resumen analítico de una sesión de caja',
    description:
      'Consolida en un único objeto: saldo esperado de efectivo (fondo inicial + CASH_IN − CASH_OUT de movimientos POSTED), cobros desglosados por medio de pago, totales de transferencias de fondos (enviadas y recibidas), operadores activos e históricos del turno, y el último arqueo con su conteo detallado por denominaciones. Útil como control previo al cierre de caja y como vista 360° del turno.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 200,
    description: 'Resumen analítico de la sesión obtenido exitosamente.',
    schema: {
      example: {
        session: {
          sessionID: 'b6d82b3c-7f92-4c7d-9a01-f2e3d4c5b6a7',
          cashRegisterID: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
          businessDate: '2026-09-14',
          status: 'OPEN',
          openedByUserID: '8f14e45f-ceea-467a-a1c2-3b1c1a2f9d10',
          closedByUserID: null,
          openedAt: '2026-09-14T08:30:00.000Z',
          closedAt: null,
          openingBalance: 50000,
          expectedCashBalance: null,
          countedCashBalance: null,
          cashDifference: null,
          openingNotes: 'Apertura turno mañana',
          closingNotes: null,
        },
        cashRegister: {
          cashRegisterID: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
          code: 'CAJA-01',
          name: 'Caja Principal Entrada',
          storeID: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          status: 'ACTIVE',
        },
        cashMovements: {
          cashIn: 50000,
          cashOut: 30000,
          net: 20000,
          movementCount: 4,
        },
        payments: {
          paymentCount: 12,
          totalAmount: 350000,
          cashAmount: 180000,
          nonCashAmount: 170000,
          byMethod: [
            {
              paymentMethodID: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              name: 'Efectivo',
              type: 'CASH',
              affectsCash: true,
              totalAmount: 180000,
              paymentCount: 7,
            },
            {
              paymentMethodID: 'b1ffcd00-1d1b-5fg9-cc7e-7cc0ce491b22',
              name: 'Débito',
              type: 'DEBIT_CARD',
              affectsCash: false,
              totalAmount: 170000,
              paymentCount: 5,
            },
          ],
        },
        transfers: {
          sentCount: 1,
          sentAmount: 50000,
          receivedCount: 0,
          receivedAmount: 0,
          pendingCount: 1,
          pendingAmount: 50000,
        },
        expected: {
          openingBalance: 50000,
          expectedCashAmount: 200000,
          expectedNonCashAmount: 170000,
          expectedTotalAmount: 370000,
        },
        closing: null,
        operators: [],
        cashCount: null,
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'El usuario no tiene acceso a la tienda de esta caja.',
  })
  @ApiResponse({
    status: 404,
    description: 'La caja o la sesión no existen en el tenant.',
  })
  @CustomMessage('Resumen de la sesión de caja obtenido exitosamente')
  findSessionSummary(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashReportsService.getSessionSummary(
      cashRegisterID,
      sessionId,
      user,
    );
  }
}
