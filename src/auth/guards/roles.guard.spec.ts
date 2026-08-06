import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  function createGuard(requiredRoles: UserRole[]) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ROLES_KEY ? requiredRoles : false,
      ),
    };
    const guard = new RolesGuard(reflector as any);
    return { guard };
  }

  function createContext(request: Record<string, unknown>) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;
  }

  it('allows master impersonation tokens even with tenant roles required', () => {
    const { guard } = createGuard([UserRole.ADMIN]);
    const context = createContext({
      user: {
        type: 'master',
        masterUserId: 'master-1',
        role: 'SUPPORT',
        impersonatingTenantId: 'tenant-1',
      },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a tenant user with the required role', () => {
    const { guard } = createGuard([UserRole.ADMIN]);
    const context = createContext({
      user: { type: 'tenant', role: UserRole.ADMIN },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a tenant user without the required role', () => {
    const { guard } = createGuard([UserRole.ADMIN]);
    const context = createContext({
      user: { type: 'tenant', role: UserRole.STORE_MANAGER },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
