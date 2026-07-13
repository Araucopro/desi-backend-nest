import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/numeric.transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Store } from '../../stores/entities/store.entity';

export enum ExpenseType {
  FINANCIAL = 'financial',
  OPERATIONAL = 'operational',
  ADMINISTRATIVE = 'administrative',
}

@Entity({ name: 'Expense', schema: 'public' })
export class Expense {
  @ApiProperty({
    description: 'ID único del gasto',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Nombre o descripción del gasto',
    example: 'Servicios de limpieza',
  })
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @ApiProperty({
    description: 'Fecha del gasto para fines contables',
    example: '2023-10-27T10:00:00Z',
  })
  @Column({ type: 'timestamp with time zone', name: 'deductibleDate' })
  deductibleDate!: Date;

  @ApiProperty({
    description: 'Monto total del gasto',
    example: 250.75,
  })
  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount!: number;

  @ApiProperty({
    description: 'Categoría del gasto',
    enum: ExpenseType,
    example: ExpenseType.ADMINISTRATIVE,
  })
  @Column({
    type: 'enum',
    enum: ExpenseType,
  })
  type!: ExpenseType;

  @ManyToOne(() => Store, (store) => store.expenses)
  @JoinColumn({ name: 'storeID' })
  store!: Store;

  @ApiProperty({
    description: 'Fecha de creación del registro',
  })
  @CreateDateColumn({ type: 'timestamp with time zone', name: 'createdAt' })
  createdAt!: Date;

  @ApiProperty({
    description: 'Fecha de la última actualización',
  })
  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updatedAt' })
  updatedAt!: Date;
}
