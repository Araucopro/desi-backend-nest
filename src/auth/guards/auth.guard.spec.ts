import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MASTER_ROUTE } from '../decorators/master.decorator';
import { CHANNEL_ROUTE } from '../decorators/channel-route.decorator';
import { User } from '../../users/entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { CommerceChannel } from '../../commerce/entities/commerce-channel.entity';

const CHANNEL_ID = '691d3bdc-bbc9-49c4-96d8-bc09441417d3';
const CHANNEL_TOKEN = `${CHANNEL_ID}.${'a'.repeat(64)}`;

type SetupOptions = {
  payload?: Partial<JwtPayload>;
  sessionUser?: { userID: string; sessionVersion: number } | null;
  isPublic?: boolean;
  isMaster?: boolean;
  isChannel?: boolean;
  channelToken?: string;
  channelTenantID?: string;
  channelStoreID?: string;
  channelEnabled?: boolean;
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
      if (key === CHANNEL_ROUTE) return options.isChannel ?? false;
      return false;
    }),
  };
  const configValues: Record<string, string> = { JWT_SECRET: 'test-secret' };
  const configService = { get: jest.fn((name: string) => configValues[name]) };
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
    getRepository: jest.fn((entity: unknown) =>
      entity === CommerceChannel
        ? {
            findOne: jest.fn().mockResolvedValue(
              options.channelEnabled === false
                ? null
                : {
                    channelID: CHANNEL_ID,
                    tenantID:
                      options.channelTenantID ??
                      '5323b94c-bea8-40fd-aac4-efdb6efcd75c',
                    storeID:
                      options.channelStoreID ??
                      'ad191d2e-934b-4ec7-9792-c91a758d7336',
                    code: 'DESI_WEB',
                    name: 'desi.cl',
                    domain: 'www.desi.cl',
                    tokenHash: createHash('sha256')
                      .update(CHANNEL_TOKEN)
                      .digest('hex'),
                    active: true,
                  },
            ),
          }
        : { findOne: jest.fn() },
    ),
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
    headers: {
      authorization: `Bearer ${options.channelToken ?? 'valid-token'}`,
    },
  };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;

  return {
    guard,
    context,
    request,
    manager,
    tenantContext,
    dataSource,
    jwtService,
  };
}

describe('AuthGuard', () => {
  it('accepts a tenant token whose sessionVersion is current', async () => {
    const { guard, context, request, manager, tenantContext, dataSource } =
      setupAuthGuard();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tenantContext.run).toHaveBeenCalled();
    expect(manager.getRepository).toHaveBeenCalledWith(User);
    expect(tenantContext.transaction).toHaveBeenCalled();
    expect(dataSource.getRepository).not.toHaveBeenCalled();
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

  it('binds a channel token to its database tenant and store', async () => {
    const { guard, context, request, jwtService } = setupAuthGuard({
      isChannel: true,
      channelToken: CHANNEL_TOKEN,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(request.user).toEqual({
      type: 'channel',
      channelId: CHANNEL_ID,
      channelCode: 'DESI_WEB',
      channelName: 'desi.cl',
      domain: 'www.desi.cl',
      tenantId: '5323b94c-bea8-40fd-aac4-efdb6efcd75c',
      storeId: 'ad191d2e-934b-4ec7-9792-c91a758d7336',
    });
  });

  it('resolves a second channel to a different tenant without ERP env changes', async () => {
    const tenantId = 'd775bd86-3293-450d-aa43-d8860a43c4e1';
    const storeId = 'a44aed88-79f4-43c3-8bc2-8827d1630a09';
    const { guard, context, request } = setupAuthGuard({
      isChannel: true,
      channelToken: CHANNEL_TOKEN,
      channelTenantID: tenantId,
      channelStoreID: storeId,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ tenantId, storeId });
  });

  it('rejects an incorrect channel token', async () => {
    const { guard, context } = setupAuthGuard({
      isChannel: true,
      channelToken: `${CHANNEL_ID}.${'b'.repeat(64)}`,
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a disabled channel without affecting ordinary tenant auth', async () => {
    const { guard, context } = setupAuthGuard({
      isChannel: true,
      channelEnabled: false,
      channelToken: CHANNEL_TOKEN,
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
