import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'permissions' })
export class Permission {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  @ApiProperty({
    description: 'Clave global e inmutable del permiso',
    example: 'sales:read',
  })
  key!: string;

  @Column({ type: 'varchar', length: 64 })
  @ApiProperty({ example: 'Sale' })
  subject!: string;

  @Column({ type: 'varchar', length: 64 })
  @ApiProperty({ example: 'read' })
  action!: string;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Indica si el permiso admite scope OWN',
    example: true,
  })
  supportsOwnScope!: boolean;

  @Column({ type: 'varchar', length: 255 })
  @ApiProperty({ example: 'Ver ventas' })
  description!: string;
}
