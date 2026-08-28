import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PermissionScope } from '../entities/role-permission.entity';

export class RolePermissionInputDto {
  @ApiProperty({
    description: 'Clave del permiso del catálogo global.',
    example: 'sales:read',
  })
  @IsString()
  @IsNotEmpty()
  permissionKey!: string;

  @ApiProperty({
    description:
      'Alcance del permiso. OWN limita el recurso al usuario propietario; ALL permite el universo del tenant.',
    enum: PermissionScope,
    example: PermissionScope.OWN,
  })
  @IsEnum(PermissionScope)
  scope!: PermissionScope;
}

export class UpdateRolePermissionsDto {
  @ApiProperty({
    description:
      'Reemplaza completamente los permisos del rol. No se permiten claves repetidas.',
    type: [RolePermissionInputDto],
    example: [
      { permissionKey: 'sales:read', scope: PermissionScope.OWN },
      { permissionKey: 'sales:write', scope: PermissionScope.OWN },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionInputDto)
  permissions!: RolePermissionInputDto[];
}
