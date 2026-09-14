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
import { User } from '../../users/entities/user.entity';
import { CashRegisterSession } from './cash-register-session.entity';

export enum CashRegisterSessionUserRole {
  OPERATOR = 'OPERATOR',
  SUPERVISOR = 'SUPERVISOR',
}

/**
 * Bitácora de operadores de una sesión de caja (Hito 4).
 *
 * Responde "¿quién estaba operando la caja cuando ocurrió este hecho?": la
 * sesión registra quién la abrió, esta tabla registra cada cajero que atendió
 * el turno con su hora de entrada (`enteredAt`) y salida (`leftAt`).
 *
 * Invariante: un mismo usuario no puede tener dos registros activos
 * (`leftAt IS NULL`) en la misma sesión. Se garantiza con el índice único
 * parcial `IDX_unique_active_session_user` creado en la migración.
 */
@Entity({ name: 'CashRegisterSessionUser' })
@Index(['tenantID', 'sessionUserID'])
@Index(['tenantID', 'sessionID'])
@Index(['tenantID', 'userID'])
export class CashRegisterSessionUser {
  @PrimaryGeneratedColumn('uuid', { name: 'sessionUserID' })
  sessionUserID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  sessionID!: string;

  @ManyToOne(() => CashRegisterSession, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sessionID' })
  session!: CashRegisterSession;

  @Column({ type: 'uuid' })
  userID!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userID' })
  user!: User;

  @Column({
    type: 'enum',
    enum: CashRegisterSessionUserRole,
    default: CashRegisterSessionUserRole.OPERATOR,
  })
  role!: CashRegisterSessionUserRole;

  /** Usuario que asignó al cajero a la sesión (o el propio cajero al abrirla). */
  @Column({ type: 'uuid' })
  assignedByUserID!: string;

  @Column({ type: 'timestamp with time zone' })
  enteredAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  leftAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
