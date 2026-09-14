import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { CashRegisterSession } from './cash-register-session.entity';

export enum CashRegisterStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
}

@Entity({ name: 'CashRegister' })
@Index(['tenantID', 'cashRegisterID'])
@Index(['tenantID', 'storeID'])
@Index(['tenantID', 'storeID', 'code'], { unique: true })
export class CashRegister {
  @PrimaryGeneratedColumn('uuid', { name: 'cashRegisterID' })
  cashRegisterID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  storeID!: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({
    type: 'enum',
    enum: CashRegisterStatus,
    default: CashRegisterStatus.ACTIVE,
  })
  status!: CashRegisterStatus;

  @OneToMany(() => CashRegisterSession, (session) => session.cashRegister)
  sessions!: CashRegisterSession[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
