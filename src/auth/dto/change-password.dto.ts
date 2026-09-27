import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Nueva contraseña del usuario. Mínimo 6 caracteres.',
    example: 'nuevaContraseña123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
