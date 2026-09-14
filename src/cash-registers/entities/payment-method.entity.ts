import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PaymentMethodType {
  CASH = 'CASH',
  DEBIT_CARD = 'DEBIT_CARD',
  CREDIT_CARD = 'CREDIT_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
  CREDIT = 'CREDIT',
  OTHER = 'OTHER',
}

/**
 * Catálogo de medios de pago del tenant.
 *
 * `affectsCash` es el discriminador contable de caja: solo los medios que
 * mueven efectivo generan `CashMovement` al cobrar una venta.
 */
@Entity({ name: 'PaymentMethod' })
@Index(['tenantID', 'paymentMethodID'])
@Index(['tenantID', 'code'], { unique: true })
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid', { name: 'paymentMethodID' })
  paymentMethodID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'enum', enum: PaymentMethodType })
  type!: PaymentMethodType;

  @Column({ type: 'boolean', default: false })
  affectsCash!: boolean;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
