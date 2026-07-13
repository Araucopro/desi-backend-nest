import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserStore } from '../../relations/userstores/entities/userstore.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { StoreMonthlyTarget } from '../../store-monthly-targets/entities/store-monthly-target.entity';

export enum StoreType {
  CENTRAL = 'central',
  FRANCHISE = 'franchise',
  CONSIGNMENT = 'consignment',
  THIRD_PARTY = 'third_party',
}

@Entity({ name: 'Store', schema: 'public' })
export class Store {
  @PrimaryGeneratedColumn('uuid', {
    name: 'storeID',
  })
  storeID!: string;

  @Column({ type: 'varchar', length: 255 })
  location!: string;

  @Column({ type: 'varchar', length: 255 })
  rut!: string;

  @Column({ type: 'varchar', length: 255 })
  address!: string;

  @Column({ type: 'varchar', length: 255 })
  phone!: string;

  @Column({ type: 'varchar', length: 255 })
  city!: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  storeImg!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    unique: true,
  })
  email!: string;

  @Column({
    type: 'varchar',
    length: 255,
    unique: true,
  })
  name!: string;

  @Column({
    type: 'enum',
    enum: StoreType,
  })
  type!: StoreType;

  @Column({
    type: 'boolean',
    default: false,
  })
  isCentralStore!: boolean;

  @OneToMany('UserStore', 'store')
  userStores!: UserStore[];

  @OneToMany('Expense', 'store')
  expenses!: Expense[];

  @OneToMany('StoreMonthlyTarget', 'store')
  monthlyTargets!: StoreMonthlyTarget[];

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updatedAt' })
  updatedAt!: Date;
}
