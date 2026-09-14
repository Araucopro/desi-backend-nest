import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ClientSegment } from '../entities/client.entity';

export class ListClientsQueryDto {
  @ApiPropertyOptional({
    description: 'Página a consultar (mínimo 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de elementos por página',
    example: 50,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Búsqueda por RUT o nombre del cliente (coincidencia parcial)',
    example: '76234',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por segmento de cliente',
    enum: ClientSegment,
  })
  @IsOptional()
  @IsEnum(ClientSegment)
  segment?: ClientSegment;
}
