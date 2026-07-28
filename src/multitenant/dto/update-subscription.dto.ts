import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { TenantPlanType } from '../entities/tenant.entity';

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({
    enum: TenantPlanType,
    example: TenantPlanType.ENTERPRISE,
    description: 'Tipo de plan asignado al tenant',
  })
  @IsOptional()
  @IsEnum(TenantPlanType)
  planType?: TenantPlanType;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.000Z',
    description: 'Fecha de expiración de la suscripción (ISO String)',
  })
  @IsOptional()
  @IsDateString()
  subscriptionExpiresAt?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Si la suscripción se renueva automáticamente',
  })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}
