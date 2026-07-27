import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TenantStatus {
  PROVISIONING = 'PROVISIONING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity({ name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid') tenantID!: string;
  @Column({ length: 160 }) name!: string;
  @Column({ length: 80, unique: true }) slug!: string;
  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.PROVISIONING,
  })
  status!: TenantStatus;
  @Column({ type: 'int', default: 5 }) maxStores!: number;
  @Column({ type: 'int', default: 5 }) maxUsers!: number;
  @Column({ length: 64, default: 'America/Santiago' }) timeZone!: string;
  @Column({ length: 8, default: 'es-CL' }) locale!: string;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
