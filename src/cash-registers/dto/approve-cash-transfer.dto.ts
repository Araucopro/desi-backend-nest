import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveCashTransferDto {
  @ApiPropertyOptional({
    description: 'Observaciones de la aprobación (quedan auditadas)',
    example: 'Retiro autorizado por supervisión de turno',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  notes?: string;
}
