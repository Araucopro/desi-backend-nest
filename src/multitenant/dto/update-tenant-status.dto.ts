import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TenantStatus } from '../entities/tenant.entity';

export class UpdateTenantStatusDto {
  @ApiProperty({
    enum: TenantStatus,
    example: TenantStatus.ACTIVE,
    description:
      'Nuevo estado del tenant: PROVISIONING, ACTIVE, SUSPENDED o ARCHIVED',
  })
  @IsEnum(TenantStatus)
  status!: TenantStatus;
}
