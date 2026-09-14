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
import { CashCount } from './cash-count.entity';
import {
  CashDenomination,
  CashDenominationType,
} from './cash-denomination.entity';

/**
 * Desglose de un conteo por denominación: `quantity` unidades de
 * `denominationValue`, con `subtotal = quantity * denominationValue`.
 *
 * `denominationValue` y `denominationType` son snapshots del catálogo al
 * momento del conteo: si el tenant luego cambia o desactiva la denominación,
 * el arqueo histórico sigue siendo auditable.
 */
@Entity({ name: 'CashCountItem' })
@Index(['tenantID', 'cashCountItemID'])
@Index(['tenantID', 'cashCountID'])
@Index(['tenantID', 'cashCountID', 'denominationID'], { unique: true })
export class CashCountItem {
  @PrimaryGeneratedColumn('uuid', { name: 'cashCountItemID' })
  cashCountItemID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  cashCountID!: string;

  @ManyToOne(() => CashCount, (count) => count.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cashCountID' })
  cashCount!: CashCount;

  @Column({ type: 'uuid' })
  denominationID!: string;

  @ManyToOne(() => CashDenomination, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'denominationID' })
  denomination!: CashDenomination;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  denominationValue!: number;

  @Column({ type: 'enum', enum: CashDenominationType })
  denominationType!: CashDenominationType;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  subtotal!: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
