import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ImpersonateTenantDto {
  @ApiPropertyOptional({ example: 'Soporte técnico / Auditoría' })
  @IsOptional()
  @IsString()
  reason?: string;
}
