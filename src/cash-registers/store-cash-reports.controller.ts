import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { CustomMessage } from '../common/decorators/response-message';
import { CashReportsService } from './cash-reports.service';
import { QueryStoreCashSummaryDto } from './dto/query-store-cash-summary.dto';

@ApiTags('Cajas')
@Controller('stores')
export class StoreCashReportsController {
  constructor(private readonly cashReportsService: CashReportsService) {}

  @Get(':storeId/cash-summary')
  @ApiOperation({
    summary: 'Obtener el resumen consolidado de cajas de una tienda',
    description:
      'Consolida las sesiones de caja de la tienda por rango de fechas contables (`businessDate`): totales globales de efectivo y cobros, series diarias y por caja (para gráficos de tendencia), actividad por operador y transferencias de fondos con estado PENDING o APPROVED. El rango máximo es de 90 días; si se omiten las fechas, por defecto cubre los últimos 30 días.',
  })
  @ApiParam({ name: 'storeId', description: 'ID UUID de la tienda' })
  @ApiQuery({
    name: 'from',
    required: false,
    description:
      'Fecha contable inicial inclusive (YYYY-MM-DD). Por defecto 29 días antes de `to`.',
    example: '2026-09-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description:
      'Fecha contable final inclusive (YYYY-MM-DD). Por defecto hoy en la zona horaria del tenant.',
    example: '2026-09-30',
  })
  @ApiResponse({
    status: 200,
    description:
      'Resumen consolidado de cajas de la tienda obtenido exitosamente.',
    schema: {
      example: {
        storeID: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        from: '2026-09-01',
        to: '2026-09-30',
        sessionCount: 60,
        openSessionCount: 2,
        closedSessionCount: 58,
        openingBalanceTotal: 3000000,
        expectedCashTotal: 18500000,
        countedCashTotal: 18490000,
        cashDifferenceTotal: -10000,
        cashMovements: {
          cashIn: 3000000,
          cashOut: 1200000,
          net: 1800000,
          movementCount: 240,
        },
        payments: {
          paymentCount: 720,
          totalAmount: 21000000,
          cashAmount: 12000000,
          nonCashAmount: 9000000,
          byMethod: [
            {
              name: 'Efectivo',
              type: 'CASH',
              totalAmount: 12000000,
              paymentCount: 400,
            },
            {
              name: 'Débito',
              type: 'DEBIT_CARD',
              totalAmount: 9000000,
              paymentCount: 320,
            },
          ],
        },
        byDate: [
          {
            businessDate: '2026-09-14',
            sessionCount: 2,
            openSessionCount: 2,
            closedSessionCount: 0,
            openingBalance: 100000,
            cashIn: 100000,
            cashOut: 50000,
            netCash: 50000,
            paymentTotal: 700000,
            transfersOutAmount: 50000,
            transfersInAmount: 0,
            expectedCash: 650000,
            countedCash: 0,
            cashDifference: 0,
          },
        ],
        byRegister: [
          {
            cashRegisterID: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
            code: 'CAJA-01',
            name: 'Caja Principal Entrada',
            sessionCount: 30,
            openSessionCount: 1,
            closedSessionCount: 29,
            cashIn: 1500000,
            cashOut: 600000,
            netCash: 900000,
            paymentTotal: 10500000,
            transfersOutAmount: 500000,
            transfersInAmount: 0,
            expectedCash: 9200000,
            countedCash: 9195000,
            cashDifference: -5000,
          },
        ],
        byOperator: [
          {
            userID: '8f14e45f-ceea-467a-a1c2-3b1c1a2f9d10',
            sessionsAttended: 15,
            movementsRegistered: 60,
            cashIn: 750000,
            cashOut: 300000,
            netCash: 450000,
            countsPerformed: 14,
          },
        ],
        pendingTransfers: [
          {
            cashTransferID: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            status: 'PENDING',
            amount: 250000,
            destinationType: 'VAULT',
            sourceCashRegisterID: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
            sourceSessionID: 'b6d82b3c-7f92-4c7d-9a01-f2e3d4c5b6a7',
            destinationCashRegisterID: null,
            destinationLabel: 'Bóveda central',
            businessDate: '2026-09-14',
            requestedAt: '2026-09-14T18:00:00.000Z',
            requestedByUserID: '8f14e45f-ceea-467a-a1c2-3b1c1a2f9d10',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'El usuario no tiene acceso a la tienda solicitada.',
  })
  @ApiResponse({
    status: 404,
    description: 'La tienda no existe en el tenant.',
  })
  @CustomMessage('Resumen de cajas de la tienda obtenido exitosamente')
  findStoreSummary(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Query() query: QueryStoreCashSummaryDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashReportsService.getStoreSummary(storeId, query, user);
  }
}
