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
      'Consolida las sesiones de caja de la tienda por rango de fechas contables (businessDate): totales de efectivo y cobros, series por día y por caja, actividad por operador y transferencias de fondos en curso.',
  })
  @ApiParam({ name: 'storeId', description: 'ID UUID de la tienda' })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Fecha contable inicial (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Fecha contable final (YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen consolidado de cajas obtenido exitosamente.',
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
