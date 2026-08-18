import { UserStore } from '../../relations/userstores/entities/userstore.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  STORE_MANAGER = 'store_manager',
  CONSIGNADO = 'consignado',
  TERCERO = 'tercero',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity({ name: 'Users' })
export class User {
  @PrimaryGeneratedColumn('uuid', { name: 'userID' })
  userID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role!: UserRole;

  @Column({
    type: 'varchar',
    length: 20,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userImg!: string | null;

  @Column({ type: 'varchar', length: 255 })
  password!: string;

  @Column({ type: 'int', default: 1 })
  sessionVersion!: number;

  @OneToMany(() => UserStore, (userStore) => userStore.user)
  userStores!: UserStore[];

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updatedAt' })
  updatedAt!: Date;
}
