import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { TenantContextService } from './tenant-context.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { CreateStoreDto } from '../stores/dto/create-store.dto';
import { UpdateStoreDto } from '../stores/dto/update-store.dto';
import { Store } from '../stores/entities/store.entity';
import { User } from '../users/entities/user.entity';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { Category } from '../categories/entities/category.entity';

export async function provisionTenant(
  tenants: Repository<Tenant>,
  tenantContext: TenantContextService,
  tenantID: string,
  dto: ProvisionTenantDto,
  masterUserID: string,
) {
  const tenant = await tenants.findOne({ where: { tenantID } });
  if (!tenant) throw new NotFoundException('Tenant not found');
  if (tenant.status === TenantStatus.ACTIVE) {
    throw new ConflictException('Tenant is already active and provisioned');
  }

  const passwordHash = await bcrypt.hash(dto.user.password, 10);

  return tenantContext.run(
    { tenantId: tenantID, masterUserId: masterUserID, impersonating: false },
    () =>
      tenantContext.transaction(async (manager) => {
        const store = manager.create(Store, {
          ...dto.store,
          tenantID,
        });
        const savedStore = await manager.save(Store, store);

        const user = manager.create(User, {
          tenantID,
          email: dto.user.email,
          name: dto.user.name,
          password: passwordHash,
          role: dto.user.role,
          userImg: dto.user.userImg ?? null,
          sessionVersion: 1,
        });
        const savedUser = await manager.save(User, user);

        const userStore = manager.create(UserStore, {
          tenantID,
          user: savedUser,
          store: savedStore,
        });
        await manager.save(UserStore, userStore);

        const defaultCategory = manager.create(Category, {
          tenantID,
          name: 'General',
        });
        await manager.save(Category, defaultCategory);

        tenant.status = TenantStatus.ACTIVE;
        await manager.save(Tenant, tenant);

        await manager.save(
          AuditEvent,
          manager.create(AuditEvent, {
            tenantID,
            masterUserID,
            action: 'PROVISION_TENANT',
            endpoint: 'master/tenants/provision',
            result: 'SUCCESS',
            reason: 'Initial onboarding completed',
          }),
        );

        return {
          message: 'Tenant provisioned successfully',
          tenantID: tenant.tenantID,
          centralStoreID: savedStore.storeID,
          adminUserID: savedUser.userID,
          status: tenant.status,
        };
      }),
  );
}

export async function createTenantUser(
  tenantContext: TenantContextService,
  tenantID: string,
  dto: CreateUserDto,
  masterUserID: string,
): Promise<User> {
  const passwordHash = await bcrypt.hash(dto.password, 10);

  return tenantContext.run(
    { tenantId: tenantID, masterUserId: masterUserID, impersonating: false },
    () =>
      tenantContext.transaction(async (manager) => {
        const tenant = await manager.getRepository(Tenant).findOne({
          where: { tenantID },
          lock: { mode: 'pessimistic_write' },
        });
        if (!tenant) throw new NotFoundException('Tenant not found');
        if (tenant.status !== TenantStatus.ACTIVE)
          throw new ConflictException('Tenant is not active');

        const userRepository = manager.getRepository(User);
        const userCount = await userRepository.count({
          where: { tenantID },
        });
        if (userCount >= tenant.maxUsers)
          throw new ForbiddenException(
            `Tenant user limit (${tenant.maxUsers}) exceeded`,
          );

        let savedUser: User;
        try {
          savedUser = await userRepository.save(
            userRepository.create({
              ...dto,
              tenantID,
              password: passwordHash,
              sessionVersion: 1,
            }),
          );
        } catch (error) {
          if (isUniqueViolation(error))
            throw new ConflictException(
              `User with email ${dto.email} already exists`,
            );
          throw error;
        }

        await manager.save(
          AuditEvent,
          manager.create(AuditEvent, {
            tenantID,
            masterUserID,
            action: 'CREATE_USER',
            endpoint: 'master/tenants/:tenantId/users',
            result: 'SUCCESS',
            reason: `Master created user ${savedUser.email}`,
          }),
        );

        return savedUser;
      }),
  );
}

export async function updateTenantUser(
  tenantContext: TenantContextService,
  tenantID: string,
  userID: string,
  dto: UpdateUserDto,
  masterUserID: string,
): Promise<User> {
  return tenantContext.run(
    { tenantId: tenantID, masterUserId: masterUserID, impersonating: false },
    () =>
      tenantContext.transaction(async (manager) => {
        const user = await manager.getRepository(User).findOne({
          where: { userID, tenantID },
        });
        if (!user) throw new NotFoundException('User not found');

        const updates = { ...dto };
        if (updates.password) {
          updates.password = await bcrypt.hash(updates.password, 10);
        }
        Object.assign(user, updates);

        const savedUser = await manager.getRepository(User).save(user);

        await manager.save(
          AuditEvent,
          manager.create(AuditEvent, {
            tenantID,
            masterUserID,
            action: 'UPDATE_USER',
            endpoint: 'master/tenants/:tenantId/users/:userId',
            result: 'SUCCESS',
            reason: `Master updated user ${savedUser.email}`,
          }),
        );

        return savedUser;
      }),
  );
}

export async function createTenantStore(
  tenantContext: TenantContextService,
  tenantID: string,
  dto: CreateStoreDto,
  masterUserID: string,
): Promise<Store> {
  return tenantContext.run(
    { tenantId: tenantID, masterUserId: masterUserID, impersonating: false },
    () =>
      tenantContext.transaction(async (manager) => {
        const tenant = await manager.getRepository(Tenant).findOne({
          where: { tenantID },
          lock: { mode: 'pessimistic_write' },
        });
        if (!tenant) throw new NotFoundException('Tenant not found');
        if (tenant.status !== TenantStatus.ACTIVE)
          throw new ConflictException('Tenant is not active');

        const storeRepository = manager.getRepository(Store);
        const storeCount = await storeRepository.count({
          where: { tenantID },
        });
        if (storeCount >= tenant.maxStores)
          throw new ForbiddenException(
            `Tenant store limit (${tenant.maxStores}) exceeded`,
          );

        let savedStore: Store;
        try {
          savedStore = await storeRepository.save(
            storeRepository.create({
              ...dto,
              tenantID,
            }),
          );
        } catch (error) {
          if (isUniqueViolation(error))
            throw new ConflictException(
              `Store with email ${dto.email} or name ${dto.name} already exists`,
            );
          throw error;
        }

        await manager.save(
          AuditEvent,
          manager.create(AuditEvent, {
            tenantID,
            masterUserID,
            action: 'CREATE_STORE',
            endpoint: 'master/tenants/:tenantId/stores',
            result: 'SUCCESS',
            reason: `Master created store ${savedStore.name}`,
          }),
        );

        return savedStore;
      }),
  );
}

export async function updateTenantStore(
  tenantContext: TenantContextService,
  tenantID: string,
  storeID: string,
  dto: UpdateStoreDto,
  masterUserID: string,
): Promise<Store> {
  return tenantContext.run(
    { tenantId: tenantID, masterUserId: masterUserID, impersonating: false },
    () =>
      tenantContext.transaction(async (manager) => {
        const storeRepository = manager.getRepository(Store);
        const store = await storeRepository.findOne({
          where: { storeID, tenantID },
        });
        if (!store) throw new NotFoundException('Store not found');

        if (
          dto.email !== undefined &&
          dto.email !== store.email &&
          (await storeRepository.exists({
            where: { email: dto.email, tenantID },
          }))
        ) {
          throw new ConflictException(
            `Store with email ${dto.email} already exists`,
          );
        }

        if (
          dto.name !== undefined &&
          dto.name !== store.name &&
          (await storeRepository.exists({
            where: { name: dto.name, tenantID },
          }))
        ) {
          throw new ConflictException(
            `Store with name ${dto.name} already exists`,
          );
        }

        Object.assign(store, dto);

        let savedStore: Store;
        try {
          savedStore = await storeRepository.save(store);
        } catch (error) {
          if (isUniqueViolation(error))
            throw new ConflictException(
              'Store with email or name already exists',
            );
          throw error;
        }

        await manager.save(
          AuditEvent,
          manager.create(AuditEvent, {
            tenantID,
            masterUserID,
            action: 'UPDATE_STORE',
            endpoint: 'master/tenants/:tenantId/stores/:storeId',
            result: 'SUCCESS',
            reason: `Master updated store ${savedStore.name}`,
          }),
        );

        return savedStore;
      }),
  );
}
