import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @ApiProperty({
    description: 'El correo electrónico del usuario. Debe ser único.',
    example: 'usuario@ejemplo.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'El nombre completo del usuario.',
    example: 'Juan Pérez',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'El rol asignado al usuario.',
    enum: UserRole,
    example: UserRole.STORE_MANAGER,
  })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({
    description: 'URL de la imagen de perfil del usuario (opcional).',
    example: 'https://ejemplo.com/imagen.png',
    required: false,
  })
  @IsOptional()
  @IsString()
  userImg?: string;

  @ApiProperty({
    description:
      'La contraseña para la cuenta del usuario. Mínimo 8 caracteres.',
    example: 'contraseñaSegura123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
