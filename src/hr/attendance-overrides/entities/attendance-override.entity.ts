import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from '../../../stores/entities/store.entity';
import { User } from '../../../users/entities/user.entity';

export enum AttendanceOverrideType {
  VACATION = 'VACATION',
  MEDICAL_LEAVE = 'MEDICAL_LEAVE',
  PERMIT = 'PERMIT',
  JUSTIFIED_ABSENCE = 'JUSTIFIED_ABSENCE',
  UNJUSTIFIED_ABSENCE = 'UNJUSTIFIED_ABSENCE',
  PRESENT_ON_CLOSED_DAY = 'PRESENT_ON_CLOSED_DAY',
}

@Entity({ name: 'HrAttendanceOverride' })
@Index(['tenantID', 'storeID', 'employeeID', 'startDate', 'endDate'])
export class AttendanceOverride {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({
    description: 'Identificador del override.',
    format: 'uuid',
    example: '4c3cc3c0-a44b-42f7-90b2-bb991ef2d9cc',
  })
  id!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  employeeID!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employeeID' })
  employee!: User;

  @Column({ type: 'uuid' })
  storeID!: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({ type: 'date' })
  @ApiProperty({
    description: 'Primer día del override, inclusive.',
    format: 'date',
    example: '2026-09-10',
  })
  startDate!: string;

  @Column({ type: 'date' })
  @ApiProperty({
    description: 'Último día del override, inclusive.',
    format: 'date',
    example: '2026-09-12',
  })
  endDate!: string;

  @Column({ type: 'enum', enum: AttendanceOverrideType })
  @ApiProperty({
    description: 'Tipo de estado que prevalece sobre PRESENT.',
    enum: AttendanceOverrideType,
    example: AttendanceOverrideType.MEDICAL_LEAVE,
  })
  type!: AttendanceOverrideType;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'Motivo administrativo del override.',
    example: 'Licencia médica',
  })
  reason!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
