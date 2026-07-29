import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantStatus } from '../entities/tenant.entity';

export class QueryTenantsDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: TenantStatus,
    description: 'Filtrar por estado del tenant',
  })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({
    description: 'Término de búsqueda por nombre o slug del tenant',
    example: 'tienda',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
