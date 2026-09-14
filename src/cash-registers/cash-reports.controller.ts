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
      'Consolida saldo esperado (fondo inicial + movimientos POSTED), cobros por medio de pago, transferencias de fondos, operadores del turno y el último arqueo con su conteo por denominaciones. Sirve de control previo al cierre de caja.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 200,
    description: 'Resumen de la sesión obtenido exitosamente.',
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
