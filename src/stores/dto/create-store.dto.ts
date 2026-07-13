import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsBoolean,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { StoreType } from '../entities/store.entity';

export class CreateStoreDto {
  @ApiProperty({
    description: 'Comuna o sector de la tienda',
    example: 'Providencia',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly location!: string;

  @ApiProperty({
    description: 'Rol Único Tributario de la tienda',
    example: '76283592-1',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly rut!: string;

  @ApiProperty({
    description: 'Dirección física de la tienda',
    example: 'Av. Siempre Viva 742',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly address!: string;

  @ApiProperty({
    description: 'Número de teléfono de contacto',
    example: '+56912345678',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly phone!: string;

  @ApiProperty({
    description: 'Ciudad donde se encuentra la tienda',
    example: 'Santiago',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly city!: string;

  @ApiPropertyOptional({
    description: 'URL de la imagen de la tienda',
    example: 'https://ejemplo.com/tienda_img.jpg',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  @MaxLength(255)
  readonly storeImg?: string;

  @ApiProperty({
    description: 'Correo electrónico de contacto (debe ser único y requerido)',
    example: 'contacto@tienda.com',
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  readonly email!: string;

  @ApiProperty({
    description: 'Nombre de la tienda (debe ser único)',
    example: 'Tienda Principal',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly name!: string;

  @ApiProperty({
    description: 'Tipo de tienda según el negocio',
    enum: StoreType,
    default: StoreType.THIRD_PARTY,
  })
  @IsEnum(StoreType)
  @IsNotEmpty()
  readonly type!: StoreType;

  @ApiPropertyOptional({
    description: 'Indica si es una tienda central (valor por defecto: false)',
    example: false,
    default: false,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  readonly isCentralStore?: boolean;
}
