import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export const MAX_HIDDEN_INVENTORY_COLUMNS = 100;
export const MAX_INVENTORY_COLUMN_KEY_LENGTH = 128;

function trimColumnKeys(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item: unknown) =>
    typeof item === 'string' ? item.trim() : item,
  );
}

export class UpdateInventoryColumnPreferenceDto {
  @ApiProperty({
    description:
      'Lista completa de claves de interfaz que se ocultarán (cada clave admite hasta 128 caracteres). Puede estar vacía para restablecer todas las columnas visibles. Los duplicados se eliminan y no se valida la lista contra los campos de la API.',
    type: [String],
    maxItems: MAX_HIDDEN_INVENTORY_COLUMNS,
    example: ['supplierSku', 'ean'],
  })
  @Transform(({ value }: { value: unknown }) => trimColumnKeys(value))
  @IsArray()
  @ArrayMaxSize(MAX_HIDDEN_INVENTORY_COLUMNS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_INVENTORY_COLUMN_KEY_LENGTH, { each: true })
  hiddenColumns!: string[];
}
