import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CashMovementReasonCode,
  CashMovementType,
} from './cash-movement.entity';

/**
 * Catálogo configurable de razones de movimiento por tenant (Hito 3).
 *
 * `type` indica el sentido al que aplica la razón: `null` significa que
 * aplica a ambos sentidos (por ejemplo ajustes de caja que pueden ser
 * positivos o negativos). `requiresApproval` exige que el registro lo haga un
 * supervisor (`admin` o `store_manager`).
 */
@Entity({ name: 'CashMovementReason' })
@Index(['tenantID', 'cashMovementReasonID'])
@Index(['tenantID', 'code'], { unique: true })
export class CashMovementReason {
  @PrimaryGeneratedColumn('uuid', { name: 'cashMovementReasonID' })
  cashMovementReasonID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'enum', enum: CashMovementType, nullable: true })
  type?: CashMovementType | null;

  @Column({ type: 'boolean', default: false })
  requiresApproval!: boolean;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}

export type DefaultCashMovementReason = {
  code: string;
  name: string;
  type: CashMovementType | null;
  requiresApproval: boolean;
};

/**
 * Catálogo estándar que se crea de forma idempotente con
 * `POST /cash-movement-reasons/defaults`. `SALE` y `REFUND` quedan
 * registrados como referencia contable aunque solo los generen los módulos
 * de ventas y devoluciones.
 */
export const DEFAULT_CASH_MOVEMENT_REASONS: readonly DefaultCashMovementReason[] =
  [
    {
      code: CashMovementReasonCode.SALE,
      name: 'Venta',
      type: CashMovementType.CASH_IN,
      requiresApproval: false,
    },
    {
      code: CashMovementReasonCode.REFUND,
      name: 'Devolución',
      type: CashMovementType.CASH_OUT,
      requiresApproval: false,
    },
    {
      code: CashMovementReasonCode.OPENING_BALANCE,
      name: 'Fondo inicial',
      type: CashMovementType.CASH_IN,
      requiresApproval: false,
    },
    {
      code: CashMovementReasonCode.CASH_WITHDRAWAL,
      name: 'Retiro de efectivo',
      type: CashMovementType.CASH_OUT,
      requiresApproval: false,
    },
    {
      code: CashMovementReasonCode.PETTY_CASH,
      name: 'Caja chica',
      type: CashMovementType.CASH_OUT,
      requiresApproval: false,
    },
    {
      code: CashMovementReasonCode.SUPPLIER_PAYMENT,
      name: 'Pago a proveedor',
      type: CashMovementType.CASH_OUT,
      requiresApproval: false,
    },
    {
      code: CashMovementReasonCode.EXPENSE,
      name: 'Gasto',
      type: CashMovementType.CASH_OUT,
      requiresApproval: false,
    },
    {
      code: CashMovementReasonCode.CASH_ADJUSTMENT,
      name: 'Ajuste de caja',
      type: null,
      requiresApproval: true,
    },
    {
      code: CashMovementReasonCode.CASH_DEPOSIT,
      name: 'Depósito de efectivo',
      type: CashMovementType.CASH_IN,
      requiresApproval: false,
    },
    {
      code: CashMovementReasonCode.OTHER,
      name: 'Otro',
      type: null,
      requiresApproval: false,
    },
  ];
