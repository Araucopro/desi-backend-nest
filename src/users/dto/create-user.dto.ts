import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  MinLength,
} from 'class-validator';
import { UserRole, UserStatus } from '../entities/user.entity';

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
  @ValidateIf((dto) => !dto.roleID)
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({ description: 'ID del rol tenant asignado', required: false })
  @ValidateIf((dto) => !dto.role)
  @IsUUID()
  roleID?: string;

  @ApiProperty({
    description: 'Estado del usuario',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
    required: false,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

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
