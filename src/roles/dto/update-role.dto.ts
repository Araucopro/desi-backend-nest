import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({
    description: 'Nuevo nombre del rol personalizado.',
    example: 'Supervisor de ventas',
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;
}
