import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Sale } from '../../sales/entities/sale.entity';
import { CommerceChannel } from './commerce-channel.entity';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';
import type { CommerceShippingDto } from '../dto/create-commerce-sale.dto';

@Entity({ name: 'commerce_orders' })
@Index(['tenantID', 'commerceOrderID'])
@Index(['tenantID', 'channelID', 'externalOrderID'], { unique: true })
@Index(['tenantID', 'paymentProvider', 'paymentReference'], { unique: true })
@Index(['tenantID', 'saleID'], { unique: true })
export class CommerceOrder {
  @PrimaryGeneratedColumn('uuid') commerceOrderID!: string;
  @Column({ type: 'uuid' }) tenantID!: string;
  @Column({ type: 'uuid' }) storeID!: string;
  @Column({ type: 'uuid' }) channelID!: string;
  @ManyToOne(() => CommerceChannel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'channelID' })
  channel!: CommerceChannel;
  @Column({ type: 'varchar', length: 128 }) externalOrderID!: string;
  @Column({ type: 'uuid' }) saleID!: string;
  @ManyToOne(() => Sale, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'saleID' })
  sale!: Sale;
  @Column({ type: 'char', length: 64 }) requestHash!: string;
  @Column({ type: 'varchar', length: 32 }) paymentProvider!: string;
  @Column({ type: 'varchar', length: 128 }) paymentReference!: string;
  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount!: number;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'timestamptz' }) paidAt!: Date;
  @Column({ type: 'boolean' }) isTest!: boolean;
  @Column({ type: 'jsonb' }) customerDetails!: {
    phone: string | null;
    shipping: CommerceShippingDto | null;
    notes: string | null;
  };
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
