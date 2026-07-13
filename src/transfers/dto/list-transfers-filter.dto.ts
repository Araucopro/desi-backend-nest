import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TransferStatus } from '../entities/store-transfer.entity';

export class ListTransfersFilterDto {
  @ApiPropertyOptional({
    description: 'Filtrar por tienda de origen (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  originStoreID?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tienda de destino (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  destinationStoreID?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por estado de la transferencia',
    enum: TransferStatus,
    example: TransferStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  @ApiPropertyOptional({
    description: 'Página (paginación)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por página',
    default: 20,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
