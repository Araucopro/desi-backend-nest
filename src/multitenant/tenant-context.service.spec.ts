import {
  DEFAULT_TENANT_TIMEZONE,
  TenantContextService,
} from './tenant-context.service';

describe('TenantContextService', () => {
  let service: TenantContextService;
  const mockManager = {
    query: jest.fn().mockResolvedValue([]),
  };
  const mockDataSource = {
    transaction: jest.fn().mockImplementation(async (cb) => cb(mockManager)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantContextService(mockDataSource as any);
  });

  it('returns default timezone when no context is active', () => {
    expect(service.getTimeZone()).toBe(DEFAULT_TENANT_TIMEZONE);
  });

  it('returns custom timezone set in tenant context', () => {
    service.run(
      {
        tenantId: 'tenant-123',
        timeZone: 'America/Argentina/Buenos_Aires',
        impersonating: false,
      },
      () => {
        expect(service.getTenantId()).toBe('tenant-123');
        expect(service.getTimeZone()).toBe('America/Argentina/Buenos_Aires');
      },
    );
  });

  it('configures both app.tenant_id and timezone in postgres transaction', async () => {
    await service.run(
      {
        tenantId: 'tenant-123',
        timeZone: 'America/Santiago',
        impersonating: false,
      },
      async () => {
        const result = await service.transaction(async (manager) => {
          return 'done';
        });

        expect(result).toBe('done');
        expect(mockManager.query).toHaveBeenCalledWith(
          `SELECT set_config('app.tenant_id', $1, true)`,
          ['tenant-123'],
        );
        expect(mockManager.query).toHaveBeenCalledWith(
          `SELECT set_config('timezone', $1, true)`,
          ['America/Santiago'],
        );
      },
    );
  });
});
