function integer(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min = 1,
): number {
  const value = env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new Error(name + ' must be an integer >= ' + min);
  }
  return parsed;
}

/** Runtime only: migration sessions keep their separate datasource settings. */
export function runtimePoolOptions(env: NodeJS.ProcessEnv = process.env) {
  const max = integer(env, 'PG_POOL_MAX', 10);
  return {
    poolSize: max,
    extra: {
      max,
      connectionTimeoutMillis: integer(env, 'PG_CONNECTION_TIMEOUT_MS', 5000),
      idleTimeoutMillis: integer(env, 'PG_IDLE_TIMEOUT_MS', 30000),
      statement_timeout: integer(env, 'PG_STATEMENT_TIMEOUT_MS', 30000, 0),
      lock_timeout: integer(env, 'PG_LOCK_TIMEOUT_MS', 10000, 0),
      idle_in_transaction_session_timeout: integer(
        env,
        'PG_IDLE_TRANSACTION_TIMEOUT_MS',
        60000,
        0,
      ),
      application_name: env.PG_APP_NAME?.trim() || 'araucopro-api',
    },
  };
}
