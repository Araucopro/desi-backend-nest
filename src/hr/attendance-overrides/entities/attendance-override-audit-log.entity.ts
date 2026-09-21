import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AttendanceOverrideType } from './attendance-override.entity';

export enum AttendanceAuditAction {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  DELETED = 'DELETED',
}

@Entity({ name: 'HrAttendanceAuditLog' })
@Index(['tenantID', 'storeID', 'performedAt'])
@Index(['tenantID', 'employeeID', 'affectedStartDate', 'affectedEndDate'])
export class AttendanceOverrideAuditLog {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({
    description: 'Identificador del evento de auditoría.',
    format: 'uuid',
    example: '0c9ae53e-ec6d-44e7-9142-1b7ebba2f11b',
  })
  id!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid', nullable: true })
  @ApiPropertyOptional({
    description: 'Override relacionado. Puede apuntar a un registro eliminado.',
    format: 'uuid',
    nullable: true,
    example: '4c3cc3c0-a44b-42f7-90b2-bb991ef2d9cc',
  })
  overrideID!: string | null;

  @Column({ type: 'uuid' })
  @ApiProperty({
    description: 'Trabajador afectado.',
    format: 'uuid',
    example: '2a8c8a1d-4d30-46a3-9a17-c7d3a3cc40ab',
  })
  employeeID!: string;

  @Column({ type: 'uuid' })
  @ApiProperty({
    description: 'Tienda en la que se aplicó el override.',
    format: 'uuid',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  storeID!: string;

  @Column({ type: 'enum', enum: AttendanceAuditAction })
  @ApiProperty({ enum: AttendanceAuditAction })
  action!: AttendanceAuditAction;

  @Column({ type: 'date' })
  @ApiProperty({
    description: 'Inicio del rango afectado.',
    format: 'date',
    example: '2026-09-10',
  })
  affectedStartDate!: string;

  @Column({ type: 'date' })
  @ApiProperty({
    description: 'Fin del rango afectado.',
    format: 'date',
    example: '2026-09-12',
  })
  affectedEndDate!: string;

  @Column({ type: 'enum', enum: AttendanceOverrideType, nullable: true })
  @ApiPropertyOptional({
    description: 'Tipo anterior. Null en CREATION.',
    enum: AttendanceOverrideType,
    nullable: true,
  })
  previousType!: AttendanceOverrideType | null;

  @Column({ type: 'enum', enum: AttendanceOverrideType, nullable: true })
  @ApiPropertyOptional({
    description: 'Tipo nuevo. Null en DELETE.',
    enum: AttendanceOverrideType,
    nullable: true,
  })
  newType!: AttendanceOverrideType | null;

  @Column({ type: 'text', nullable: true })
  @ApiPropertyOptional({
    description: 'Motivo anterior.',
    nullable: true,
    example: 'Vacaciones',
  })
  previousReason!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiPropertyOptional({
    description: 'Motivo nuevo.',
    nullable: true,
    example: 'Permiso autorizado',
  })
  newReason!: string | null;

  @Column({ type: 'uuid', nullable: true })
  @ApiPropertyOptional({
    description: 'Usuario tenant que ejecutó la acción.',
    format: 'uuid',
    nullable: true,
  })
  performedByUserID!: string | null;

  @Column({ type: 'uuid', nullable: true })
  @ApiPropertyOptional({
    description: 'Usuario master que ejecutó la acción por impersonación.',
    format: 'uuid',
    nullable: true,
  })
  performedByMasterUserID!: string | null;

  @Column({ type: 'timestamptz' })
  @ApiProperty({
    description: 'Fecha y hora de la acción.',
    format: 'date-time',
    example: '2026-09-15T14:30:00.000Z',
  })
  performedAt!: Date;
}
