import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estados de venta tras devoluciones y anulaciones.
 *
 * - Agrega 'ANULADA', 'DEVUELTA' y 'CORREGIDA' a Sale_status_enum para
 *   actualizar el estado de la venta al aprobar/completar una devolución.
 */
export class SaleStatusReturns20260831000000 implements MigrationInterface {
  name = 'SaleStatusReturns20260831000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "Sale_status_enum" ADD VALUE IF NOT EXISTS 'ANULADA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "Sale_status_enum" ADD VALUE IF NOT EXISTS 'DEVUELTA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "Sale_status_enum" ADD VALUE IF NOT EXISTS 'CORREGIDA'`,
    );
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Los valores de tipo ENUM en PostgreSQL no se eliminan fácilmente sin recrear el tipo,
    // por lo que en rollback se mantiene seguro sin acción destructiva.
  }
}
