import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum MasterRole { SUPER_ADMIN = 'SUPER_ADMIN', SUPPORT = 'SUPPORT' }

@Entity({ name: 'master_users' })
export class MasterUser {
  @PrimaryGeneratedColumn('uuid') masterUserID!: string;
  @Column({ length: 128, unique: true }) email!: string;
  @Column({ length: 255 }) password!: string;
  @Column({ type: 'enum', enum: MasterRole }) role!: MasterRole;
  @Column({ type: 'int', default: 1 }) sessionVersion!: number;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
