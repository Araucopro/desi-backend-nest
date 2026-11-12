import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class TenantOfferAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{
        user?: {
          type?: string;
          role?: string;
          tenantId?: string;
          impersonatingTenantId?: string;
        };
      }>();
    if (user?.type === 'master' && user.impersonatingTenantId) return true;
    if (
      user?.type !== 'tenant' ||
      user.role !== UserRole.ADMIN ||
      !user.tenantId
    ) {
      throw new ForbiddenException(
        'Solo el administrador propietario de la empresa puede gestionar descuentos',
      );
    }
    return true;
  }
}
