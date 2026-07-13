import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

export type PurchaseOrderStatus = 'Pagado' | 'Pendiente' | 'Anulado';

@Entity({ name: 'PurchaseOrder' })
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  purchaseOrderID!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  folio!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({
    type: 'enum',
    enum: ['Pagado', 'Pendiente', 'Anulado'],
    default: 'Pendiente',
  })
  paymentStatus!: PurchaseOrderStatus;

  @Column({ type: 'boolean', default: false })
  isThirdParty!: boolean;

  @Column({ type: 'date' })
  issueDate!: Date;

  @Column({ type: 'date', nullable: true })
  dueDate!: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  dteNumber!: string | null;

  @Column('int', { default: 0 })
  totalProducts!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  subtotal!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  discount!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  netTotal!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  tax!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  total!: number;

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder, {
    cascade: true,
  })
  items!: PurchaseOrderItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
