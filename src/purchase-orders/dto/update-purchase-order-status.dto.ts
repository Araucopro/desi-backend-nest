import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { PurchaseOrderStatus } from '../entities/purchase-order.entity';

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({
    enum: ['Pagado', 'Pendiente', 'Anulado'],
    description: 'Nuevo estado de la orden de compra',
  })
  @IsEnum(['Pagado', 'Pendiente', 'Anulado'])
  status!: PurchaseOrderStatus;
}
