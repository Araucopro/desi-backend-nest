import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Product } from './product.entity';
import { StoreProduct } from '../../relations/storeproduct/entities/storeproduct.entity';

@Entity({ name: 'ProductVariations' })
export class ProductVariation {
  @PrimaryGeneratedColumn('uuid')
  variationID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => Product, (product) => product.variations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productID' })
  product!: Product;

  @OneToMany(() => StoreProduct, (storeProduct) => storeProduct.variation)
  storeProducts!: StoreProduct[];

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  sku!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  color?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  size?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  supplierSku?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
