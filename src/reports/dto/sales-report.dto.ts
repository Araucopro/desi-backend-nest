import { ApiProperty } from '@nestjs/swagger';

export class GroupedItemDto {
  @ApiProperty({ description: 'Clave del grupo, p.ej. tipo de pago o estado' })
  key!: string;
  @ApiProperty({ description: 'Cantidad de ventas en el grupo' })
  count!: number;
  @ApiProperty({ description: 'Total acumulado en el grupo' })
  total?: number;
}

export class PeriodSummaryItem {
  @ApiProperty({ description: 'Cantidad de ventas en el periodo' })
  count!: number;
  @ApiProperty({ description: 'Total de ventas en el periodo' })
  total!: number;
}

export class SalesReportDto {
  @ApiProperty({
    type: [GroupedItemDto],
    description: 'Agrupado por tipo de pago',
  })
  groupedByPaymentType!: GroupedItemDto[];
  @ApiProperty({ type: [GroupedItemDto], description: 'Agrupado por estado' })
  groupedByStatus!: GroupedItemDto[];
  @ApiProperty({ description: 'Resúmenes por periodos: hoy, ayer y mes' })
  periodSummary!: {
    today: PeriodSummaryItem;
    yesterday: PeriodSummaryItem;
    month: PeriodSummaryItem;
  };
  @ApiProperty({
    description: 'Listado de ventas dentro del rango (detalle)',
    type: 'array',
  })
  sales!: any[];
  @ApiProperty({ description: 'Metadatos de paginación' })
  meta!: { page: number; limit: number; total: number };
}
