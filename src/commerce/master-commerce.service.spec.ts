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
    const channelFindOne = jest.fn();
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Store
          ? { findOne: storeFindOne }
          : { findOne: channelFindOne },
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
    type MockManager = typeof manager;
    const tenantContext = {
      run: jest.fn((_context: unknown, callback: () => unknown) => callback()),
      transaction: jest.fn((callback: (manager: MockManager) => unknown) =>
        callback(manager),
      ),
    };
    const service = new MasterCommerceService(
      channels as never,
      tenants as never,
      tenantContext as never,
    );
    return { service, channels, storeFindOne, tenantContext, channelFindOne };
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
      salesEnabled: false,
      acceptTestPayments: false,
      requireProductPhoto: true,
    });
    expect(created.token).toMatch(/^[0-9a-f-]{36}\.[0-9a-f]{64}$/);
    expect(created).not.toHaveProperty('tokenHash');
    expect(tenantContext.run).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenantID }),
      expect.any(Function),
    );
  });

  it('creates a channel with optional photos only when explicitly requested', async () => {
    const { service } = setup();
    const result = await service.create(
      tenantID,
      { ...dto, requireProductPhoto: false },
      'master-1',
      MasterRole.SUPER_ADMIN,
    );
    expect(result.requireProductPhoto).toBe(false);
  });

  it('updates only the selected tenant/channel and preserves unrelated settings', async () => {
    const { service, channelFindOne } = setup();
    const row = {
      ...dto,
      channelID: 'channel-1',
      tenantID,
      active: true,
      salesEnabled: true,
      acceptTestPayments: false,
      requireProductPhoto: true,
    };
    channelFindOne.mockResolvedValue(row);
    const result = await service.update(
      tenantID,
      'channel-1',
      { requireProductPhoto: false },
      'master-1',
      MasterRole.SUPER_ADMIN,
    );
    expect(channelFindOne).toHaveBeenCalledWith({
      where: { channelID: 'channel-1', tenantID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(result).toMatchObject({
      requireProductPhoto: false,
      salesEnabled: true,
      acceptTestPayments: false,
    });
    const renamed = await service.update(
      tenantID,
      'channel-1',
      { name: 'New name' },
      'master-1',
      MasterRole.SUPER_ADMIN,
    );
    expect(renamed.requireProductPhoto).toBe(false);
    const restored = await service.update(
      tenantID,
      'channel-1',
      { requireProductPhoto: true },
      'master-1',
      MasterRole.SUPER_ADMIN,
    );
    expect(restored.requireProductPhoto).toBe(true);
  });

  it('rejects a photo-policy update by a support master before accessing channel data', async () => {
    const { service, channelFindOne } = setup();
    await expect(
      service.update(
        tenantID,
        'channel-1',
        { requireProductPhoto: false },
        'master-1',
        MasterRole.SUPPORT,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(channelFindOne).not.toHaveBeenCalled();
  });

  it('allows only a master super admin to assign channels', async () => {
    const { service, storeFindOne } = setup();
    await expect(
      service.create(tenantID, dto, 'master-1', MasterRole.SUPPORT),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storeFindOne).not.toHaveBeenCalled();
  });
});
