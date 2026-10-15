import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsRut } from '../../common/validators/rut.validator';

export class CommerceSaleReceiverDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(200)
  name!: string;
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsRut() rut?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  giro?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  city?: string;
}

export class CommerceShippingDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) street!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) comuna!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) region!: string;
}

export class CommercePaymentDto {
  @ApiProperty({ example: 'mercadopago' })
  @Matches(/^[a-z][a-z0-9_-]{0,31}$/)
  provider!: string;
  @ApiProperty({ example: '182331112651' })
  @IsString()
  @Matches(/^[^\s]+(?: [^\s]+)*$/)
  @MaxLength(128)
  reference!: string;
  @ApiProperty({ enum: ['approved'] }) @Equals('approved') status!: 'approved';
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(9999999999)
  amount!: number;
  @ApiProperty({ enum: ['CLP'] }) @Equals('CLP') currency!: 'CLP';
  @ApiProperty({ format: 'date-time' }) @IsDateString() paidAt!: string;
  @ApiProperty({
    description:
      'Clasificado por el backend del ecommerce usando la cuenta del proveedor; no inferir solo de live_mode.',
  })
  @IsBoolean()
  isTest!: boolean;
}

export class CommerceSaleItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() storeProductID!: string;
  @ApiProperty({ minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class CreateCommerceSaleDto {
  @ApiProperty({ description: 'ID estable del pedido en este canal' })
  @IsString()
  @Matches(/^[^\s]+(?: [^\s]+)*$/)
  @MaxLength(128)
  externalOrderID!: string;
  @ApiProperty({ type: [CommerceSaleItemDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((item: CommerceSaleItemDto) => item?.storeProductID)
  @ValidateNested({ each: true })
  @Type(() => CommerceSaleItemDto)
  items!: CommerceSaleItemDto[];
  @ApiProperty({ type: CommerceSaleReceiverDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CommerceSaleReceiverDto)
  receiver!: CommerceSaleReceiverDto;
  @ApiProperty({ type: CommercePaymentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CommercePaymentDto)
  payment!: CommercePaymentDto;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
  @ApiPropertyOptional({ type: CommerceShippingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CommerceShippingDto)
  shipping?: CommerceShippingDto;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
