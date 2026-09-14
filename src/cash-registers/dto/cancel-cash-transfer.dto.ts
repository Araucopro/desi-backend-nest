import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelCashTransferDto {
  @ApiProperty({
    description:
      'Motivo de la cancelación de la transferencia (queda auditado)',
    example: 'Se anuló la remesa por cambio de turno',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
