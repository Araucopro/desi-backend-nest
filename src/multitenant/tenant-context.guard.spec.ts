import { ForbiddenException } from '@nestjs/common';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { TenantContextGuard } from './tenant-context.guard';

describe('TenantContextGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  };

  function createGuard(tenant: Tenant | null) {
    const tenantsRepo = {
      findOne: jest.fn().mockResolvedValue(tenant),
      save: jest.fn().mockResolvedValue(tenant),
    };
    const guard = new TenantContextGuard(reflector as any, tenantsRepo as any);
    return { guard, tenantsRepo };
  }

  function createContext(request: Record<string, unknown>) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;
  }

  const activeTenant = {
    tenantID: 'tenant-1',
    status: TenantStatus.ACTIVE,
    subscriptionExpiresAt: null,
  } as Tenant;

  it('accepts a tenant token with tenantId', async () => {
    const { guard, tenantsRepo } = createGuard(activeTenant);
    const context = createContext({
      headers: {},
      user: { type: 'tenant', tenantId: 'tenant-1' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tenantsRepo.findOne).toHaveBeenCalledWith({
      where: { tenantID: 'tenant-1' },
    });
  });

  it('accepts a master impersonation token using impersonatingTenantId', async () => {
    const { guard, tenantsRepo } = createGuard(activeTenant);
    const context = createContext({
      headers: {},
      user: {
        type: 'master',
        masterUserId: 'master-1',
        role: 'SUPPORT',
        impersonatingTenantId: 'tenant-1',
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tenantsRepo.findOne).toHaveBeenCalledWith({
      where: { tenantID: 'tenant-1' },
    });
  });

  it('rejects when no tenant context is present in the token', async () => {
    const { guard } = createGuard(activeTenant);
    const context = createContext({
      headers: {},
      user: { type: 'tenant', email: 'user@example.com' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when the tenant does not exist', async () => {
    const { guard } = createGuard(null);
    const context = createContext({
      headers: {},
      user: { type: 'tenant', tenantId: 'missing-tenant' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when the tenant is not active', async () => {
    const { guard } = createGuard({
      tenantID: 'tenant-1',
      status: TenantStatus.SUSPENDED,
      subscriptionExpiresAt: null,
    } as Tenant);
    const context = createContext({
      headers: {},
      user: { type: 'tenant', tenantId: 'tenant-1' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
