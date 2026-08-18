import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { UserRole, UserStatus } from '../entities/user.entity';

export class UserListItemDto {
  @ApiProperty({
    description: 'ID del usuario',
    example: 'user-uuid',
  })
  userID!: string;

  @ApiProperty({
    description: 'Correo del usuario',
    example: 'usuario@ejemplo.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Nombre del usuario',
    example: 'Juan Pérez',
  })
  name!: string;

  @ApiProperty({
    description: 'Rol del usuario',
    enum: UserRole,
  })
  role!: UserRole;

  @ApiPropertyOptional({
    description: 'URL de la imagen de perfil',
    nullable: true,
  })
  userImg?: string | null;

  @ApiProperty({
    description: 'Estado del usuario',
    enum: UserStatus,
  })
  status!: UserStatus;

  @ApiProperty({
    description: 'Fecha de creación en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Fecha de actualización en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  updatedAt!: Date;
}

export class UserListResponseDto {
  @ApiProperty({
    type: [UserListItemDto],
    description: 'Usuarios de la página',
  })
  users!: UserListItemDto[];

  @ApiProperty({
    type: PaginationMetaDto,
    description: 'Metadatos de paginación',
  })
  meta!: PaginationMetaDto;
}
