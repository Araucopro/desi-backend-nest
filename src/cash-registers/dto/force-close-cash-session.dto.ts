import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Motivo del cierre forzado de una sesión huérfana.
 *
 * No acepta montos contados a propósito: quien fuerza el cierre de una sesión de
 * un día anterior normalmente no tiene la gaveta delante. El saldo esperado se
 * recalcula desde los movimientos y **no** se inventa un conteo, así que
 * `countedCashBalance` queda en `null` en la sesión sellada: la ausencia de
 * arqueo es visible en los reportes en vez de quedar disfrazada de conteo en
 * cero.
 */
export class ForceCloseCashSessionDto {
  @ApiProperty({
    description:
      'Motivo del cierre forzado. Queda registrado en las notas de cierre de la sesión junto con el usuario aprobador y la marca de tiempo.',
    example:
      'Sesión del 2026-09-22 sin cierre: cajero no registró el cierre de turno y la caja quedó bloqueada',
    minLength: 10,
    maxLength: 500,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
