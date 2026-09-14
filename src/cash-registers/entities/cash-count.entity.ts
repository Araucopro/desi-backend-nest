import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';
import { CashCountItem } from './cash-count-item.entity';
import { CashRegisterClosing } from './cash-register-closing.entity';
import { CashRegisterSession } from './cash-register-session.entity';

export enum CashCountStatus {
  /** Conteo en curso: el cajero sigue desglosando denominaciones. */
  DRAFT = 'DRAFT',
  /** Conteo sellado: su total alimenta `CashRegisterClosing.countedCashAmount`. */
  COMPLETED = 'COMPLETED',
  /** Conteo descartado antes de completarse (se rehace desde cero). */
  CANCELLED = 'CANCELLED',
}

/**
 * Arqueo físico detallado de un cierre de caja (Hito 4).
 *
 * Sustituye al monto contado "a ciegas" por el desglose auditable de billetes
 * y monedas: `totalAmount` siempre es la suma de sus `CashCountItem`. Al
 * completarse, el monto se proyecta al `CashRegisterClosing` en curso
 * (`countedCashAmount`, `cashDifference`, `actualTotalAmount`).
 *
 * Invariante: un cierre solo puede tener un conteo en curso. Se garantiza con
 * el índice único parcial `IDX_unique_draft_cash_count_per_closing`.
 */
@Entity({ name: 'CashCount' })
@Index(['tenantID', 'cashCountID'])
@Index(['tenantID', 'closingID'])
@Index(['tenantID', 'sessionID'])
export class CashCount {
  @PrimaryGeneratedColumn('uuid', { name: 'cashCountID' })
  cashCountID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  closingID!: string;

  @ManyToOne(() => CashRegisterClosing, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'closingID' })
  closing!: CashRegisterClosing;

  /** Denormalizado para consultar todos los conteos de una sesión sin joins. */
  @Column({ type: 'uuid' })
  sessionID!: string;

  @ManyToOne(() => CashRegisterSession, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sessionID' })
  session!: CashRegisterSession;

  @Column({
    type: 'enum',
    enum: CashCountStatus,
    default: CashCountStatus.DRAFT,
  })
  status!: CashCountStatus;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  totalAmount!: number;

  @Column({ type: 'integer', default: 0 })
  itemCount!: number;

  @Column({ type: 'uuid' })
  countedByUserID!: string;

  @Column({ type: 'uuid', nullable: true })
  completedByUserID?: string | null;

  @Column({ type: 'uuid', nullable: true })
  cancelledByUserID?: string | null;

  @Column({ type: 'timestamp with time zone' })
  startedAt!: Date;

  /** Momento en que el conteo físico quedó cerrado (puede ser anterior al request). */
  @Column({ type: 'timestamp with time zone', nullable: true })
  countedAt?: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @OneToMany(() => CashCountItem, (item) => item.cashCount)
  items!: CashCountItem[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
