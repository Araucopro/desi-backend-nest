import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AttendanceOverrideType } from '../entities/attendance-override.entity';

export class CreateAttendanceOverrideDto {
  @ApiProperty({
    description: 'Usuario trabajador al que se aplicará el override.',
    format: 'uuid',
    example: '2a8c8a1d-4d30-46a3-9a17-c7d3a3cc40ab',
  })
  @IsUUID()
  employeeID!: string;

  @ApiProperty({
    description: 'Primer día del override, inclusive.',
    example: '2026-09-10',
    format: 'date',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    description: 'Último día del override, inclusive.',
    example: '2026-09-12',
    format: 'date',
  })
  @IsDateString()
  endDate!: string;

  @ApiProperty({
    description:
      'Tipo de asistencia. PRESENT_ON_CLOSED_DAY permite registrar una asistencia excepcional cuando la tienda está cerrada.',
    enum: AttendanceOverrideType,
    example: AttendanceOverrideType.VACATION,
  })
  @IsEnum(AttendanceOverrideType)
  type!: AttendanceOverrideType;

  @ApiProperty({
    description:
      'Motivo administrativo visible en el calendario y la auditoría.',
    example: 'Licencia médica informada por el trabajador',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
