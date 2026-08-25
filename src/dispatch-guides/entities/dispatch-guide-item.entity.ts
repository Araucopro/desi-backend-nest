import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';
import { DispatchGuide } from './dispatch-guide.entity';

@Entity({ name: 'DispatchGuideItem' })
export class DispatchGuideItem {
  @PrimaryGeneratedColumn('uuid')
  dispatchGuideItemID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => DispatchGuide, (guide) => guide.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dispatchGuideID' })
  guide!: DispatchGuide;

  @Index()
  @Column({ type: 'uuid' })
  dispatchGuideID!: string;

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
