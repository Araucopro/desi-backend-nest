import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

@Entity({ name: 'StoreMonthlyTarget' })
@Index(['store', 'period'], { unique: true })
export class StoreMonthlyTarget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne('Store', 'monthlyTargets', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({ type: 'date' })
  period!: Date;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  targetAmount!: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
