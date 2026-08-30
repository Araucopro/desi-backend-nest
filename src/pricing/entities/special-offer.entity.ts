import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StoreProduct } from '../../relations/storeproduct/entities/storeproduct.entity';
import { Store } from '../../stores/entities/store.entity';
import { Product } from '../../products/entities/product.entity';
import { Category } from '../../categories/entities/category.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE', // e.g., 20% off
  FIXED_AMOUNT = 'FIXED_AMOUNT', // e.g., $5000 off
  FIXED_PRICE = 'FIXED_PRICE', // e.g., Final price $9990
  BUY_X_GET_Y = 'BUY_X_GET_Y', // e.g., 2x1, 3x2, 6x5
  BUNDLE = 'BUNDLE', // e.g., bundle de productos con una unidad gratis
}

export enum DiscountScope {
  UNIT = 'UNIT',
  TOTAL = 'TOTAL',
}

export enum OfferTargetScope {
  VARIATION = 'VARIATION',
  STORE = 'STORE',
  PRODUCT = 'PRODUCT',
  CATEGORY = 'CATEGORY',
  BRAND = 'BRAND',
  MODEL = 'MODEL',
}

@Entity({ name: 'SpecialOffer' })
export class SpecialOffer {
  @PrimaryGeneratedColumn('uuid')
  offerID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => StoreProduct, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'storeProductID' })
  storeProduct?: StoreProduct | null;

  @Column({ type: 'uuid', nullable: true })
  storeProductID?: string | null;

  @Column({
    type: 'enum',
    enum: OfferTargetScope,
    default: OfferTargetScope.VARIATION,
  })
  targetScope!: OfferTargetScope;

  @ManyToOne(() => Store, { nullable: true })
  @JoinColumn({ name: 'storeID' })
  store?: Store | null;

  @Column({ type: 'uuid', nullable: true })
  storeID?: string | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'productID' })
  product?: Product | null;

  @Column({ type: 'uuid', nullable: true })
  productID?: string | null;

  @ManyToOne(() => Category, { nullable: true })
  @JoinColumn({ name: 'categoryID' })
  category?: Category | null;

  @Column({ type: 'uuid', nullable: true })
  categoryID?: string | null;

  @Column({ type: 'boolean', default: true })
  includeSubcategories!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  model?: string | null;

  @Column({ type: 'int', nullable: true })
  buyQuantity?: number | null;

  @Column({ type: 'int', nullable: true })
  payQuantity?: number | null;

  @Column({ type: 'int', default: 0 })
  priority!: number;

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

  @Column({ type: 'boolean', default: false })
  allowBelowMargin!: boolean;

  @Column({ type: 'timestamp with time zone' })
  startDate!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  endDate?: Date;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => SpecialOfferProduct, (item) => item.offer, {
    cascade: true,
  })
  productTargets!: SpecialOfferProduct[];

  @OneToMany(() => SpecialOfferBundleItem, (item) => item.offer, {
    cascade: true,
  })
  bundleItems!: SpecialOfferBundleItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity({ name: 'SpecialOfferProduct' })
export class SpecialOfferProduct {
  @PrimaryGeneratedColumn('uuid')
  specialOfferProductID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => SpecialOffer, (offer) => offer.productTargets, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'offerID' })
  offer!: SpecialOffer;

  @Column({ type: 'uuid' })
  offerID!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'productID' })
  product?: Product | null;

  @Column({ type: 'uuid' })
  productID!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity({ name: 'SpecialOfferBundleItem' })
export class SpecialOfferBundleItem {
  @PrimaryGeneratedColumn('uuid')
  specialOfferBundleItemID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => SpecialOffer, (offer) => offer.bundleItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'offerID' })
  offer!: SpecialOffer;

  @Column({ type: 'uuid' })
  offerID!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'productID' })
  product?: Product | null;

  @Column({ type: 'uuid', nullable: true })
  productID?: string | null;

  @ManyToOne(() => StoreProduct, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'storeProductID' })
  storeProduct?: StoreProduct | null;

  @Column({ type: 'uuid', nullable: true })
  storeProductID?: string | null;

  @Column({ type: 'int', default: 1 })
  requiredQuantity!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
