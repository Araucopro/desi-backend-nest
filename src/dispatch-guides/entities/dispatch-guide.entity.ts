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
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';
import { DispatchGuideItem } from './dispatch-guide-item.entity';
import { DispatchGuideReference } from './dispatch-guide-reference.entity';

export enum DispatchGuideStatus {
  PENDIENTE = 'PENDIENTE',
  EMITIDA = 'EMITIDA',
  ANULADA = 'ANULADA',
}

export type DispatchGuideReceiver = {
  rut: string;
  name: string;
  address?: string;
  city?: string;
  giro?: string;
  email?: string;
};

export type DispatchGuideDestination = {
  address: string;
  city: string;
};

export type DispatchGuideTransport = {
  patente?: string;
  rutConductor?: string;
  nombreConductor?: string;
  fechaTraslado?: string;
};

@Entity({ name: 'DispatchGuide' })
@Index(['tenantID', 'storeID', 'createdAt'])
@Index(['tenantID', 'status'])
export class DispatchGuide {
  @PrimaryGeneratedColumn('uuid')
  dispatchGuideID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({ type: 'uuid' })
  storeID!: string;

  @Column({ type: 'uuid', nullable: true })
  userID!: string | null;

  @Column({
    type: 'enum',
    enum: DispatchGuideStatus,
    default: DispatchGuideStatus.PENDIENTE,
  })
  status!: DispatchGuideStatus;

  @Column({ type: 'int', nullable: true })
  folio!: number | null;

  @Index({ unique: true })
  @Column({ type: 'uuid', nullable: true })
  dteDocumentID!: string | null;

  @OneToOne(() => DteDocument, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'dteDocumentID' })
  dteDocument!: DteDocument | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'date' })
  issueDate!: Date;

  @Column({ type: 'jsonb' })
  receiver!: DispatchGuideReceiver;

  @Column({ type: 'jsonb' })
  destination!: DispatchGuideDestination;

  @Column({ type: 'jsonb', nullable: true })
  transport!: DispatchGuideTransport | null;

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

  @Column({ type: 'jsonb', nullable: true })
  payloadRaw!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  errorDetail!: string | null;

  @OneToMany(() => DispatchGuideItem, (item) => item.guide, {
    cascade: true,
  })
  items!: DispatchGuideItem[];

  @OneToMany(() => DispatchGuideReference, (reference) => reference.guide)
  references!: DispatchGuideReference[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
