import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientSegment } from '../entities/client.entity';

export class ClientDto {
  @ApiProperty({
    description: 'ID único del cliente',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  clientID!: string;

  @ApiProperty({
    description: 'ID del tenant',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  tenantID!: string;

  @ApiProperty({ description: 'RUT del cliente', example: '76234556-6' })
  rut!: string;

  @ApiProperty({
    description: 'Nombre o razón social',
    example: 'Comercial Ejemplo SpA',
  })
  name!: string;

  @ApiPropertyOptional({ description: 'Giro', nullable: true })
  giro?: string | null;

  @ApiPropertyOptional({ description: 'Dirección', nullable: true })
  address?: string | null;

  @ApiPropertyOptional({ description: 'Comuna o ciudad', nullable: true })
  city?: string | null;

  @ApiPropertyOptional({ description: 'Correo electrónico', nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ description: 'Teléfono', nullable: true })
  phone?: string | null;

  @ApiProperty({
    description: 'Segmento del cliente',
    enum: ClientSegment,
    example: ClientSegment.RETAIL,
  })
  segment!: ClientSegment;

  @ApiPropertyOptional({ description: 'Notas', nullable: true })
  notes?: string | null;

  @ApiProperty({ description: 'Fecha de creación' })
  createdAt!: Date;

  @ApiProperty({ description: 'Fecha de actualización' })
  updatedAt!: Date;
}

export class ClientListMetaDto {
  @ApiProperty({ description: 'Página actual', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Tamaño de página', example: 50 })
  limit!: number;

  @ApiProperty({ description: 'Total de elementos', example: 120 })
  total!: number;
}

export class ClientListResponseDto {
  @ApiProperty({ type: [ClientDto] })
  clients!: ClientDto[];

  @ApiProperty({ type: ClientListMetaDto })
  meta!: ClientListMetaDto;
}
