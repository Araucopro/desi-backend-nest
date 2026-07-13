import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { StoreTransfer } from './store-transfer.entity';
import { ProductVariation } from '../../products/entities/product-variation.entity';

@Entity({ name: 'StoreTransferItems' })
@Check(`"quantity" > 0`)
@Index(['transfer', 'variation'], { unique: true })
export class StoreTransferItem {
  @ApiProperty({
    description: 'ID del item en la transferencia',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @PrimaryGeneratedColumn('uuid')
  transferItemID!: string;

  @ManyToOne(() => StoreTransfer, (transfer) => transfer.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transferID' })
  transfer!: StoreTransfer;

  @ManyToOne(() => ProductVariation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variationID' })
  variation!: ProductVariation;

  @ApiProperty({
    description: 'Cantidad de unidades transferidas',
    example: 10,
    minimum: 1,
  })
  @Column('int')
  quantity!: number;
}
