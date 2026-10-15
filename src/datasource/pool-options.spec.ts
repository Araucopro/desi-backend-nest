import { runtimePoolOptions } from './pool-options';

describe('runtimePoolOptions', () => {
  it('bounds pool acquisition and queries without increasing the default pool', () => {
    const config = runtimePoolOptions({});
    expect(config.poolSize).toBe(10);
    expect(config.extra).toEqual({
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 30000,
      lock_timeout: 10000,
      idle_in_transaction_session_timeout: 60000,
      application_name: 'araucopro-api',
    });
  });
  it('accepts explicit runtime settings, including disabling server SQL timeouts', () => {
    const config = runtimePoolOptions({
      PG_POOL_MAX: '4',
      PG_CONNECTION_TIMEOUT_MS: '1500',
      PG_IDLE_TIMEOUT_MS: '10000',
      PG_STATEMENT_TIMEOUT_MS: '0',
      PG_LOCK_TIMEOUT_MS: '0',
      PG_IDLE_TRANSACTION_TIMEOUT_MS: '0',
      PG_APP_NAME: 'erp-dev',
    });
    expect(config.poolSize).toBe(4);
    expect(config.extra).toEqual({
      max: 4,
      connectionTimeoutMillis: 1500,
      idleTimeoutMillis: 10000,
      statement_timeout: 0,
      lock_timeout: 0,
      idle_in_transaction_session_timeout: 0,
      application_name: 'erp-dev',
    });
  });
  it.each(['0', '-1', '1.5', 'Infinity', 'invalid'])(
    'rejects an invalid pool size: %s',
    (value) => {
      expect(() => runtimePoolOptions({ PG_POOL_MAX: value })).toThrow(
        'PG_POOL_MAX',
      );
    },
  );
  it('rejects unbounded connection waits and negative SQL timeouts', () => {
    expect(() => runtimePoolOptions({ PG_CONNECTION_TIMEOUT_MS: '0' })).toThrow(
      'PG_CONNECTION_TIMEOUT_MS',
    );
    expect(() => runtimePoolOptions({ PG_STATEMENT_TIMEOUT_MS: '-1' })).toThrow(
      'PG_STATEMENT_TIMEOUT_MS',
    );
  });
});
