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
import { Store } from '../../stores/entities/store.entity';
import { SaleProduct } from './sale-product.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';

@Entity({ name: 'Sale' })
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  saleID!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({
    type: 'enum',
    enum: ['Pagado', 'Pendiente', 'Anulado'],
    default: 'Pendiente',
  })
  status!: 'Pagado' | 'Pendiente' | 'Anulado';

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  total!: number;

  @Column({
    type: 'enum',
    enum: ['Efectivo', 'Debito', 'Credito'],
    default: 'Efectivo',
  })
  paymentType!: 'Efectivo' | 'Debito' | 'Credito';

  @OneToMany(() => SaleProduct, (sp) => sp.sale, { cascade: true })
  saleProducts!: SaleProduct[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
