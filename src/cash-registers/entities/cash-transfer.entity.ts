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
import { Store } from '../../stores/entities/store.entity';
import { CashMovement } from './cash-movement.entity';
import { CashRegister } from './cash-register.entity';
import { CashRegisterSession } from './cash-register-session.entity';

export enum CashTransferStatus {
  /** Solicitada por un operador: espera aprobación de un supervisor. */
  PENDING = 'PENDING',
  /** Aprobada por supervisor: lista para ejecutar el movimiento de efectivo. */
  APPROVED = 'APPROVED',
  /** Ejecutada: generó los movimientos de efectivo de origen y destino. */
  COMPLETED = 'COMPLETED',
  /** Rechazada por supervisor sin mover efectivo. */
  REJECTED = 'REJECTED',
  /** Descartada por quien la solicitó sin mover efectivo. */
  CANCELLED = 'CANCELLED',
}

export enum CashTransferDestinationType {
  /** Otra caja del tenant: el efectivo entra a su sesión abierta. */
  CASH_REGISTER = 'CASH_REGISTER',
  /** Bóveda o tesorería: el efectivo sale del circuito de cajas. */
  VAULT = 'VAULT',
}

/** Estados que todavía pueden ejecutarse o resolverse sobre la sesión origen. */
export const CASH_TRANSFER_OPEN_STATUSES: readonly CashTransferStatus[] = [
  CashTransferStatus.PENDING,
  CashTransferStatus.APPROVED,
];

/** Etiqueta por defecto cuando el destino es bóveda/tesorería sin nombre propio. */
export const DEFAULT_CASH_TRANSFER_VAULT_LABEL = 'Bóveda / Tesorería';

/**
 * Traslado de efectivo entre cajas o desde una caja hacia bóveda/tesorería
 * (Hito 5).
 *
 * El dinero cambia de ubicación, no sale del circuito de efectivo, por lo que
 * la transferencia no es un gasto: al completarse genera un `CashMovement`
 * `CASH_OUT` en la sesión de origen y, cuando el destino es otra caja, un
 * `CASH_IN` en la sesión abierta de la caja destino. Ambos movimientos
 * comparten `referenceID = cashTransferID` para mantener la trazabilidad.
 *
 * Aprobación: la transferencia nace `PENDING` y solo llega a `COMPLETED`
 * cuando un supervisor la aprueba (explícitamente o al completarla él mismo).
 * Los estados terminales `COMPLETED`, `REJECTED` y `CANCELLED` no vuelven
 * atrás: un error se corrige con una transferencia inversa.
 */
@Entity({ name: 'CashTransfer' })
@Index(['tenantID', 'cashTransferID'])
@Index(['tenantID', 'storeID'])
@Index(['tenantID', 'status'])
@Index(['tenantID', 'sourceSessionID'])
@Index(['tenantID', 'destinationSessionID'])
@Index(['tenantID', 'requestedAt'])
export class CashTransfer {
  @PrimaryGeneratedColumn('uuid', { name: 'cashTransferID' })
  cashTransferID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  /** Tienda de la caja de origen (denormalizada para reportes por tienda). */
  @Column({ type: 'uuid' })
  storeID!: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({ type: 'uuid' })
  sourceCashRegisterID!: string;

  @ManyToOne(() => CashRegister, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sourceCashRegisterID' })
  sourceCashRegister!: CashRegister;

  @Column({ type: 'uuid' })
  sourceSessionID!: string;

  @ManyToOne(() => CashRegisterSession, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sourceSessionID' })
  sourceSession!: CashRegisterSession;

  @Column({ type: 'enum', enum: CashTransferDestinationType })
  destinationType!: CashTransferDestinationType;

  /** Obligatoria cuando `destinationType = CASH_REGISTER`. */
  @Column({ type: 'uuid', nullable: true })
  destinationCashRegisterID?: string | null;

  @ManyToOne(() => CashRegister, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'destinationCashRegisterID' })
  destinationCashRegister?: CashRegister | null;

  /**
   * Sesión destino resuelta al completar: se exige que exista una sesión
   * `OPEN` en la caja destino en ese momento, de modo que el efectivo nunca
   * entra a una caja cerrada.
   */
  @Column({ type: 'uuid', nullable: true })
  destinationSessionID?: string | null;

  @ManyToOne(() => CashRegisterSession, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'destinationSessionID' })
  destinationSession?: CashRegisterSession | null;

  /** Nombre del destino externo (bóveda, tesorería, remesa a banco). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  destinationLabel?: string | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount!: number;

  @Column({
    type: 'enum',
    enum: CashTransferStatus,
    default: CashTransferStatus.PENDING,
  })
  status!: CashTransferStatus;

  @Column({ type: 'uuid' })
  requestedByUserID!: string;

  @Column({ type: 'uuid', nullable: true })
  approvedByUserID?: string | null;

  @Column({ type: 'uuid', nullable: true })
  rejectedByUserID?: string | null;

  @Column({ type: 'uuid', nullable: true })
  cancelledByUserID?: string | null;

  @Column({ type: 'uuid', nullable: true })
  completedByUserID?: string | null;

  @Column({ type: 'timestamp with time zone' })
  requestedAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  approvedAt?: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  rejectedAt?: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt?: Date | null;

  /** Momento en que el efectivo salió físicamente de la caja de origen. */
  @Column({ type: 'timestamp with time zone', nullable: true })
  occurredAt?: Date | null;

  /** Movimiento `CASH_OUT` generado en la sesión de origen al completar. */
  @Column({ type: 'uuid', nullable: true })
  sourceMovementID?: string | null;

  @ManyToOne(() => CashMovement, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'sourceMovementID' })
  sourceMovement?: CashMovement | null;

  /** Movimiento `CASH_IN` generado en la sesión destino (solo caja a caja). */
  @Column({ type: 'uuid', nullable: true })
  destinationMovementID?: string | null;

  @ManyToOne(() => CashMovement, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'destinationMovementID' })
  destinationMovement?: CashMovement | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'text', nullable: true })
  approvalNotes?: string | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason?: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
