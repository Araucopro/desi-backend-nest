import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectCashRegisterClosingDto {
  @ApiProperty({
    description:
      'Motivo del rechazo del arqueo. La sesión permanece abierta para rehacer el conteo.',
    example: 'Conteo incompleto: falta cuadrar el cambio de billetes',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
