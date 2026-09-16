import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AttendanceOverrideType } from '../entities/attendance-override.entity';

export class UpdateAttendanceOverrideDto {
  @ApiPropertyOptional({
    description: 'Nuevo primer día del override, inclusive.',
    example: '2026-09-10',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Nuevo último día del override, inclusive.',
    example: '2026-09-12',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Nuevo tipo de asistencia.',
    enum: AttendanceOverrideType,
    example: AttendanceOverrideType.JUSTIFIED_ABSENCE,
  })
  @IsOptional()
  @IsEnum(AttendanceOverrideType)
  type?: AttendanceOverrideType;

  @ApiPropertyOptional({
    description: 'Nuevo motivo administrativo.',
    example: 'Permiso autorizado por jefatura',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason?: string;
}
