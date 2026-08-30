import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Store } from '../../stores/entities/store.entity';
import { ProductVariation } from '../../products/entities/product-variation.entity';
import { ReturnItemCondition } from '../../returns/entities/return-item.entity';

export enum InventoryMovementReason {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  RETURN = 'RETURN',
  DISPATCH_GUIDE = 'DISPATCH_GUIDE',
}

@Entity({ name: 'InventoryMovements' })
export class InventoryMovement {
  @ApiProperty({
    description: 'ID único del movimiento',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @PrimaryGeneratedColumn('uuid')
  movementID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @ManyToOne(() => ProductVariation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variationID' })
  variation!: ProductVariation;

  @ApiProperty({
    description:
      'Cambio neto en el stock (positivo para entradas, negativo para salidas)',
    example: -5,
  })
  @Column('int')
  delta!: number;

  @ApiProperty({
    description: 'Motivo del movimiento de inventario',
    enum: InventoryMovementReason,
    example: InventoryMovementReason.SALE,
  })
  @Column({
    type: 'enum',
    enum: InventoryMovementReason,
  })
  reason!: InventoryMovementReason;

  @ApiProperty({
    description:
      'ID de referencia externa (ID de venta, ID de transferencia, etc.)',
    example: 'SALE-99123',
    required: false,
  })
  @Column({ type: 'varchar', nullable: true })
  referenceID?: string;

  @ApiProperty({
    description:
      'Condición del stock afectado: SELLABLE o DEFECTIVE. Null en movimientos que no distinguen condición',
    enum: ReturnItemCondition,
    example: ReturnItemCondition.SELLABLE,
    required: false,
    nullable: true,
  })
  @Column({
    type: 'enum',
    enum: ReturnItemCondition,
    nullable: true,
  })
  condition!: ReturnItemCondition | null;

  @ApiProperty({
    description: 'Fecha y hora del movimiento',
  })
  @CreateDateColumn()
  createdAt!: Date;
}
