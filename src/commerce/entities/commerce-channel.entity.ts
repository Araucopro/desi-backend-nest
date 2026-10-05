import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Platform configuration: resolved before a tenant context exists. */
@Entity({ name: 'commerce_channels' })
@Index(['tenantID', 'code'], { unique: true })
export class CommerceChannel {
  @PrimaryGeneratedColumn('uuid') channelID!: string;
  @Column({ type: 'uuid' }) tenantID!: string;
  @Column({ type: 'uuid' }) storeID!: string;
  @Column({ type: 'varchar', length: 64 }) code!: string;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) domain!:
    | string
    | null;
  @Column({ type: 'char', length: 64 }) tokenHash!: string;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @CreateDateColumn({ type: 'timestamp with time zone' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamp with time zone' }) updatedAt!: Date;
}
