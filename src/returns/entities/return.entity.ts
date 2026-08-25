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
import { Sale } from '../../sales/entities/sale.entity';
import { DteDocument } from '../../dte/entities/dte-document.entity';
import { ReturnItem } from './return-item.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

export enum ReturnType {
  TOTAL = 'TOTAL',
  PARCIAL = 'PARCIAL',
  DESCUENTO = 'DESCUENTO',
}

export enum ReturnStatus {
  PENDIENTE = 'PENDIENTE',
  APROBADA = 'APROBADA',
  COMPLETADA = 'COMPLETADA',
  RECHAZADA = 'RECHAZADA',
  CANCELADA = 'CANCELADA',
}

@Entity({ name: 'Return' })
@Index(['tenantID', 'storeID', 'createdAt'])
@Index(['tenantID', 'saleID'])
@Index(['tenantID', 'status'])
export class Return {
  @PrimaryGeneratedColumn('uuid')
  returnID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({ type: 'uuid' })
  storeID!: string;

  @ManyToOne(() => Sale, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'saleID' })
  sale!: Sale;

  @Column({ type: 'uuid' })
  saleID!: string;

  @Column({ type: 'enum', enum: ReturnType })
  returnType!: ReturnType;

  @Column({
    type: 'enum',
    enum: ReturnStatus,
    default: ReturnStatus.PENDIENTE,
  })
  status!: ReturnStatus;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  discountAmount!: number;

  @Column({ type: 'int', nullable: true })
  folio!: number | null;

  @Index({ unique: true })
  @Column({ type: 'uuid', nullable: true })
  dteDocumentID!: string | null;

  @OneToOne(() => DteDocument, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'dteDocumentID' })
  dteDocument!: DteDocument | null;

  @Column({ type: 'date' })
  issueDate!: Date;

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

  @Column({ type: 'uuid', nullable: true })
  userID!: string | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @OneToMany(() => ReturnItem, (item) => item.ret, {
    cascade: true,
  })
  items!: ReturnItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
