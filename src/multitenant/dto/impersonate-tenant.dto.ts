import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ImpersonateTenantDto {
  @ApiPropertyOptional({
    example: 'Soporte técnico / Auditoría',
    description:
      'Motivo de la impersonación, registrado en audit_events para trazabilidad',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
