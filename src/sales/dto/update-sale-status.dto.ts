import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSaleStatusDto {
  @ApiProperty({
    enum: ['Pagado', 'Pendiente', 'Anulado'],
    description:
      'Nuevo estado de la venta. Pagado: transacción completada, Pendiente: esperando pago, Anulado: venta cancelada',
    example: 'Pagado',
  })
  @IsEnum(['Pagado', 'Pendiente', 'Anulado'])
  status!: 'Pagado' | 'Pendiente' | 'Anulado';
}
