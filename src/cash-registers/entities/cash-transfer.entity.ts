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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'ID único de la transferencia de fondos',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid', { name: 'cashTransferID' })
  cashTransferID!: string;

  @ApiProperty({
    description: 'ID del tenant al que pertenece la transferencia',
    example: 'a1b2c3d4-0000-0000-0000-111122223333',
  })
  @Column({ type: 'uuid' })
  tenantID!: string;

  /** Tienda de la caja de origen (denormalizada para reportes por tienda). */
  @ApiProperty({
    description:
      'ID de la tienda de origen (denormalizado para reportes por tienda)',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @Column({ type: 'uuid' })
  storeID!: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @ApiProperty({
    description: 'ID de la caja de origen',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  @Column({ type: 'uuid' })
  sourceCashRegisterID!: string;

  @ManyToOne(() => CashRegister, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sourceCashRegisterID' })
  sourceCashRegister!: CashRegister;

  @ApiProperty({
    description: 'ID de la sesión de origen',
    example: 'b6d82b3c-7f92-4c7d-9a01-f2e3d4c5b6a7',
  })
  @Column({ type: 'uuid' })
  sourceSessionID!: string;

  @ManyToOne(() => CashRegisterSession, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sourceSessionID' })
  sourceSession!: CashRegisterSession;

  @ApiProperty({
    description: 'Tipo de destino del efectivo',
    enum: CashTransferDestinationType,
    example: CashTransferDestinationType.VAULT,
  })
  @Column({ type: 'enum', enum: CashTransferDestinationType })
  destinationType!: CashTransferDestinationType;

  /** Obligatoria cuando `destinationType = CASH_REGISTER`. */
  @ApiPropertyOptional({
    description:
      'ID de la caja destino. Obligatorio cuando destinationType = CASH_REGISTER; la sesión destino se resuelve al completar.',
    example: '7c1d6a4e-3f6f-4a2f-9c9e-0c2c1f6a1b21',
    nullable: true,
  })
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
  @ApiPropertyOptional({
    description:
      'ID de la sesión destino (se resuelve en el momento de completar la transferencia; null hasta ese instante)',
    example: 'c9e1f2a3-4b5c-6d7e-8f9a-0b1c2d3e4f5a',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  destinationSessionID?: string | null;

  @ManyToOne(() => CashRegisterSession, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'destinationSessionID' })
  destinationSession?: CashRegisterSession | null;

  /** Nombre del destino externo (bóveda, tesorería, remesa a banco). */
  @ApiPropertyOptional({
    description:
      'Nombre del destino externo. Solo cuando destinationType = VAULT. Por defecto "Bóveda / Tesorería".',
    example: 'Bóveda central',
    nullable: true,
  })
  @Column({ type: 'varchar', length: 100, nullable: true })
  destinationLabel?: string | null;

  @ApiProperty({
    description:
      'Monto de efectivo a trasladar (siempre > 0, hasta 2 decimales)',
    example: 250000,
    minimum: 0.01,
  })
  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount!: number;

  @ApiProperty({
    description: 'Estado actual de la transferencia',
    enum: CashTransferStatus,
    example: CashTransferStatus.PENDING,
  })
  @Column({
    type: 'enum',
    enum: CashTransferStatus,
    default: CashTransferStatus.PENDING,
  })
  status!: CashTransferStatus;

  @ApiProperty({
    description: 'ID del usuario que solicitó la transferencia',
    example: '8f14e45f-ceea-467a-a1c2-3b1c1a2f9d10',
  })
  @Column({ type: 'uuid' })
  requestedByUserID!: string;

  @ApiPropertyOptional({
    description: 'ID del supervisor que aprobó la transferencia',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  approvedByUserID?: string | null;

  @ApiPropertyOptional({
    description: 'ID del supervisor que rechazó la transferencia',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  rejectedByUserID?: string | null;

  @ApiPropertyOptional({
    description: 'ID del usuario que canceló la transferencia',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  cancelledByUserID?: string | null;

  @ApiPropertyOptional({
    description: 'ID del supervisor que completó la transferencia',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  completedByUserID?: string | null;

  @ApiProperty({
    description: 'Fecha y hora en que se solicitó la transferencia (UTC)',
    example: '2026-09-14T15:00:00.000Z',
  })
  @Column({ type: 'timestamp with time zone' })
  requestedAt!: Date;

  @ApiPropertyOptional({
    description: 'Fecha y hora de aprobación del supervisor (UTC)',
    nullable: true,
  })
  @Column({ type: 'timestamp with time zone', nullable: true })
  approvedAt?: Date | null;

  @ApiPropertyOptional({
    description:
      'Fecha y hora en que el supervisor rechazó la transferencia (UTC)',
    nullable: true,
  })
  @Column({ type: 'timestamp with time zone', nullable: true })
  rejectedAt?: Date | null;

  @ApiPropertyOptional({
    description: 'Fecha y hora en que se canceló la transferencia (UTC)',
    nullable: true,
  })
  @Column({ type: 'timestamp with time zone', nullable: true })
  cancelledAt?: Date | null;

  @ApiPropertyOptional({
    description:
      'Fecha y hora en que se completó (ejecutó) la transferencia (UTC)',
    nullable: true,
  })
  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt?: Date | null;

  /** Momento en que el efectivo salió físicamente de la caja de origen. */
  @ApiPropertyOptional({
    description:
      'Momento en que el efectivo salió físicamente de la caja de origen (UTC). Por defecto igual a completedAt.',
    nullable: true,
  })
  @Column({ type: 'timestamp with time zone', nullable: true })
  occurredAt?: Date | null;

  /** Movimiento `CASH_OUT` generado en la sesión de origen al completar. */
  @ApiPropertyOptional({
    description:
      'ID del movimiento CASH_OUT generado en la sesión de origen al completar la transferencia',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  sourceMovementID?: string | null;

  @ManyToOne(() => CashMovement, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'sourceMovementID' })
  sourceMovement?: CashMovement | null;

  /** Movimiento `CASH_IN` generado en la sesión destino (solo caja a caja). */
  @ApiPropertyOptional({
    description:
      'ID del movimiento CASH_IN generado en la sesión destino (solo para transferencias entre cajas; null en destino VAULT)',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  destinationMovementID?: string | null;

  @ManyToOne(() => CashMovement, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'destinationMovementID' })
  destinationMovement?: CashMovement | null;

  @ApiPropertyOptional({
    description: 'Motivo o comentario de la solicitud de traslado',
    example: 'Retiro de excedente del turno mañana',
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'Observaciones registradas al aprobar',
    example: 'Retiro autorizado por supervisión de turno',
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  approvalNotes?: string | null;

  @ApiPropertyOptional({
    description: 'Motivo del rechazo de la transferencia',
    example: 'El monto no coincide con el conteo físico del turno',
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  rejectionReason?: string | null;

  @ApiPropertyOptional({
    description: 'Motivo de la cancelación de la transferencia',
    example: 'Se anuló la remesa por cambio de turno',
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  cancellationReason?: string | null;

  @ApiProperty({
    description: 'Fecha de creación del registro (UTC)',
    example: '2026-09-14T15:00:00.000Z',
  })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @ApiProperty({
    description: 'Fecha de última actualización del registro (UTC)',
    example: '2026-09-14T15:30:00.000Z',
  })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
