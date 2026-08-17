export function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string } | null)?.code ??
    (error as { driverError?: { code?: string } } | null)?.driverError?.code;

  return code === '23505';
}
