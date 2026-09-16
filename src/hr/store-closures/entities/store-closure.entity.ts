import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from '../../../stores/entities/store.entity';

@Entity({ name: 'HrStoreClosure' })
@Index(['tenantID', 'storeID', 'startDate', 'endDate'])
export class StoreClosure {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({
    description: 'Identificador del cierre.',
    format: 'uuid',
    example: 'f3a8c0d1-7f20-4c1f-a1f2-9892d63e10a0',
  })
  id!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  storeID!: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @Column({ type: 'date' })
  @ApiProperty({
    description: 'Primer día cerrado, inclusive.',
    format: 'date',
    example: '2026-09-20',
  })
  startDate!: string;

  @Column({ type: 'date' })
  @ApiProperty({
    description: 'Último día cerrado, inclusive.',
    format: 'date',
    example: '2026-09-20',
  })
  endDate!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'Motivo del cierre.',
    example: 'Domingo no operativo',
  })
  reason!: string;

  @Column({ type: 'uuid', nullable: true })
  @ApiPropertyOptional({
    description: 'Usuario que creó el cierre.',
    format: 'uuid',
    nullable: true,
    example: '1ea834d6-6388-493d-aea5-61c3f2d708fd',
  })
  createdBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  @ApiPropertyOptional({
    description: 'Fecha de cancelación lógica. Null si el cierre sigue activo.',
    format: 'date-time',
    nullable: true,
    example: null,
  })
  cancelledAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  @ApiPropertyOptional({
    description: 'Usuario que canceló el cierre.',
    format: 'uuid',
    nullable: true,
    example: '1ea834d6-6388-493d-aea5-61c3f2d708fd',
  })
  cancelledBy!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiPropertyOptional({
    description: 'Motivo de la cancelación lógica.',
    nullable: true,
    example: null,
  })
  cancellationReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
