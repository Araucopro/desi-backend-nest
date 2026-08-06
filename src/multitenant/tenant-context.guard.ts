import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { MASTER_ROUTE } from '../auth/decorators/master.decorator';
import { Tenant, TenantStatus } from './entities/tenant.entity';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Tenant)
    private readonly tenantsRepo: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ||
      this.reflector.getAllAndOverride<boolean>(MASTER_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const payload = request.user;
    const tenantId = payload?.tenantId ?? payload?.impersonatingTenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }

    const tenant = await this.tenantsRepo.findOne({
      where: { tenantID: tenantId },
    });
    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }
    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException(
        `Tenant access denied: tenant status is ${tenant.status}`,
      );
    }
    if (
      tenant.subscriptionExpiresAt &&
      new Date(tenant.subscriptionExpiresAt).getTime() < Date.now()
    ) {
      tenant.status = TenantStatus.SUSPENDED;
      await this.tenantsRepo.save(tenant);
      throw new ForbiddenException(
        'Tenant subscription has expired. Account suspended.',
      );
    }

    return true;
  }
}
