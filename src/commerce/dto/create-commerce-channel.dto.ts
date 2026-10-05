import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCommerceChannelDto {
  @ApiProperty({ example: 'DESI_WEB' })
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/)
  code!: string;

  @ApiProperty({ example: 'desi.cl' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  storeID!: string;

  @ApiPropertyOptional({ example: 'www.desi.cl' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;
}

export class UpdateCommerceChannelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  storeID?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
