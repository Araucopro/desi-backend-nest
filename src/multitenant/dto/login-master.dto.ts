import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginMasterDto {
  @ApiProperty({ example: 'soporte@araucopro.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Araucopro' })
  @IsString()
  @MinLength(6)
  password!: string;
}
