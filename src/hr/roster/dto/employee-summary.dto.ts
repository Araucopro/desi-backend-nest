import { ApiProperty } from '@nestjs/swagger';

export class EmployeeSummaryDto {
  @ApiProperty({
    description: 'Identificador del trabajador.',
    format: 'uuid',
    example: '2a8c8a1d-4d30-46a3-9a17-c7d3a3cc40ab',
  })
  employeeID!: string;

  @ApiProperty({
    description: 'Nombre actual del trabajador.',
    example: 'María González',
  })
  name!: string;

  @ApiProperty({
    description: 'Nombre del rol/cargo actual.',
    example: 'store_manager',
  })
  role!: string;

  @ApiProperty({
    description: 'Fecha desde la que la asignación cuenta para el roster.',
    format: 'date',
    example: '2026-01-15',
  })
  effectiveFrom!: string;

  @ApiProperty({
    description:
      'Último día de la asignación, inclusive. Null si sigue vigente.',
    format: 'date',
    nullable: true,
    example: null,
  })
  effectiveTo!: string | null;
}
