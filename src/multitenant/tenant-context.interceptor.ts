import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly context: TenantContextService,
    private readonly reflector: Reflector,
  ) {}

  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    // Rutas @Public() no necesitan tenant context
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);
    if (isPublic) return next.handle();

    const request = executionContext.switchToHttp().getRequest();
    const payload = request.user;

    // Rutas master sin impersonación tampoco necesitan tenant
    if (payload?.type === 'master' && !payload.impersonatingTenantId)
      return next.handle();

    const tenantId = payload?.tenantId ?? payload?.impersonatingTenantId;
    if (!tenantId) throw new ForbiddenException('Tenant context is required');
    const timeZone =
      payload?.timeZone ??
      payload?.impersonatingTimeZone ??
      (request.headers?.['x-timezone'] as string | undefined) ??
      'America/Santiago';
    request.tenantId = tenantId;
    return this.context.run(
      {
        tenantId,
        timeZone,
        userId: payload?.userId ?? payload?.id,
        masterUserId: payload?.masterUserId,
        impersonating: Boolean(payload?.impersonatingTenantId),
      },
      () => next.handle(),
    );
  }
}
