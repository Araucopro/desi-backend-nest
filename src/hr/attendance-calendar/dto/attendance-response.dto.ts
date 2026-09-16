import { ApiProperty } from '@nestjs/swagger';
import { AttendanceOverrideType } from '../../attendance-overrides/entities/attendance-override.entity';

export enum AttendanceCalendarEmployeeStatus {
  PRESENT = 'PRESENT',
  CLOSED = 'CLOSED',
  VACATION = AttendanceOverrideType.VACATION,
  MEDICAL_LEAVE = AttendanceOverrideType.MEDICAL_LEAVE,
  PERMIT = AttendanceOverrideType.PERMIT,
  JUSTIFIED_ABSENCE = AttendanceOverrideType.JUSTIFIED_ABSENCE,
  UNJUSTIFIED_ABSENCE = AttendanceOverrideType.UNJUSTIFIED_ABSENCE,
  PRESENT_ON_CLOSED_DAY = AttendanceOverrideType.PRESENT_ON_CLOSED_DAY,
}

export class AttendanceCalendarEmployeeDto {
  @ApiProperty({
    description: 'Identificador del trabajador.',
    format: 'uuid',
    example: '2a8c8a1d-4d30-46a3-9a17-c7d3a3cc40ab',
  })
  employeeID!: string;

  @ApiProperty({
    description: 'Nombre actual del trabajador.',
    example: 'María González',
  })
  name!: string;

  @ApiProperty({
    description: 'Nombre del rol/cargo actual del trabajador.',
    example: 'store_manager',
  })
  role!: string;

  @ApiProperty({
    description:
      'Estado efectivo del trabajador para ese día. PRESENT es el valor por defecto cuando la tienda está abierta.',
    enum: AttendanceCalendarEmployeeStatus,
    example: AttendanceCalendarEmployeeStatus.PRESENT,
  })
  status!: AttendanceCalendarEmployeeStatus;

  @ApiProperty({
    description:
      'Motivo registrado para el override. Es null cuando el trabajador está presente sin override.',
    nullable: true,
    example: 'Vacaciones aprobadas para septiembre',
  })
  reason!: string | null;

  @ApiProperty({
    description: 'Identificador del override que originó el estado, si existe.',
    format: 'uuid',
    nullable: true,
    example: '4c3cc3c0-a44b-42f7-90b2-bb991ef2d9cc',
  })
  overrideID!: string | null;
}

export class AttendanceCalendarDayDto {
  @ApiProperty({
    description: 'Día calendario en la zona horaria del tenant.',
    format: 'date',
    example: '2026-09-15',
  })
  date!: string;

  @ApiProperty({
    description: 'Indica si la tienda operó normalmente ese día.',
    enum: ['OPEN', 'CLOSED'],
    example: 'OPEN',
  })
  storeStatus!: 'OPEN' | 'CLOSED';

  @ApiProperty({
    description: 'Cantidad de trabajadores asignados durante ese día.',
    example: 4,
  })
  employeeCount!: number;

  @ApiProperty({
    description:
      'Cantidad de trabajadores presentes. Incluye las asistencias excepcionales en días cerrados.',
    example: 3,
  })
  presentCount!: number;

  @ApiProperty({
    description:
      'Cantidad de ausencias en días abiertos. Los días cerrados no suman como ausencia.',
    example: 1,
  })
  absentCount!: number;

  @ApiProperty({
    description: 'Detalle diario de cada trabajador del roster.',
    type: () => [AttendanceCalendarEmployeeDto],
  })
  employees!: AttendanceCalendarEmployeeDto[];
}

export class AttendanceCalendarResponseDto {
  @ApiProperty({
    description: 'Tienda consultada.',
    format: 'uuid',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  storeID!: string;

  @ApiProperty({ format: 'date', example: '2026-09-01' })
  from!: string;

  @ApiProperty({ format: 'date', example: '2026-09-30' })
  to!: string;

  @ApiProperty({
    description: 'Días del período, incluyendo días cerrados.',
    type: () => [AttendanceCalendarDayDto],
  })
  days!: AttendanceCalendarDayDto[];
}

export class AttendanceEmployeeSummaryDto {
  @ApiProperty({
    format: 'uuid',
    example: '2a8c8a1d-4d30-46a3-9a17-c7d3a3cc40ab',
  })
  employeeID!: string;

  @ApiProperty({ example: 'María González' })
  name!: string;

  @ApiProperty({ example: 'store_manager' })
  role!: string;

  @ApiProperty({ description: 'Días presentes.', example: 20 })
  presentCount!: number;

  @ApiProperty({ description: 'Ausencias en días abiertos.', example: 1 })
  absentCount!: number;

  @ApiProperty({ description: 'Días cerrados del roster.', example: 2 })
  closedDays!: number;
}

export class AttendanceSummaryResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  storeID!: string;

  @ApiProperty({ format: 'date', example: '2026-09-01' })
  from!: string;

  @ApiProperty({ format: 'date', example: '2026-09-30' })
  to!: string;

  @ApiProperty({
    description: 'Total de asistencias del período.',
    example: 80,
  })
  presentCount!: number;

  @ApiProperty({
    description: 'Total de ausencias en días abiertos.',
    example: 4,
  })
  absentCount!: number;

  @ApiProperty({
    description: 'Total de combinaciones trabajador-día del roster.',
    example: 84,
  })
  employeeDays!: number;

  @ApiProperty({
    description: 'Cantidad de días con la tienda cerrada.',
    example: 2,
  })
  closedDays!: number;

  @ApiProperty({
    description: 'Desglose acumulado por trabajador.',
    type: () => [AttendanceEmployeeSummaryDto],
  })
  employees!: AttendanceEmployeeSummaryDto[];
}
