import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class CalendarQueryDto {
  @ApiProperty({
    description:
      'Mes a consultar en formato YYYY-MM. El rango resultante incluye todo el mes.',
    example: '2026-09',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}
