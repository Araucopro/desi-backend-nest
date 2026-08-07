import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, MinLength } from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Nombre completo del usuario',
    example: 'Ana Torres',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Rol asignado al usuario',
    enum: UserRole,
    example: UserRole.STORE_MANAGER,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'URL de la imagen de perfil del usuario',
    example: 'https://ejemplo.com/usuario.png',
  })
  @IsOptional()
  @IsString()
  userImg?: string;

  @ApiPropertyOptional({
    description: 'Nueva contraseña del usuario. Mínimo 6 caracteres.',
    example: 'nuevaContraseña123',
    minLength: 6,
  })
  @IsOptional()
  @MinLength(6)
  password?: string;
}
