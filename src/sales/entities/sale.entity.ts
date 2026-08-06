import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { DteDocument } from '../../dte/entities/dte-document.entity';
import { SaleItem } from './sale-item.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

export enum SaleType {
  BOLETA = 'BOLETA',
  FACTURA = 'FACTURA',
  NOTA_VENTA = 'NOTA_VENTA',
}

export enum SaleStatus {
  EMITIDA = 'EMITIDA',
  CONVERTIDA = 'CONVERTIDA',
}

export enum SalePaymentType {
  CASH = 'Efectivo',
  DEBIT = 'Debito',
  CREDIT = 'Credito',
}

export type SaleReceiver = {
  rut?: string;
  name?: string;
  email?: string;
  address?: string;
  city?: string;
  giro?: string;
};

@Entity({ name: 'Sale' })
@Index(['tenantID', 'storeID', 'createdAt'])
@Index(['tenantID', 'status'])
@Index(['tenantID', 'saleType'])
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  saleID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({ type: 'uuid' })
  storeID!: string;

  @Column({ type: 'uuid', nullable: true })
  userID!: string | null;

  @Column({ type: 'enum', enum: SaleType })
  saleType!: SaleType;

  @Column({
    type: 'enum',
    enum: SaleStatus,
    default: SaleStatus.EMITIDA,
  })
  status!: SaleStatus;

  @Column({ type: 'enum', enum: SalePaymentType })
  paymentType!: SalePaymentType;

  @Column({ type: 'int', nullable: true })
  folio!: number | null;

  @Column({ type: 'date' })
  issueDate!: Date;

  @Column({ type: 'jsonb', nullable: true })
  receiver!: SaleReceiver | null;

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
  taxTotal!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  total!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  cogsTotal!: number;

  @Index({ unique: true })
  @Column({ type: 'uuid', nullable: true })
  dteDocumentID!: string | null;

  @OneToOne(() => DteDocument, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'dteDocumentID' })
  dteDocument!: DteDocument | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @OneToMany(() => SaleItem, (item) => item.sale, {
    cascade: true,
  })
  items!: SaleItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
