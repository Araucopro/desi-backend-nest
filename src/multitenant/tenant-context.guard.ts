import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { TENANT_ID_HEADER } from './multitenant.constants';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest();
    const payload = request.user;
    const header = request.headers[TENANT_ID_HEADER] as string | undefined;
    if (!payload?.tenantId && !header)
      throw new ForbiddenException('Tenant context is required');
    if (payload?.tenantId && header && payload.tenantId !== header)
      throw new ForbiddenException('Tenant mismatch');
    return true;
  }
}
