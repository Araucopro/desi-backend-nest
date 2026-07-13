import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StoreProduct } from '../../relations/storeproduct/entities/storeproduct.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE', // e.g., 20% off
  FIXED_AMOUNT = 'FIXED_AMOUNT', // e.g., $5000 off
  FIXED_PRICE = 'FIXED_PRICE', // e.g., Final price $9990
}

export enum DiscountScope {
  UNIT = 'UNIT',
  TOTAL = 'TOTAL',
}

@Entity({ name: 'SpecialOffer' })
export class SpecialOffer {
  @PrimaryGeneratedColumn('uuid')
  offerID!: string;

  @ManyToOne(() => StoreProduct, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeProductID' })
  storeProduct!: StoreProduct;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: DiscountType,
  })
  discountType!: DiscountType;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  value!: number;

  @Column({
    type: 'enum',
    enum: DiscountScope,
    default: DiscountScope.UNIT,
  })
  scope!: DiscountScope;

  @Column({ type: 'boolean', default: false })
  exclusive!: boolean;

  @Column({ type: 'timestamp with time zone' })
  startDate!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  endDate?: Date;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
