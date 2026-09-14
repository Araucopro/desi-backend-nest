import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';
import { Sale } from '../../sales/entities/sale.entity';
import { CashRegisterSession } from './cash-register-session.entity';
import { PaymentMethod } from './payment-method.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

/**
 * Cobro asociado a una venta dentro de una sesión de caja.
 *
 * `sessionID` se denormaliza a propósito (Decisión 3 del plan) para responder
 * consultas analíticas de sesión sin joins profundos. Solo los pagos
 * `COMPLETED` participan del invariante `Sale.total`.
 */
@Entity({ name: 'Payment' })
@Index(['tenantID', 'paymentID'])
@Index(['tenantID', 'saleID'])
@Index(['tenantID', 'sessionID'])
@Index(['tenantID', 'paymentMethodID'])
export class Payment {
  @PrimaryGeneratedColumn('uuid', { name: 'paymentID' })
  paymentID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  saleID!: string;

  @ManyToOne(() => Sale, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'saleID' })
  sale!: Sale;

  @Column({ type: 'uuid' })
  sessionID!: string;

  @ManyToOne(() => CashRegisterSession, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sessionID' })
  session!: CashRegisterSession;

  @Column({ type: 'uuid' })
  paymentMethodID!: string;

  @ManyToOne(() => PaymentMethod, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentMethodID' })
  paymentMethod!: PaymentMethod;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount!: number;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.COMPLETED,
  })
  status!: PaymentStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  authorizationCode?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transactionID?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference?: string | null;

  @Column({ type: 'timestamp with time zone' })
  paidAt!: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
