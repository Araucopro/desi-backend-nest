import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { CreateStoreDto } from '../stores/dto/create-store.dto';
import { UpdateStoreDto } from '../stores/dto/update-store.dto';
import { User } from '../users/entities/user.entity';
import { Store } from '../stores/entities/store.entity';
import { loginMaster, impersonate } from './master-auth.helper';
import {
  createTenant,
  exportTenantData,
  findAllTenants,
  findTenantById,
  getTenantMetrics,
  setStatus,
  updateSubscription,
  updateTenant,
} from './tenant-crud.helper';
import {
  createTenantStore,
  createTenantUser,
  provisionTenant,
  updateTenantStore,
  updateTenantUser,
} from './tenant-provisioning.helper';

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
    return loginMaster(this.masterUsers, this.jwt, dto);
  }

  async createTenant(dto: CreateTenantDto) {
    return createTenant(this.tenants, dto);
  }

  async findAllTenants(query: QueryTenantsDto) {
    return findAllTenants(this.tenants, this.tenantContext, query);
  }

  async findTenantById(tenantID: string) {
    return findTenantById(this.tenants, this.tenantContext, tenantID);
  }

  async updateTenant(
    tenantID: string,
    dto: UpdateTenantDto,
    masterUserID: string,
  ) {
    return updateTenant(this.tenants, this.audit, tenantID, dto, masterUserID);
  }

  async setStatus(
    tenantID: string,
    status: TenantStatus,
    masterUserID: string,
  ) {
    return setStatus(this.tenants, this.audit, tenantID, status, masterUserID);
  }

  async impersonate(tenantID: string, masterUserID: string, reason?: string) {
    return impersonate(
      this.tenants,
      this.audit,
      this.jwt,
      tenantID,
      masterUserID,
      reason,
    );
  }

  async provisionTenant(
    tenantID: string,
    dto: ProvisionTenantDto,
    masterUserID: string,
  ) {
    return provisionTenant(
      this.tenants,
      this.tenantContext,
      tenantID,
      dto,
      masterUserID,
    );
  }

  async createTenantUser(
    tenantID: string,
    dto: CreateUserDto,
    masterUserID: string,
  ): Promise<User> {
    return createTenantUser(this.tenantContext, tenantID, dto, masterUserID);
  }

  async updateTenantUser(
    tenantID: string,
    userID: string,
    dto: UpdateUserDto,
    masterUserID: string,
  ): Promise<User> {
    return updateTenantUser(
      this.tenantContext,
      tenantID,
      userID,
      dto,
      masterUserID,
    );
  }

  async createTenantStore(
    tenantID: string,
    dto: CreateStoreDto,
    masterUserID: string,
  ): Promise<Store> {
    return createTenantStore(this.tenantContext, tenantID, dto, masterUserID);
  }

  async updateTenantStore(
    tenantID: string,
    storeID: string,
    dto: UpdateStoreDto,
    masterUserID: string,
  ): Promise<Store> {
    return updateTenantStore(
      this.tenantContext,
      tenantID,
      storeID,
      dto,
      masterUserID,
    );
  }

  async getTenantMetrics(tenantID: string) {
    return getTenantMetrics(this.tenants, this.tenantContext, tenantID);
  }

  async updateSubscription(
    tenantID: string,
    dto: UpdateSubscriptionDto,
    masterUserID: string,
  ) {
    return updateSubscription(
      this.tenants,
      this.audit,
      tenantID,
      dto,
      masterUserID,
    );
  }

  async exportTenantData(tenantID: string) {
    return exportTenantData(this.tenants, this.tenantContext, tenantID);
  }
}
