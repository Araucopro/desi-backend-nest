import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

export enum CashDenominationType {
  COIN = 'COIN',
  BANKNOTE = 'BANKNOTE',
}

/**
 * Denominación de efectivo configurable por tenant (Hito 4).
 *
 * `value` es el valor facial unitario y `type` distingue billetes de monedas.
 * El catálogo es la fuente de los valores válidos al armar un arqueo
 * detallado; cada `CashCountItem` guarda además su propio snapshot del valor
 * para que el historial no dependa de cambios posteriores del catálogo.
 */
@Entity({ name: 'CashDenomination' })
@Index(['tenantID', 'cashDenominationID'])
@Index(['tenantID', 'value', 'type'], { unique: true })
export class CashDenomination {
  @PrimaryGeneratedColumn('uuid', { name: 'cashDenominationID' })
  cashDenominationID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  value!: number;

  @Column({ type: 'enum', enum: CashDenominationType })
  type!: CashDenominationType;

  @Column({ type: 'varchar', length: 50 })
  label!: string;

  /** Orden de despliegue descendente (mayor valor primero). */
  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}

export type DefaultCashDenomination = {
  value: number;
  type: CashDenominationType;
  label: string;
  sortOrder: number;
};

/** Formatea un valor en pesos chilenos, por ejemplo `20000` -> `$20.000`. */
export function formatCashDenominationLabel(value: number): string {
  const integerValue = Math.round(value);
  const formatted = `${integerValue}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `$${formatted}`;
}

/**
 * Catálogo estándar CLP que se crea de forma idempotente con
 * `POST /cash-denominations/defaults`.
 */
export const DEFAULT_CLP_CASH_DENOMINATIONS: readonly DefaultCashDenomination[] =
  [
    {
      value: 20000,
      type: CashDenominationType.BANKNOTE,
      label: '$20.000',
      sortOrder: 90,
    },
    {
      value: 10000,
      type: CashDenominationType.BANKNOTE,
      label: '$10.000',
      sortOrder: 80,
    },
    {
      value: 5000,
      type: CashDenominationType.BANKNOTE,
      label: '$5.000',
      sortOrder: 70,
    },
    {
      value: 2000,
      type: CashDenominationType.BANKNOTE,
      label: '$2.000',
      sortOrder: 60,
    },
    {
      value: 1000,
      type: CashDenominationType.BANKNOTE,
      label: '$1.000',
      sortOrder: 50,
    },
    {
      value: 500,
      type: CashDenominationType.COIN,
      label: '$500',
      sortOrder: 40,
    },
    {
      value: 100,
      type: CashDenominationType.COIN,
      label: '$100',
      sortOrder: 30,
    },
    {
      value: 50,
      type: CashDenominationType.COIN,
      label: '$50',
      sortOrder: 20,
    },
    {
      value: 10,
      type: CashDenominationType.COIN,
      label: '$10',
      sortOrder: 10,
    },
  ];
