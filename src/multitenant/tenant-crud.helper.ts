import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { TenantContextService } from './tenant-context.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { QueryTenantsDto } from './dto/query-tenants.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { Store } from '../stores/entities/store.entity';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Category } from '../categories/entities/category.entity';

function generateSlugBase(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tenant'
  );
}

async function generateUniqueSlug(
  tenants: Repository<Tenant>,
  baseText: string,
): Promise<string> {
  const baseSlug = generateSlugBase(baseText);
  let candidate = baseSlug;
  let counter = 1;

  while (await tenants.exists({ where: { slug: candidate } })) {
    counter++;
    candidate = `${baseSlug}-${counter}`;
  }

  return candidate;
}

export async function getTenantUsersAndStores(
  tenantContext: TenantContextService,
  tenantID: string,
) {
  return tenantContext.run({ tenantId: tenantID, impersonating: false }, () =>
    tenantContext.transaction(async (manager) => {
      const users = await manager.find(User, {
        where: { tenantID },
        select: [
          'userID',
          'tenantID',
          'email',
          'name',
          'role',
          'userImg',
          'sessionVersion',
          'createdAt',
          'updatedAt',
        ],
      });
      const stores = await manager.find(Store, {
        where: { tenantID },
      });
      return { users, stores };
    }),
  );
}

export async function createTenant(
  tenants: Repository<Tenant>,
  dto: CreateTenantDto,
) {
  const slug = await generateUniqueSlug(tenants, dto.name);

  const tenant = tenants.create({
    name: dto.name,
    slug,
    status: dto.status ?? TenantStatus.ACTIVE,
    maxStores: dto.maxStores ?? 5,
    maxUsers: dto.maxUsers ?? 5,
    timeZone: dto.timeZone ?? 'America/Santiago',
    locale: dto.locale ?? 'es-CL',
  });

  return tenants.save(tenant);
}

export async function findAllTenants(
  tenants: Repository<Tenant>,
  tenantContext: TenantContextService,
  query: QueryTenantsDto,
) {
  const { limit = 10, offset = 0, status, search } = query;

  const queryBuilder = tenants.createQueryBuilder('tenant');

  if (status) {
    queryBuilder.andWhere('tenant.status = :status', { status });
  }

  if (search) {
    queryBuilder.andWhere(
      '(tenant.name ILIKE :search OR tenant.slug ILIKE :search)',
      { search: `%${search}%` },
    );
  }

  queryBuilder.orderBy('tenant.createdAt', 'DESC').take(limit).skip(offset);

  const [tenantsList, total] = await queryBuilder.getManyAndCount();

  const items = await Promise.all(
    tenantsList.map(async (tenant) => {
      const { users, stores } = await getTenantUsersAndStores(
        tenantContext,
        tenant.tenantID,
      );
      return {
        ...tenant,
        users,
        stores,
      };
    }),
  );

  return {
    items,
    total,
    limit,
    offset,
  };
}

export async function findTenantById(
  tenants: Repository<Tenant>,
  tenantContext: TenantContextService,
  tenantID: string,
) {
  const tenant = await tenants.findOne({ where: { tenantID } });
  if (!tenant) throw new NotFoundException('Tenant not found');

  const { users, stores } = await getTenantUsersAndStores(
    tenantContext,
    tenantID,
  );

  return {
    ...tenant,
    users,
    stores,
  };
}

export async function updateTenant(
  tenants: Repository<Tenant>,
  audit: Repository<AuditEvent>,
  tenantID: string,
  dto: UpdateTenantDto,
  masterUserID: string,
) {
  const tenant = await tenants.findOne({ where: { tenantID } });
  if (!tenant) throw new NotFoundException('Tenant not found');

  if (dto.name !== undefined) tenant.name = dto.name;
  if (dto.status !== undefined) tenant.status = dto.status;
  if (dto.maxStores !== undefined) tenant.maxStores = dto.maxStores;
  if (dto.maxUsers !== undefined) tenant.maxUsers = dto.maxUsers;
  if (dto.timeZone !== undefined) tenant.timeZone = dto.timeZone;
  if (dto.locale !== undefined) tenant.locale = dto.locale;

  const updatedTenant = await tenants.save(tenant);

  await audit.save(
    audit.create({
      tenantID,
      masterUserID,
      action: 'UPDATE_TENANT',
      endpoint: 'master/tenants',
      result: 'SUCCESS',
      reason: 'Master tenant update',
    }),
  );

  return updatedTenant;
}

export async function setStatus(
  tenants: Repository<Tenant>,
  audit: Repository<AuditEvent>,
  tenantID: string,
  status: TenantStatus,
  masterUserID: string,
) {
  const tenant = await tenants.findOne({ where: { tenantID } });
  if (!tenant) throw new NotFoundException('Tenant not found');
  tenant.status = status;
  const result = await tenants.save(tenant);
  await audit.save(
    audit.create({
      tenantID,
      masterUserID,
      action: 'STATUS',
      endpoint: 'master/tenants',
      result: status,
      reason: 'master status change',
    }),
  );
  return result;
}

export async function getTenantMetrics(
  tenants: Repository<Tenant>,
  tenantContext: TenantContextService,
  tenantID: string,
) {
  const tenant = await tenants.findOne({ where: { tenantID } });
  if (!tenant) throw new NotFoundException('Tenant not found');

  return tenantContext.run({ tenantId: tenantID, impersonating: false }, () =>
    tenantContext.transaction(async (manager) => {
      const storesCount = await manager.count(Store, {
        where: { tenantID },
      });
      const usersCount = await manager.count(User, { where: { tenantID } });
      const productsCount = await manager.count(Product, {
        where: { tenantID },
      });

      const storesUsagePct = Math.round((storesCount / tenant.maxStores) * 100);
      const usersUsagePct = Math.round((usersCount / tenant.maxUsers) * 100);
      const warningThresholdReached =
        storesUsagePct >= 80 || usersUsagePct >= 80;

      const now = new Date();
      const daysRemaining = tenant.subscriptionExpiresAt
        ? Math.max(
            0,
            Math.ceil(
              (new Date(tenant.subscriptionExpiresAt).getTime() -
                now.getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : null;

      return {
        tenantID: tenant.tenantID,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        usage: {
          storesCount,
          maxStores: tenant.maxStores,
          storesUsagePct,
          usersCount,
          maxUsers: tenant.maxUsers,
          usersUsagePct,
          warningThresholdReached,
        },
        activity: {
          productsCount,
        },
        subscription: {
          planType: tenant.planType,
          expiresAt: tenant.subscriptionExpiresAt,
          daysRemaining,
          autoRenew: tenant.autoRenew,
        },
      };
    }),
  );
}

export async function updateSubscription(
  tenants: Repository<Tenant>,
  audit: Repository<AuditEvent>,
  tenantID: string,
  dto: UpdateSubscriptionDto,
  masterUserID: string,
) {
  const tenant = await tenants.findOne({ where: { tenantID } });
  if (!tenant) throw new NotFoundException('Tenant not found');

  if (dto.planType !== undefined) tenant.planType = dto.planType;
  if (dto.subscriptionExpiresAt !== undefined) {
    tenant.subscriptionExpiresAt = new Date(dto.subscriptionExpiresAt);
  }
  if (dto.autoRenew !== undefined) tenant.autoRenew = dto.autoRenew;

  const result = await tenants.save(tenant);
  await audit.save(
    audit.create({
      tenantID,
      masterUserID,
      action: 'UPDATE_SUBSCRIPTION',
      endpoint: 'master/tenants/subscription',
      result: 'SUCCESS',
      reason: `Subscription updated to plan ${tenant.planType}`,
    }),
  );

  return result;
}

export async function exportTenantData(
  tenants: Repository<Tenant>,
  tenantContext: TenantContextService,
  tenantID: string,
) {
  const tenant = await tenants.findOne({ where: { tenantID } });
  if (!tenant) throw new NotFoundException('Tenant not found');

  return tenantContext.run({ tenantId: tenantID, impersonating: false }, () =>
    tenantContext.transaction(async (manager) => {
      const stores = await manager.find(Store, { where: { tenantID } });
      const users = await manager.find(User, { where: { tenantID } });
      const categories = await manager.find(Category, {
        where: { tenantID },
      });
      const products = await manager.find(Product, { where: { tenantID } });

      return {
        exportedAt: new Date().toISOString(),
        tenant,
        data: {
          stores,
          users,
          categories,
          products,
        },
      };
    }),
  );
}
