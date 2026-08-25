import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnStatus, ReturnType } from '../entities/return.entity';

export class ListReturnsQueryDto {
  @ApiPropertyOptional({
    description: 'Filtro por venta original',
  })
  @IsOptional()
  @IsUUID()
  saleID?: string;

  @ApiPropertyOptional({
    description: 'Filtro por estado',
    enum: ReturnStatus,
  })
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @ApiPropertyOptional({
    description: 'Filtro por tipo de devolución',
    enum: ReturnType,
  })
  @IsOptional()
  @IsEnum(ReturnType)
  returnType?: ReturnType;

  @ApiPropertyOptional({ description: 'Página', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Tamaño de página', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}
