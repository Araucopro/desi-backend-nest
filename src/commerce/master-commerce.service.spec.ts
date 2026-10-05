import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MasterRole } from '../multitenant/entities/master-user.entity';
import { TenantStatus } from '../multitenant/entities/tenant.entity';
import { Store } from '../stores/entities/store.entity';
import { MasterCommerceService } from './master-commerce.service';

describe('MasterCommerceService provisioning', () => {
  const tenantID = '5323b94c-bea8-40fd-aac4-efdb6efcd75c';
  const storeID = 'ad191d2e-934b-4ec7-9792-c91a758d7336';
  const dto = {
    code: 'DESI_WEB',
    name: 'desi.cl',
    storeID,
    domain: 'www.desi.cl',
  };

  function setup(storeBelongsToTenant = true) {
    const storeFindOne = jest
      .fn()
      .mockResolvedValue(storeBelongsToTenant ? { storeID, tenantID } : null);
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Store ? { findOne: storeFindOne } : { findOne: jest.fn() },
      ),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest.fn(
        async (entityOrValue: unknown, maybeValue?: unknown) =>
          maybeValue ?? entityOrValue,
      ),
    };
    const channels = { find: jest.fn().mockResolvedValue([]) };
    const tenants = {
      findOne: jest.fn().mockResolvedValue({
        tenantID,
        status: TenantStatus.ACTIVE,
        timeZone: 'America/Santiago',
      }),
    };
    const tenantContext = {
      run: jest.fn((_context: unknown, callback: () => unknown) => callback()),
      transaction: jest.fn((callback: (manager: typeof manager) => unknown) =>
        callback(manager),
      ),
    };
    const service = new MasterCommerceService(
      channels as never,
      tenants as never,
      tenantContext as never,
    );
    return { service, channels, storeFindOne, tenantContext };
  }

  it('leaves tenants with no channel unchanged', async () => {
    const { service, channels } = setup();
    await expect(service.list(tenantID)).resolves.toEqual([]);
    expect(channels.find).toHaveBeenCalledWith({
      where: { tenantID },
      order: { createdAt: 'ASC' },
    });
  });

  it('rejects a store from another tenant', async () => {
    const { service, storeFindOne } = setup(false);
    await expect(
      service.create(tenantID, dto, 'master-1', MasterRole.SUPER_ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storeFindOne).toHaveBeenCalledWith({ where: { storeID, tenantID } });
  });

  it('issues one credential bound to the chosen tenant and store', async () => {
    const { service, tenantContext } = setup();
    const created = await service.create(
      tenantID,
      dto,
      'master-1',
      MasterRole.SUPER_ADMIN,
    );
    expect(created).toMatchObject({
      tenantID,
      storeID,
      code: 'DESI_WEB',
      active: true,
    });
    expect(created.token).toMatch(/^[0-9a-f-]{36}\.[0-9a-f]{64}$/);
    expect(created).not.toHaveProperty('tokenHash');
    expect(tenantContext.run).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenantID }),
      expect.any(Function),
    );
  });

  it('allows only a master super admin to assign channels', async () => {
    const { service, storeFindOne } = setup();
    await expect(
      service.create(tenantID, dto, 'master-1', MasterRole.SUPPORT),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storeFindOne).not.toHaveBeenCalled();
  });
});
