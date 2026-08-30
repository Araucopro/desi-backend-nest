import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderCommercialStatus } from '../entities/purchase-order.entity';

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({
    enum: PurchaseOrderCommercialStatus,
    description: 'Nuevo estado comercial de la orden de compra',
  })
  @IsEnum(PurchaseOrderCommercialStatus)
  status!: PurchaseOrderCommercialStatus;
}
