import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateStoreClosureDto {
  @ApiProperty({
    description: 'Primer día que la tienda no operará, inclusive.',
    example: '2026-09-20',
    format: 'date',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    description: 'Último día que la tienda no operará, inclusive.',
    example: '2026-09-20',
    format: 'date',
  })
  @IsDateString()
  endDate!: string;

  @ApiProperty({
    description: 'Motivo administrativo del cierre.',
    example: 'Domingo no operativo',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
