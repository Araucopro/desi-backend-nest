import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CashRegister } from './cash-register.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

/**
 * Estados de sesión de caja. `SUSPENDED` se eliminó del tipo en
 * `1788891000000-DropCashRegisterSessionSuspendedStatus.ts`: nunca se asignó
 * desde el código y, al quedar fuera del índice parcial `WHERE status = 'OPEN'`,
 * una sesión en ese estado era invisible para `openSession`, que rechazaba la
 * apertura de la caja de forma permanente.
 */
export enum CashRegisterSessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/**
 * Sesión operativa de una caja.
 *
 * Invariante no expresable hoy con `@Index` sin arriesgar un
 * `migration:generate` incorrecto: existe **una sola** sesión `OPEN` por caja y
 * tenant, garantizada por el índice único parcial
 * `IDX_unique_open_session_per_register` creado en
 * `1788880000000-CreateCashRegistersAndSessions.ts`:
 *
 * ```sql
 * CREATE UNIQUE INDEX "IDX_unique_open_session_per_register"
 *   ON "CashRegisterSession" ("tenantID", "cashRegisterID")
 *   WHERE status = 'OPEN';
 * ```
 *
 * `CashRegistersService.openSession` lo traduce a un `409`. Si se toca el enum
 * de estado, hay que recrear el índice: referencia el tipo
 * `CashRegisterSession_status_enum`, no texto libre — es exactamente lo que
 * hace la migración que quitó `SUSPENDED`.
 *
 * Como `synchronize` está en `false` y `migrationsRun` también, un restore o un
 * `migration:fresh` pueden dejar el índice ausente **en silencio** y el síntoma
 * reaparecería como dos sesiones simultáneas sobre la misma caja.
 * `CashRegisterSchemaGuardService` verifica al arranque que exista, sea `UNIQUE`
 * y siga siendo parcial.
 */
@Entity({ name: 'CashRegisterSession' })
@Index(['tenantID', 'sessionID'])
@Index(['tenantID', 'cashRegisterID'])
@Index(['tenantID', 'businessDate'])
export class CashRegisterSession {
  @PrimaryGeneratedColumn('uuid', { name: 'sessionID' })
  sessionID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  cashRegisterID!: string;

  @ManyToOne(() => CashRegister, (register) => register.sessions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'cashRegisterID' })
  cashRegister!: CashRegister;

  @Column({ type: 'date' })
  businessDate!: string;

  @Column({ type: 'uuid' })
  openedByUserID!: string;

  @Column({ type: 'uuid', nullable: true })
  closedByUserID?: string | null;

  @Column({ type: 'timestamp with time zone' })
  openedAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  closedAt?: Date | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  openingBalance!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  expectedCashBalance?: number | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  countedCashBalance?: number | null;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  cashDifference?: number | null;

  @Column({
    type: 'enum',
    enum: CashRegisterSessionStatus,
    default: CashRegisterSessionStatus.OPEN,
  })
  status!: CashRegisterSessionStatus;

  @Column({ type: 'text', nullable: true })
  openingNotes?: string | null;

  @Column({ type: 'text', nullable: true })
  closingNotes?: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
