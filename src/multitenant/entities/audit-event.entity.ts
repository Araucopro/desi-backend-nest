import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'audit_events' })
@Index(['tenantID', 'createdAt'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid') auditEventID!: string;
  @Column({ type: 'uuid', nullable: true }) tenantID!: string | null;
  @Column({ type: 'uuid', nullable: true }) masterUserID!: string | null;
  @Column({ length: 16 }) action!: string;
  @Column({ length: 255 }) endpoint!: string;
  @Column({ type: 'text', nullable: true }) reason!: string | null;
  @Column({ length: 32 }) result!: string;
  @CreateDateColumn() createdAt!: Date;
}
