import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

@Entity({ name: 'SaleItem' })
@Index(['tenantID', 'saleID'])
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  saleItemID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => Sale, (sale) => sale.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'saleID' })
  sale!: Sale;

  @Column({ type: 'uuid' })
  saleID!: string;

  @Column({ type: 'uuid' })
  storeProductID!: string;

  @Column({ type: 'uuid' })
  variationID!: string;

  @Column({ type: 'varchar', length: 255 })
  productName!: string;

  @Column({ type: 'varchar', length: 255 })
  sku!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  unitPrice!: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  unitCost!: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  lineTotal!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
