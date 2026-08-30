import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Permission } from './permission.entity';
import { Role } from './role.entity';

export enum PermissionScope {
  OWN = 'OWN',
  ALL = 'ALL',
}

@Entity({ name: 'role_permissions' })
@Index(['tenantID', 'roleID', 'permissionKey'], { unique: true })
export class RolePermission {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  @ApiProperty({ format: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  @ApiProperty({ format: 'uuid' })
  roleID!: string;

  @ManyToOne(() => Role, (role) => role.permissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([
    { name: 'tenantID', referencedColumnName: 'tenantID' },
    { name: 'roleID', referencedColumnName: 'id' },
  ])
  role!: Role;

  @Column({ type: 'varchar', length: 128 })
  @ApiProperty({ example: 'sales:read' })
  permissionKey!: string;

  @ManyToOne(() => Permission, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'permissionKey', referencedColumnName: 'key' })
  permission!: Permission;

  @Column({ type: 'enum', enum: PermissionScope })
  @ApiProperty({ enum: PermissionScope, example: PermissionScope.ALL })
  scope!: PermissionScope;
}
