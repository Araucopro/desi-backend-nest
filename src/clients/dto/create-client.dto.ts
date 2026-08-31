import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { IsRut } from '../../common/validators/rut.validator';
import { ClientSegment } from '../entities/client.entity';

export class CreateClientDto {
  @ApiProperty({
    description: 'RUT del cliente (formato chileno válido)',
    example: '76234556-6',
  })
  @IsString()
  @IsNotEmpty()
  @IsRut()
  rut!: string;

  @ApiProperty({
    description: 'Nombre o razón social del cliente',
    example: 'Comercial Ejemplo SpA',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Giro del cliente',
    example: 'VENTA AL POR MENOR',
  })
  @IsOptional()
  @IsString()
  giro?: string;

  @ApiPropertyOptional({
    description: 'Dirección comercial del cliente',
    example: 'Av. Providencia 1234',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'Comuna o ciudad del cliente',
    example: 'Providencia',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico de contacto',
    example: 'contacto@ejemplo.cl',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Teléfono de contacto',
    example: '+56912345678',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Segmento del cliente (RETAIL o WHOLESALE)',
    enum: ClientSegment,
    default: ClientSegment.RETAIL,
  })
  @IsOptional()
  @IsEnum(ClientSegment)
  segment?: ClientSegment;

  @ApiPropertyOptional({
    description: 'Notas o comentarios adicionales',
    example: 'Cliente frecuente de compras al por mayor',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
