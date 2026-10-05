import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { Role } from '../roles/entities/role.entity';
import { RolePermission } from '../roles/entities/role-permission.entity';
import { Store } from '../stores/entities/store.entity';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { User } from './entities/user.entity';
import {
  InventoryColumnPreference,
  InventoryColumnStoreFilter,
} from './entities/inventory-column-preference.entity';
import { InventoryColumnPreferencesService } from './inventory-column-preferences.service';

describe('InventoryColumnPreferencesService', () => {
  const tenantID = 'tenant-1';
  const userID = 'user-1';
  const storeID = 'store-1';
  const updatedAt = new Date('2026-10-02T15:30:00.000Z');

  let service: InventoryColumnPreferencesService;
  let manager: {
    getRepository: jest.Mock;
    query: jest.Mock;
  };
  let userRepository: { findOne: jest.Mock };
  let roleRepository: { findOne: jest.Mock };
  let storeRepository: { findOne: jest.Mock };
  let rolePermissionRepository: { findOne: jest.Mock };
  let userStoreRepository: { findOne: jest.Mock };
  let preferenceRepository: { findOne: jest.Mock };

  beforeEach(() => {
    userRepository = { findOne: jest.fn() };
    roleRepository = { findOne: jest.fn() };
    storeRepository = { findOne: jest.fn() };
    rolePermissionRepository = { findOne: jest.fn() };
    userStoreRepository = { findOne: jest.fn() };
    preferenceRepository = { findOne: jest.fn() };
    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) return userRepository;
        if (entity === Role) return roleRepository;
        if (entity === Store) return storeRepository;
        if (entity === RolePermission) return rolePermissionRepository;
        if (entity === UserStore) return userStoreRepository;
        if (entity === InventoryColumnPreference) return preferenceRepository;
        return undefined;
      }),
      query: jest.fn(),
    };

    const tenantContext = {
      getTenantId: jest.fn().mockReturnValue(tenantID),
      transaction: jest.fn((callback) =>
        callback(manager as unknown as EntityManager),
      ),
    };
    service = new InventoryColumnPreferencesService(
      { transaction: jest.fn() } as unknown as DataSource,
      tenantContext as unknown as TenantContextService,
    );

    userRepository.findOne.mockResolvedValue({ userID, roleID: 'role-1' });
    roleRepository.findOne.mockResolvedValue({
      id: 'role-1',
      systemKey: 'TENANT_ADMIN',
    });
    storeRepository.findOne.mockResolvedValue({ storeID });
  });

  it('returns exists=false when the context has no saved preference', async () => {
    preferenceRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getPreference(tenantID, userID, { storeID }),
    ).resolves.toEqual({ exists: false, hiddenColumns: [], updatedAt: null });
    expect(preferenceRepository.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({ tenantID, userID, storeID }),
    });
  });

  it('stores a deduplicated replacement and keeps an empty list as an existing preference', async () => {
    manager.query.mockResolvedValue([{ hiddenColumns: [], updatedAt }]);

    await expect(
      service.replacePreference(tenantID, userID, { storeID }, []),
    ).resolves.toEqual({ exists: true, hiddenColumns: [], updatedAt });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      [tenantID, userID, storeID, null, '[]'],
    );

    await service.replacePreference(tenantID, userID, { storeID }, [
      'supplierSku',
      'ean',
      'supplierSku',
    ]);
    expect(manager.query.mock.calls[1][1][4]).toBe('["supplierSku","ean"]');
  });

  it('rejects an inaccessible store for a non-admin user', async () => {
    roleRepository.findOne.mockResolvedValue({ id: 'role-1', systemKey: null });
    rolePermissionRepository.findOne.mockResolvedValue(null);
    userStoreRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getPreference(tenantID, userID, { storeID }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('restricts aggregate contexts to TENANT_ADMIN', async () => {
    roleRepository.findOne.mockResolvedValue({ id: 'role-1', systemKey: null });

    await expect(
      service.getPreference(tenantID, userID, {
        storeFilter: InventoryColumnStoreFilter.ALL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires exactly one preference context', async () => {
    await expect(
      service.getPreference(tenantID, userID, {
        storeID,
        storeFilter: InventoryColumnStoreFilter.ALL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getPreference(tenantID, userID, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
