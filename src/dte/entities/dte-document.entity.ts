import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';

export enum DteDocumentStatus {
  EMITIDO = 'EMITIDO',
  PENDIENTE = 'PENDIENTE',
  ERROR = 'ERROR',
}

export enum DteDocumentPaymentType {
  CASH = 'Efectivo',
  DEBIT = 'Debito',
  CREDIT = 'Credito',
}

@Entity({ name: 'DteDocument' })
@Index(['storeID', 'createdAt'])
export class DteDocument {
  @PrimaryGeneratedColumn('uuid')
  dteDocumentID!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'varchar', length: 255 })
  apikey!: string;

  @Column({ type: 'varchar', length: 64 })
  token!: string;

  @Column({ type: 'int' })
  folio!: number;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({ type: 'uuid' })
  storeID!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid', nullable: true })
  purchaseOrderID!: string | null;

  @OneToOne(() => PurchaseOrder, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'purchaseOrderID' })
  purchaseOrder!: PurchaseOrder | null;

  @Column({
    type: 'enum',
    enum: DteDocumentStatus,
    default: DteDocumentStatus.PENDIENTE,
  })
  status!: DteDocumentStatus;

  @Column({ type: 'int', nullable: true })
  documentType!: number | null;

  @Column({
    type: 'enum',
    enum: DteDocumentPaymentType,
    default: DteDocumentPaymentType.CASH,
  })
  paymentType!: DteDocumentPaymentType;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  total!: number;

  @Column({ type: 'jsonb' })
  payloadRaw!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  payloadNormalized!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
