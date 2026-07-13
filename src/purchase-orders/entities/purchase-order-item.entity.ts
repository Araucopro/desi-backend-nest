import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';
import { ProductVariation } from '../../products/entities/product-variation.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

@Entity({ name: 'PurchaseOrderItem' })
export class PurchaseOrderItem {
  @PrimaryGeneratedColumn('uuid')
  purchaseOrderItemID!: string;

  @ManyToOne(() => PurchaseOrder, (order) => order.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchaseOrderID' })
  purchaseOrder!: PurchaseOrder;

  @ManyToOne(() => ProductVariation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variationID' })
  variation!: ProductVariation;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  unitPrice!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  subtotal!: number;

  @Column('int')
  quantityRequested!: number;

  @Column('int', { default: 0 })
  quantityReceived!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
