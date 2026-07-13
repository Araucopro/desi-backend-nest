import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { StoreProduct } from '../../relations/storeproduct/entities/storeproduct.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

export enum PriceType {
  COST = 'cost',
  LIST = 'list',
}

@Entity({ name: 'PriceHistory' })
export class PriceHistory {
  @PrimaryGeneratedColumn('uuid')
  historyID!: string;

  @ManyToOne(() => StoreProduct, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeProductID' })
  storeProduct!: StoreProduct;

  @Column({
    type: 'enum',
    enum: PriceType,
  })
  priceType!: PriceType;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  oldPrice!: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  newPrice!: number;

  @Column({ type: 'varchar', nullable: true })
  reason?: string;

  @CreateDateColumn()
  effectiveDate!: Date;

  @Column({ type: 'varchar', nullable: true })
  changedBy?: string;
}
