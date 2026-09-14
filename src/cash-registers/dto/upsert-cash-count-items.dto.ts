import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CashCountItemInputDto {
  @ApiProperty({
    description: 'ID de la denominación del catálogo del tenant',
    example: 'b1f2c3d4-1111-4222-8333-444455556666',
  })
  @IsUUID()
  denominationID!: string;

  @ApiProperty({
    description:
      'Cantidad de unidades contadas. Si es 0, el ítem se elimina del conteo.',
    example: 5,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}

export class UpsertCashCountItemsDto {
  @ApiProperty({
    description:
      'Desglose completo o parcial de denominaciones contadas físicamente',
    type: [CashCountItemInputDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CashCountItemInputDto)
  items!: CashCountItemInputDto[];
}
