import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Return } from './return.entity';
import { SaleItem } from '../../sales/entities/sale-item.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

@Entity({ name: 'ReturnItem' })
@Index(['tenantID', 'returnID'])
export class ReturnItem {
  @PrimaryGeneratedColumn('uuid')
  returnItemID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => Return, (ret) => ret.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'returnID' })
  ret!: Return;

  @Column({ type: 'uuid' })
  returnID!: string;

  @ManyToOne(() => SaleItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'saleItemID' })
  saleItem!: SaleItem;

  @Column({ type: 'uuid' })
  saleItemID!: string;

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
