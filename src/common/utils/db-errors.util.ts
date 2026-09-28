/**
 * Extrae el `code` de un error de driver PostgreSQL. TypeORM envuelve el error
 * original en `driverError`, por lo que el código puede estar en cualquiera de
 * los dos niveles.
 */
export function resolveDbErrorCode(error: unknown): string | undefined {
  return (
    (error as { code?: string } | null)?.code ??
    (error as { driverError?: { code?: string } } | null)?.driverError?.code
  );
}

/**
 * Nombre del constraint o índice que provocó la violación de integridad
 * (`driverError.constraint`). Es la pieza que permite distinguir qué invariante
 * se rompió cuando dos `catch` distintos comparten el mismo código `23505`.
 */
export function resolveDbConstraint(error: unknown): string | undefined {
  return (error as { driverError?: { constraint?: string } } | null)
    ?.driverError?.constraint;
}

export function isUniqueViolation(error: unknown): boolean {
  return resolveDbErrorCode(error) === '23505';
}
