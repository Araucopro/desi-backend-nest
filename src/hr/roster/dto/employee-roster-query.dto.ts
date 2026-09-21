import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class EmployeeRosterQueryDto {
  @ApiPropertyOptional({
    description:
      'Fecha del roster en formato YYYY-MM-DD. Si se omite, se usa la fecha actual del tenant.',
    example: '2026-09-15',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}
