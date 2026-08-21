import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetOpenfacturaKeyDto {
  @ApiProperty({
    description: 'API key de Openfactura provista por Haulmer para esta tienda',
    example: '928e15a2d14d4a6292345f04960f4bd3',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  readonly apiKey!: string;
}
