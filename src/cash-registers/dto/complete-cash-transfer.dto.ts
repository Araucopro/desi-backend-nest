import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteCashTransferDto {
  @ApiPropertyOptional({
    description:
      'Momento en que el efectivo salió físicamente de la caja (ISO 8601). Por defecto la hora actual; no puede ser futuro ni anterior a la solicitud.',
    example: '2026-09-14T21:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
