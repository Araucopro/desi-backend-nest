import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { AuditEvent } from '../multitenant/entities/audit-event.entity';
import { Tenant, TenantStatus } from '../multitenant/entities/tenant.entity';
import { MasterRole } from '../multitenant/entities/master-user.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { Store } from '../stores/entities/store.entity';
import {
  CreateCommerceChannelDto,
  UpdateCommerceChannelDto,
} from './dto/create-commerce-channel.dto';
import { CommerceChannel } from './entities/commerce-channel.entity';

@Injectable()
export class MasterCommerceService {
  constructor(
    @InjectRepository(CommerceChannel)
    private readonly channels: Repository<CommerceChannel>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireSuperAdmin(role: MasterRole): void {
    if (role !== MasterRole.SUPER_ADMIN) {
      throw new ForbiddenException('Master super admin required');
    }
  }

  private view(channel: CommerceChannel) {
    return {
      channelID: channel.channelID,
      tenantID: channel.tenantID,
      storeID: channel.storeID,
      code: channel.code,
      name: channel.name,
      domain: channel.domain,
      active: channel.active,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };
  }

  private makeToken(channelID: string) {
    const token = `${channelID}.${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return { token, tokenHash };
  }

  private async tenant(tenantID: string, activeRequired: boolean) {
    const tenant = await this.tenants.findOne({ where: { tenantID } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (activeRequired && tenant.status !== TenantStatus.ACTIVE) {
      throw new ConflictException('Tenant must be active to create a channel');
    }
    return tenant;
  }

  async list(tenantID: string) {
    await this.tenant(tenantID, false);
    const rows = await this.channels.find({
      where: { tenantID },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.view(row));
  }

  async create(
    tenantID: string,
    dto: CreateCommerceChannelDto,
    masterUserID: string,
    role: MasterRole,
  ) {
    this.requireSuperAdmin(role);
    const tenant = await this.tenant(tenantID, true);
    const channelID = randomUUID();
    const { token, tokenHash } = this.makeToken(channelID);
    try {
      const channel = await this.tenantContext.run(
        {
          tenantId: tenantID,
          timeZone: tenant.timeZone,
          masterUserId: masterUserID,
          impersonating: false,
        },
        () =>
          this.tenantContext.transaction(async (manager) => {
            const store = await manager.getRepository(Store).findOne({
              where: { storeID: dto.storeID, tenantID },
            });
            if (!store)
              throw new NotFoundException('Store not found in tenant');
            const channel = manager.create(CommerceChannel, {
              channelID,
              tenantID,
              storeID: dto.storeID,
              code: dto.code,
              name: dto.name,
              domain: dto.domain || null,
              tokenHash,
              active: true,
            });
            const saved = await manager.save(channel);
            await manager.save(
              AuditEvent,
              manager.create(AuditEvent, {
                tenantID,
                masterUserID,
                action: 'CHANNEL_CREATE',
                endpoint: 'master/commerce-channels',
                result: 'SUCCESS',
                reason: `channelID=${channelID}`,
              }),
            );
            return saved;
          }),
      );
      return { ...this.view(channel), token };
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Channel code already exists in tenant');
      throw error;
    }
  }

  async update(
    tenantID: string,
    channelID: string,
    dto: UpdateCommerceChannelDto,
    masterUserID: string,
    role: MasterRole,
  ) {
    this.requireSuperAdmin(role);
    const tenant = await this.tenant(tenantID, false);
    const channel = await this.tenantContext.run(
      {
        tenantId: tenantID,
        timeZone: tenant.timeZone,
        masterUserId: masterUserID,
        impersonating: false,
      },
      () =>
        this.tenantContext.transaction(async (manager) => {
          const row = await manager.getRepository(CommerceChannel).findOne({
            where: { channelID, tenantID },
            lock: { mode: 'pessimistic_write' },
          });
          if (!row) throw new NotFoundException('Channel not found');
          if (dto.storeID && dto.storeID !== row.storeID) {
            const store = await manager.getRepository(Store).findOne({
              where: { storeID: dto.storeID, tenantID },
            });
            if (!store)
              throw new NotFoundException('Store not found in tenant');
            row.storeID = dto.storeID;
          }
          if (dto.name !== undefined) row.name = dto.name;
          if (dto.domain !== undefined) row.domain = dto.domain || null;
          if (dto.active !== undefined) row.active = dto.active;
          const saved = await manager.save(row);
          await manager.save(
            AuditEvent,
            manager.create(AuditEvent, {
              tenantID,
              masterUserID,
              action: 'CHANNEL_UPDATE',
              endpoint: 'master/commerce-channels',
              result: 'SUCCESS',
              reason: `channelID=${channelID}`,
            }),
          );
          return saved;
        }),
    );
    return this.view(channel);
  }

  async rotate(
    tenantID: string,
    channelID: string,
    masterUserID: string,
    role: MasterRole,
  ) {
    this.requireSuperAdmin(role);
    await this.tenant(tenantID, false);
    const { token, tokenHash } = this.makeToken(channelID);
    const channel = await this.channels.manager.transaction(async (manager) => {
      const row = await manager.getRepository(CommerceChannel).findOne({
        where: { channelID, tenantID },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Channel not found');
      row.tokenHash = tokenHash;
      const saved = await manager.save(row);
      await manager.save(
        AuditEvent,
        manager.create(AuditEvent, {
          tenantID,
          masterUserID,
          action: 'CHANNEL_ROTATE',
          endpoint: 'master/commerce-channels/rotate',
          result: 'SUCCESS',
          reason: `channelID=${channelID}`,
        }),
      );
      return saved;
    });
    return { ...this.view(channel), token };
  }
}
