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

export enum InventoryMovementReason {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

@Entity({ name: 'InventoryMovements' })
export class InventoryMovement {
  @ApiProperty({
    description: 'ID único del movimiento',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @PrimaryGeneratedColumn('uuid')
  movementID!: string;

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
    description: 'Fecha y hora del movimiento',
  })
  @CreateDateColumn()
  createdAt!: Date;
}
