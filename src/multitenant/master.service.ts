import { ConflictException, Injectable, NotFoundException, UnauthorizedException, OnModuleInit, Logger } from '@nestjs/common';
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

@Injectable()
export class MasterService implements OnModuleInit {
  private readonly logger = new Logger(MasterService.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(MasterUser) private readonly masterUsers: Repository<MasterUser>,
    @InjectRepository(AuditEvent) private readonly audit: Repository<AuditEvent>,
    private readonly jwt: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureMasterUserBootstrap();
  }

  private async ensureMasterUserBootstrap() {
    try {
      const count = await this.masterUsers.count();
      if (count === 0) {
        const defaultEmail = this.configService.get<string>('MASTER_ADMIN_EMAIL', 'admin@master.local');
        const defaultPassword = this.configService.get<string>('MASTER_ADMIN_PASSWORD', 'Admin123!');
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        await this.masterUsers.save(
          this.masterUsers.create({
            email: defaultEmail,
            password: passwordHash,
            role: MasterRole.SUPER_ADMIN,
            sessionVersion: 1,
          }),
        );
        this.logger.log(`Default MASTER user bootstrapped with email: ${defaultEmail}`);
      }
    } catch (error) {
      this.logger.warn(`Master user bootstrap check skipped or postponed: ${(error as Error).message}`);
    }
  }

  async loginMaster(dto: LoginMasterDto) {
    const masterUser = await this.masterUsers.findOne({ where: { email: dto.email } });
    if (!masterUser) throw new UnauthorizedException('Invalid master credentials');

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
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tenant';
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

  async setStatus(tenantID: string, status: TenantStatus, masterUserID: string) {
    const tenant = await this.tenants.findOne({ where: { tenantID } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    tenant.status = status;
    const result = await this.tenants.save(tenant);
    await this.audit.save(this.audit.create({ tenantID, masterUserID, action: 'STATUS', endpoint: 'master/tenants', result: status, reason: 'master status change' }));
    return result;
  }

  async impersonate(tenantID: string, masterUserID: string, reason?: string) {
    const tenant = await this.tenants.findOne({ where: { tenantID, status: TenantStatus.ACTIVE } });
    if (!tenant) throw new NotFoundException('Tenant not found or inactive');
    await this.audit.save(this.audit.create({ tenantID, masterUserID, action: 'IMPERSONATE', endpoint: 'master/impersonate', result: 'ISSUED', reason: reason ?? 'N/A' }));
    return this.jwt.signAsync({ type: 'master', masterUserId: masterUserID, role: 'SUPPORT', sessionVersion: 1, impersonatingTenantId: tenantID, impersonatedBy: masterUserID });
  }
}

