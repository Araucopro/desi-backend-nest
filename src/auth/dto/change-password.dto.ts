import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description:
      'Nueva contraseña del usuario autenticado. Mínimo 6 caracteres. ' +
      'El backend la hashea con bcrypt y nunca la devuelve en la respuesta.',
    example: 'NuevaClave123',
    minLength: 6,
    format: 'password',
    writeOnly: true,
  })
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
