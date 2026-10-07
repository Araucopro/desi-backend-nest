import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { InventoryColumnStoreFilter } from '../entities/inventory-column-preference.entity';

export class InventoryColumnPreferenceQueryDto {
  @ApiPropertyOptional({
    description: 'ID de una tienda a la que el usuario tiene acceso.',
    format: 'uuid',
    example: '7f9b7a5e-208c-4e4a-8ba1-a4e73480b736',
  })
  @IsOptional()
  @IsUUID()
  storeID?: string;

  @ApiPropertyOptional({
    description:
      'Filtro de vista agregada. Disponible exclusivamente para TENANT_ADMIN.',
    enum: InventoryColumnStoreFilter,
    example: InventoryColumnStoreFilter.ALL,
  })
  @IsOptional()
  @IsEnum(InventoryColumnStoreFilter)
  storeFilter?: InventoryColumnStoreFilter;
}
