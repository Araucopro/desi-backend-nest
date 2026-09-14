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
 * Códigos de razón conocidos por el dominio. Desde el Hito 3 el catálogo
 * configurable por tenant vive en la entidad `CashMovementReason`
 * (`requiresApproval`, `active`, sentido del movimiento); este enum solo
 * nombra los códigos estándar que los módulos satélite necesitan.
 */
export enum CashMovementReasonCode {
  SALE = 'SALE',
  REFUND = 'REFUND',
  OPENING_BALANCE = 'OPENING_BALANCE',
  CASH_WITHDRAWAL = 'CASH_WITHDRAWAL',
  /** Traslado de fondos entre cajas o hacia bóveda/tesorería (Hito 5). */
  CASH_TRANSFER = 'CASH_TRANSFER',
  PETTY_CASH = 'PETTY_CASH',
  SUPPLIER_PAYMENT = 'SUPPLIER_PAYMENT',
  EXPENSE = 'EXPENSE',
  CASH_ADJUSTMENT = 'CASH_ADJUSTMENT',
  CASH_DEPOSIT = 'CASH_DEPOSIT',
  OTHER = 'OTHER',
}

/**
 * Códigos reservados a los módulos satélite (`sales`, `returns` y
 * `cash-transfers`): no pueden registrarse manualmente porque exigen informar
 * `referenceType` + `referenceID` (Regla 5 del dominio de caja).
 */
export const RESERVED_SYSTEM_CASH_MOVEMENT_REASONS: readonly string[] = [
  CashMovementReasonCode.SALE,
  CashMovementReasonCode.REFUND,
  CashMovementReasonCode.CASH_TRANSFER,
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

  /**
   * Código de la razón según el catálogo del tenant (`CashMovementReason.code`).
   * Se persiste como `varchar` para poder configurar razones nuevas sin
   * migraciones de base de datos.
   */
  @Column({ type: 'varchar', length: 50 })
  reason!: string;

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
