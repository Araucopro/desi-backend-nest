import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class IncomeStatementQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @ApiPropertyOptional({
    description: 'Año calendario del estado de resultados',
    example: 2026,
  })
  year?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'ID de la tienda para filtrar el estado de resultados',
    example: 'store-uuid',
  })
  storeId?: string;
}
