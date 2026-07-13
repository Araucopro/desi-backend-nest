import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { ProductVariation } from '../../products/entities/product-variation.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

@Entity({ name: 'SaleProduct' })
export class SaleProduct {
  @PrimaryGeneratedColumn('uuid')
  saleProductID!: string;

  @ManyToOne(() => Sale, (sale) => sale.saleProducts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'saleID' })
  sale!: Sale;

  @ManyToOne(() => ProductVariation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variationID' })
  variation!: ProductVariation;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  unitPrice!: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  subtotal!: number;

  @Column('int')
  quantitySold!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
