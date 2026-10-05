import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CommerceQuoteItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  storeProductID!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class CommerceQuoteDto {
  @ApiProperty({ type: [CommerceQuoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CommerceQuoteItemDto)
  items!: CommerceQuoteItemDto[];
}
