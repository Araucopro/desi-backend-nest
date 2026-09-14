import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectCashTransferDto {
  @ApiProperty({
    description: 'Motivo del rechazo de la transferencia (queda auditado)',
    example: 'El monto no coincide con el conteo físico del turno',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
