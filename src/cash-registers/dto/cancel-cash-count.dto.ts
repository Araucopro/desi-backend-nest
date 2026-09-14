import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelCashCountDto {
  @ApiProperty({
    description: 'Motivo por el cual se descarta el conteo en curso',
    example:
      'El conteo se interrumpió y se reiniciará con el efectivo recontado',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
