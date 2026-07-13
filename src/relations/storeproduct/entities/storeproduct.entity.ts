import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Store } from '../../../stores/entities/store.entity';
import { ProductVariation } from '../../../products/entities/product-variation.entity';
import { SpecialOffer } from '../../../pricing/entities/special-offer.entity';
import { ColumnNumericTransformer } from '../../../common/transformers/numeric.transformer';

@Entity({ name: 'StoreProduct' })
@Index(['variation', 'store'], { unique: true })
export class StoreProduct {
  @PrimaryGeneratedColumn('uuid')
  storeProductID!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @ManyToOne(() => ProductVariation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variationID' })
  variation!: ProductVariation;

  /**
   * @deprecated logic should use InventoryMovements as source of truth.
   * This field is a CACHE / READ MODEL derived from movements.
   */
  @Column('int', { default: 0 })
  stock!: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  priceCost!: number; // Precio al que la tienda compró este producto

  @Column('decimal', {
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  priceList?: number; // Precio de venta en la tienda

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => SpecialOffer, (offer) => offer.storeProduct)
  specialOffers!: SpecialOffer[];

  @UpdateDateColumn()
  updatedAt!: Date;
}
