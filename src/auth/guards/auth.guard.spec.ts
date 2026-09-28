import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MASTER_ROUTE } from '../decorators/master.decorator';
import { User } from '../../users/entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

type SetupOptions = {
  payload?: Partial<JwtPayload>;
  sessionUser?: { userID: string; sessionVersion: number } | null;
  isPublic?: boolean;
  isMaster?: boolean;
};

function setupAuthGuard(options: SetupOptions = {}) {
  const payload: JwtPayload = {
    type: 'tenant',
    userId: 'user-1',
    tenantId: 'tenant-1',
    sessionVersion: 3,
    id: 'user-1',
    email: 'user@example.com',
    role: 'admin',
    ...(options.payload ?? {}),
  } as JwtPayload;

  const jwtService = { verifyAsync: jest.fn().mockResolvedValue(payload) };
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return options.isPublic ?? false;
      if (key === MASTER_ROUTE) return options.isMaster ?? false;
      return false;
    }),
  };
  const configService = { get: jest.fn().mockReturnValue('test-secret') };
  const sessionUser =
    options.sessionUser === undefined
      ? { userID: 'user-1', sessionVersion: 3 }
      : options.sessionUser;
  const manager = {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(sessionUser),
    }),
  };
  const tenantContext = {
    run: jest.fn(async (_context: unknown, callback: () => Promise<unknown>) =>
      callback(),
    ),
    transaction: jest.fn(
      async (callback: (m: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  const dataSource = {
    transaction: jest.fn(
      async (callback: (m: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };

  const guard = new AuthGuard(
    jwtService as any,
    reflector as any,
    configService as any,
    dataSource as any,
    tenantContext as any,
  );

  const request: Record<string, unknown> = {
    method: 'GET',
    url: '/sales',
    headers: { authorization: 'Bearer valid-token' },
  };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;

  return { guard, context, request, manager, tenantContext, dataSource };
}

describe('AuthGuard', () => {
  it('accepts a tenant token whose sessionVersion is current', async () => {
    const { guard, context, request, manager, tenantContext } =
      setupAuthGuard();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tenantContext.run).toHaveBeenCalled();
    expect(manager.getRepository).toHaveBeenCalledWith(User);
    expect(tenantContext.transaction).toHaveBeenCalled();
    expect(request.user).toMatchObject({
      userId: 'user-1',
      tenantId: 'tenant-1',
    });
  });

  it('rejects a tenant token with a stale sessionVersion', async () => {
    const { guard, context } = setupAuthGuard({
      sessionUser: { userID: 'user-1', sessionVersion: 4 },
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      message: 'Invalid or expired token',
    });
  });

  it('rejects a tenant token when the user does not exist', async () => {
    const { guard, context } = setupAuthGuard({ sessionUser: null });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('skips the session check for master tokens', async () => {
    const { guard, context, tenantContext } = setupAuthGuard({
      payload: { type: 'master' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tenantContext.transaction).not.toHaveBeenCalled();
  });

  it('skips the session check for public routes', async () => {
    const { guard, context, tenantContext } = setupAuthGuard({
      isPublic: true,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tenantContext.transaction).not.toHaveBeenCalled();
  });

  it('skips the session check for master routes', async () => {
    const { guard, context, tenantContext } = setupAuthGuard({
      isMaster: true,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tenantContext.transaction).not.toHaveBeenCalled();
  });
});
