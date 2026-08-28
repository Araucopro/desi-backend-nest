import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RolePermission } from './role-permission.entity';

@Entity({ name: 'roles' })
@Index(['tenantID', 'name'], { unique: true })
@Index(['tenantID', 'systemKey'], { unique: true })
@Index(['tenantID', 'id'], { unique: true })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({ format: 'uuid', description: 'Identificador del rol' })
  id!: string;

  @Column({ type: 'uuid' })
  @ApiProperty({ format: 'uuid', description: 'Tenant propietario del rol' })
  tenantID!: string;

  @Column({ type: 'varchar', length: 128 })
  @ApiProperty({ example: 'Vendedor' })
  name!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  @ApiPropertyOptional({
    description: 'Clave reservada para roles predefinidos del tenant.',
    enum: ['TENANT_ADMIN', 'STORE_MANAGER', 'CONSIGNADO', 'TERCERO', 'SYSTEM'],
    nullable: true,
  })
  systemKey!:
    | 'TENANT_ADMIN'
    | 'STORE_MANAGER'
    | 'CONSIGNADO'
    | 'TERCERO'
    | 'SYSTEM'
    | null;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Los roles system no pueden modificarse',
    example: false,
  })
  isSystem!: boolean;

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
  @ApiPropertyOptional({ type: () => [RolePermission] })
  permissions!: RolePermission[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
