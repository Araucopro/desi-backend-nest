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

export enum CashMovementType {
  CASH_IN = 'CASH_IN',
  CASH_OUT = 'CASH_OUT',
}

export enum CashMovementStatus {
  POSTED = 'POSTED',
  VOIDED = 'VOIDED',
}

/**
 * Razones de movimiento. En el Hito 3 pasarán a ser un catálogo configurable
 * (`CashMovementReason`) con flag `requiresApproval`; por ahora se validan
 * contra este enum y se persisten como `varchar` para facilitar esa migración.
 */
export enum CashMovementReason {
  SALE = 'SALE',
  REFUND = 'REFUND',
  OPENING_BALANCE = 'OPENING_BALANCE',
  CASH_WITHDRAWAL = 'CASH_WITHDRAWAL',
  PETTY_CASH = 'PETTY_CASH',
  SUPPLIER_PAYMENT = 'SUPPLIER_PAYMENT',
  EXPENSE = 'EXPENSE',
  CASH_ADJUSTMENT = 'CASH_ADJUSTMENT',
  CASH_DEPOSIT = 'CASH_DEPOSIT',
  OTHER = 'OTHER',
}

/**
 * Razones que un operador puede registrar manualmente. `SALE` y `REFUND`
 * quedan reservadas a los módulos satélite (`sales`, `returns`), que deben
 * informar `referenceType` + `referenceID` (Regla 5 del dominio de caja).
 */
export const MANUAL_CASH_MOVEMENT_REASONS: readonly CashMovementReason[] = [
  CashMovementReason.CASH_WITHDRAWAL,
  CashMovementReason.PETTY_CASH,
  CashMovementReason.SUPPLIER_PAYMENT,
  CashMovementReason.EXPENSE,
  CashMovementReason.CASH_ADJUSTMENT,
  CashMovementReason.CASH_DEPOSIT,
  CashMovementReason.OTHER,
];

export enum CashMovementReferenceType {
  SALE = 'SALE',
  RETURN = 'RETURN',
  EXPENSE = 'EXPENSE',
  CASH_TRANSFER = 'CASH_TRANSFER',
  CASH_MOVEMENT = 'CASH_MOVEMENT',
  MANUAL = 'MANUAL',
}

/**
 * Bitácora financiera de efectivo de una sesión de caja.
 *
 * Los movimientos no se eliminan: un error se corrige con `VOIDED` más el
 * contra-movimiento de compensación generado por el servicio.
 */
@Entity({ name: 'CashMovement' })
@Index(['tenantID', 'cashMovementID'])
@Index(['tenantID', 'sessionID'])
@Index(['tenantID', 'referenceType', 'referenceID'])
export class CashMovement {
  @PrimaryGeneratedColumn('uuid', { name: 'cashMovementID' })
  cashMovementID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  sessionID!: string;

  @ManyToOne(() => CashRegisterSession, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sessionID' })
  session!: CashRegisterSession;

  @Column({ type: 'enum', enum: CashMovementType })
  type!: CashMovementType;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount!: number;

  @Column({
    type: 'enum',
    enum: CashMovementStatus,
    default: CashMovementStatus.POSTED,
  })
  status!: CashMovementStatus;

  @Column({ type: 'varchar', length: 50 })
  reason!: CashMovementReason;

  @Column({ type: 'varchar', length: 50, nullable: true })
  referenceType?: CashMovementReferenceType | null;

  @Column({ type: 'uuid', nullable: true })
  referenceID?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'uuid' })
  createdByUserID!: string;

  @Column({ type: 'timestamp with time zone' })
  occurredAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  voidedAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  voidedByUserID?: string | null;

  @Column({ type: 'text', nullable: true })
  voidReason?: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
