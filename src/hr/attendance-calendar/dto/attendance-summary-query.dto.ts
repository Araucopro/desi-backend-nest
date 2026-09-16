import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class AttendanceSummaryQueryDto {
  @ApiProperty({
    description: 'Primer día del resumen, inclusive.',
    example: '2026-09-01',
    format: 'date',
  })
  @IsDateString()
  from!: string;

  @ApiProperty({
    description:
      'Último día del resumen, inclusive. El rango máximo es de 367 días.',
    example: '2026-09-30',
    format: 'date',
  })
  @IsDateString()
  to!: string;
}
