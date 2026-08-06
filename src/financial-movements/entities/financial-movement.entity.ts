import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

export enum FinancialMovementDirection {
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
}

export enum FinancialMovementCategory {
  VENTA = 'VENTA',
  COSTO_VENTA = 'COSTO_VENTA',
  COMPRA = 'COMPRA',
  GASTO_OPERACIONAL = 'GASTO_OPERACIONAL',
  GASTO_ADMINISTRATIVO = 'GASTO_ADMINISTRATIVO',
  GASTO_FINANCIERO = 'GASTO_FINANCIERO',
}

export enum FinancialMovementSourceType {
  DTE_DOCUMENT = 'DTE_DOCUMENT',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  EXPENSE = 'EXPENSE',
  SALE_NOTE = 'SALE_NOTE',
}

@Entity({ name: 'FinancialMovement' })
@Index(['tenantID', 'date'])
@Index(['tenantID', 'storeID', 'date'])
@Index(['tenantID', 'sourceType', 'sourceID', 'category'], { unique: true })
export class FinancialMovement {
  @PrimaryGeneratedColumn('uuid')
  financialMovementID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({ type: 'uuid' })
  storeID!: string;

  @Column({ type: 'date' })
  date!: Date;

  @Column({
    type: 'enum',
    enum: FinancialMovementDirection,
  })
  direction!: FinancialMovementDirection;

  @Column({
    type: 'enum',
    enum: FinancialMovementCategory,
  })
  category!: FinancialMovementCategory;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  taxAmount!: number;

  @Column({ type: 'boolean', default: false })
  taxCredit!: boolean;

  @Column({ type: 'boolean', default: true })
  acceptedForTax!: boolean;

  @Column({
    type: 'enum',
    enum: FinancialMovementSourceType,
  })
  sourceType!: FinancialMovementSourceType;

  @Column({ type: 'uuid' })
  sourceID!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
