import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VoidCashMovementDto {
  @ApiProperty({
    description:
      'Motivo de la anulación. Queda registrado en el movimiento anulado y en el contra-movimiento.',
    example: 'Monto digitado erróneamente',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
