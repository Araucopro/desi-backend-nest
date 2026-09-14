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
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';
import { CashRegisterSession } from './cash-register-session.entity';

export enum CashRegisterClosingStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

/**
 * Fotografía de un medio de pago dentro del arqueo: los cobros con tarjeta o
 * transferencia no mueven el efectivo físico, pero deben conciliarse contra el
 * total vendido de la sesión.
 */
export type CashPaymentMethodTotal = {
  paymentMethodID: string;
  code: string;
  name: string;
  affectsCash: boolean;
  paymentCount: number;
  amount: number;
};

/**
 * Proceso formal de arqueo y conciliación de una sesión de caja (Hito 3).
 *
 * Se separa de `CashRegisterSession`: la sesión es el período operativo y el
 * cierre es el proceso de conteo. La sesión solo pasa a `CLOSED` cuando un
 * cierre llega a `COMPLETED` (Regla 2: hermetismo post-cierre).
 */
@Entity({ name: 'CashRegisterClosing' })
@Index(['tenantID', 'closingID'])
@Index(['tenantID', 'sessionID'])
@Index(['tenantID', 'status'])
export class CashRegisterClosing {
  @PrimaryGeneratedColumn('uuid', { name: 'closingID' })
  closingID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  sessionID!: string;

  @ManyToOne(() => CashRegisterSession, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sessionID' })
  session!: CashRegisterSession;

  @Column({
    type: 'enum',
    enum: CashRegisterClosingStatus,
    default: CashRegisterClosingStatus.PENDING,
  })
  status!: CashRegisterClosingStatus;

  /** Fondo inicial + movimientos de efectivo `POSTED` de la sesión. */
  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  expectedCashAmount!: number;

  /** Cobros `COMPLETED` con medios que no afectan efectivo (tarjetas, etc.). */
  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  expectedNonCashAmount!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  expectedTotalAmount!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  countedCashAmount?: number | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  actualTotalAmount?: number | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  cashDifference?: number | null;

  @Column({ type: 'integer', default: 0 })
  cashMovementCount!: number;

  @Column({ type: 'integer', default: 0 })
  paymentCount!: number;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  paymentMethodTotals!: CashPaymentMethodTotal[];

  @Column({ type: 'uuid' })
  performedByUserID!: string;

  @Column({ type: 'uuid', nullable: true })
  completedByUserID?: string | null;

  @Column({ type: 'uuid', nullable: true })
  rejectedByUserID?: string | null;

  @Column({ type: 'timestamp with time zone' })
  startedAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  rejectedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
