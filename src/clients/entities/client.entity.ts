import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ClientSegment {
  RETAIL = 'RETAIL',
  WHOLESALE = 'WHOLESALE',
}

@Entity({ name: 'Client' })
@Index(['tenantID', 'clientID'])
@Index(['tenantID', 'rut'], { unique: true })
export class Client {
  @PrimaryGeneratedColumn('uuid')
  clientID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'varchar', length: 20 })
  rut!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  giro?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  city?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string | null;

  @Column({
    type: 'enum',
    enum: ClientSegment,
    default: ClientSegment.RETAIL,
  })
  segment!: ClientSegment;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
