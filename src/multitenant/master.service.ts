import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { MasterUser, MasterRole } from './entities/master-user.entity';
import { LoginMasterDto } from './dto/login-master.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { QueryTenantsDto } from './dto/query-tenants.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantContextService } from './tenant-context.service';
import { Store, StoreType } from '../stores/entities/store.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { Category } from '../categories/entities/category.entity';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class MasterService implements OnModuleInit {
  private readonly logger = new Logger(MasterService.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(MasterUser)
    private readonly masterUsers: Repository<MasterUser>,
    @InjectRepository(AuditEvent)
    private readonly audit: Repository<AuditEvent>,
    private readonly jwt: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async onModuleInit() {
    await this.ensureMasterUserBootstrap();
  }

  private async ensureMasterUserBootstrap() {
    try {
      const count = await this.masterUsers.count();
      if (count === 0) {
        const defaultEmail = this.configService.get<string>(
          'MASTER_ADMIN_EMAIL',
          'soporte@araucopro.com',
        );
        const defaultPassword = this.configService.get<string>(
          'MASTER_ADMIN_PASSWORD',
          '@Araucopro1',
        );
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        await this.masterUsers.save(
          this.masterUsers.create({
            email: defaultEmail,
            password: passwordHash,
            role: MasterRole.SUPER_ADMIN,
            sessionVersion: 1,
          }),
        );
        this.logger.log(
          `Default MASTER user bootstrapped with email: ${defaultEmail}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Master user bootstrap check skipped or postponed: ${(error as Error).message}`,
      );
    }
  }

  async loginMaster(dto: LoginMasterDto) {
    const masterUser = await this.masterUsers.findOne({
      where: { email: dto.email },
    });
    if (!masterUser)
      throw new UnauthorizedException('Invalid master credentials');

    const isMatch = await bcrypt.compare(dto.password, masterUser.password);
    if (!isMatch) throw new UnauthorizedException('Invalid master credentials');

    const accessToken = await this.jwt.signAsync({
      type: 'master',
      masterUserId: masterUser.masterUserID,
      role: masterUser.role,
      sessionVersion: masterUser.sessionVersion,
    });

    return {
      masterUser: {
        masterUserID: masterUser.masterUserID,
        email: masterUser.email,
        role: masterUser.role,
      },
      accessToken,
    };
  }

  private generateSlugBase(text: string): string {
    return (
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'tenant'
    );
  }

  private async generateUniqueSlug(baseText: string): Promise<string> {
    const baseSlug = this.generateSlugBase(baseText);
    let candidate = baseSlug;
    let counter = 1;

    while (await this.tenants.exists({ where: { slug: candidate } })) {
      counter++;
      candidate = `${baseSlug}-${counter}`;
    }

    return candidate;
  }

  async createTenant(dto: CreateTenantDto) {
    const slug = await this.generateUniqueSlug(dto.name);

    const tenant = this.tenants.create({
      name: dto.name,
      slug,
      status: dto.status ?? TenantStatus.ACTIVE,
      maxStores: dto.maxStores ?? 5,
      maxUsers: dto.maxUsers ?? 5,
      timeZone: dto.timeZone ?? 'America/Santiago',
      locale: dto.locale ?? 'es-CL',
    });

    return this.tenants.save(tenant);
  }

  async findAllTenants(query: QueryTenantsDto) {
    const { limit = 10, offset = 0, status, search } = query;

    const queryBuilder = this.tenants.createQueryBuilder('tenant');

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

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async findTenantById(tenantID: string) {
    const tenant = await this.tenants.findOne({ where: { tenantID } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async updateTenant(
    tenantID: string,
    dto: UpdateTenantDto,
    masterUserID: string,
  ) {
    const tenant = await this.tenants.findOne({ where: { tenantID } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.status !== undefined) tenant.status = dto.status;
    if (dto.maxStores !== undefined) tenant.maxStores = dto.maxStores;
    if (dto.maxUsers !== undefined) tenant.maxUsers = dto.maxUsers;
    if (dto.timeZone !== undefined) tenant.timeZone = dto.timeZone;
    if (dto.locale !== undefined) tenant.locale = dto.locale;

    const updatedTenant = await this.tenants.save(tenant);

    await this.audit.save(
      this.audit.create({
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

  async setStatus(
    tenantID: string,
    status: TenantStatus,
    masterUserID: string,
  ) {
    const tenant = await this.tenants.findOne({ where: { tenantID } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    tenant.status = status;
    const result = await this.tenants.save(tenant);
    await this.audit.save(
      this.audit.create({
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

  async impersonate(tenantID: string, masterUserID: string, reason?: string) {
    const tenant = await this.tenants.findOne({
      where: { tenantID, status: TenantStatus.ACTIVE },
    });
    if (!tenant) throw new NotFoundException('Tenant not found or inactive');
    await this.audit.save(
      this.audit.create({
        tenantID,
        masterUserID,
        action: 'IMPERSONATE',
        endpoint: 'master/impersonate',
        result: 'ISSUED',
        reason: reason ?? 'N/A',
      }),
    );
    return this.jwt.signAsync({
      type: 'master',
      masterUserId: masterUserID,
      role: 'SUPPORT',
      sessionVersion: 1,
      impersonatingTenantId: tenantID,
      impersonatedBy: masterUserID,
    });
  }

  async provisionTenant(
    tenantID: string,
    dto: ProvisionTenantDto,
    masterUserID: string,
  ) {
    const tenant = await this.tenants.findOne({ where: { tenantID } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.status === TenantStatus.ACTIVE) {
      throw new ConflictException('Tenant is already active and provisioned');
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    return this.tenantContext.run(
      { tenantId: tenantID, masterUserId: masterUserID, impersonating: false },
      () =>
        this.tenantContext.transaction(async (manager) => {
          const store = manager.create(Store, {
            tenantID,
            name: dto.centralStoreName,
            location: dto.centralStoreName,
            address: dto.centralStoreAddress ?? 'Dirección Matriz',
            rut: '11111111-1',
            phone: '+56900000000',
            city: 'Santiago',
            email: `central@${tenant.slug}.com`,
            type: StoreType.CENTRAL,
            isCentralStore: true,
          });
          const savedStore = await manager.save(Store, store);

          const user = manager.create(User, {
            tenantID,
            email: dto.adminEmail,
            name: `${dto.adminFirstName} ${dto.adminLastName}`,
            password: passwordHash,
            role: UserRole.ADMIN,
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

  async getTenantMetrics(tenantID: string) {
    const tenant = await this.tenants.findOne({ where: { tenantID } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.tenantContext.run(
      { tenantId: tenantID, impersonating: false },
      () =>
        this.tenantContext.transaction(async (manager) => {
          const storesCount = await manager.count(Store, {
            where: { tenantID },
          });
          const usersCount = await manager.count(User, { where: { tenantID } });
          const productsCount = await manager.count(Product, {
            where: { tenantID },
          });

          const storesUsagePct = Math.round(
            (storesCount / tenant.maxStores) * 100,
          );
          const usersUsagePct = Math.round(
            (usersCount / tenant.maxUsers) * 100,
          );
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

  async updateSubscription(
    tenantID: string,
    dto: UpdateSubscriptionDto,
    masterUserID: string,
  ) {
    const tenant = await this.tenants.findOne({ where: { tenantID } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (dto.planType !== undefined) tenant.planType = dto.planType;
    if (dto.subscriptionExpiresAt !== undefined) {
      tenant.subscriptionExpiresAt = new Date(dto.subscriptionExpiresAt);
    }
    if (dto.autoRenew !== undefined) tenant.autoRenew = dto.autoRenew;

    const result = await this.tenants.save(tenant);
    await this.audit.save(
      this.audit.create({
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

  async exportTenantData(tenantID: string) {
    const tenant = await this.tenants.findOne({ where: { tenantID } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.tenantContext.run(
      { tenantId: tenantID, impersonating: false },
      () =>
        this.tenantContext.transaction(async (manager) => {
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
}
