import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelStoreClosureDto {
  @ApiPropertyOptional({
    description:
      'Motivo de la cancelación. Si se omite, se registra "Cierre cancelado".',
    example: 'La tienda operará excepcionalmente',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
