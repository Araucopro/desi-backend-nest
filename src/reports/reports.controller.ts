import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { IncomeStatementQueryDto } from './dto/income-statement-query.dto';
import { IncomeStatementDto } from './dto/income-statement.dto';
import { ReportsSaleFilterDto } from './dto/report-salesFilter.dto';

@Controller('reports')
@ApiTags('Reportes')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('income-statement')
  @ApiOperation({
    summary: 'Estado de resultados mensual',
    description:
      'Devuelve la serie mensual del año consultado con ingresos por ventas y purchase orders pagadas, egresos por gastos, detalle de gastos por tipo y neto acumulado.',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Año calendario a consultar. Default: año actual.',
    example: 2026,
  })
  @ApiQuery({
    name: 'storeId',
    required: false,
    description: 'ID de la tienda para filtrar el estado de resultados.',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de resultados mensual.',
    type: IncomeStatementDto,
  })
  async incomeStatement(@Query() query: IncomeStatementQueryDto) {
    return this.reportsService.getIncomeStatement(query);
  }

  @Get('sales')
  @ApiOperation({
    summary: 'Reporte de ventas',
    description:
      'Obtiene resumen de ventas agrupadas por tipo de pago y estado, resúmenes de periodo (hoy, ayer, mes) y listado de ventas dentro del rango. Fechas en ISO 8601.',
  })
  @ApiQuery({
    name: 'storeId',
    required: true,
    description: 'ID de la tienda para filtrar',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Fecha desde (inclusive) ISO 8601',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Fecha hasta (exclusive) ISO 8601',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Página (paginación) - default 1',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Tamaño de página - default 50',
  })
  @ApiResponse({
    status: 200,
    description: 'Reporte de ventas',
    type: ReportsSaleFilterDto,
  })
  async salesReport(@Query() query: ReportsSaleFilterDto) {
    return this.reportsService.getSalesReport(query);
  }
}
