import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';
import { UserStore } from '../../relations/userstores/entities/userstore.entity';
import { StoreContextGuard } from './store-context.guard';

describe('StoreContextGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  };

  function createGuard(userStore: unknown = { userStoreID: 'us-1' }) {
    const manager = {
      findOne: jest.fn().mockResolvedValue(userStore),
    };
    const tenantContext = {
      run: jest.fn(
        async (_context: unknown, callback: () => Promise<unknown>) =>
          callback(),
      ),
      transaction: jest.fn(
        async (callback: (m: typeof manager) => Promise<unknown>) =>
          callback(manager),
      ),
    };
    const guard = new StoreContextGuard(reflector as any, tenantContext as any);
    return { guard, manager, tenantContext };
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

  it('validates the user-store assignment inside a tenant transaction', async () => {
    const { guard, manager, tenantContext } = createGuard();
    const context = createContext({
      headers: { 'x-store-id': 'store-1', 'x-tenant-id': 'tenant-1' },
      user: { userId: 'user-1', role: UserRole.STORE_MANAGER },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tenantContext.run).toHaveBeenCalled();
    expect(tenantContext.transaction).toHaveBeenCalled();
    expect(manager.findOne).toHaveBeenCalledWith(
      UserStore,
      expect.objectContaining({
        where: {
          user: { userID: 'user-1' },
          store: { storeID: 'store-1' },
        },
      }),
    );
  });

  it('rejects when the user is not assigned to the store', async () => {
    const { guard } = createGuard(null);
    const context = createContext({
      headers: { 'x-store-id': 'store-1', 'x-tenant-id': 'tenant-1' },
      user: { userId: 'user-1', role: UserRole.STORE_MANAGER },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets tenant admins through without querying user_stores', async () => {
    const { guard, manager, tenantContext } = createGuard();
    const context = createContext({
      headers: { 'x-store-id': 'store-1', 'x-tenant-id': 'tenant-1' },
      user: { userId: 'user-1', role: UserRole.ADMIN },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tenantContext.transaction).not.toHaveBeenCalled();
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('requires X-Store-ID', async () => {
    const { guard } = createGuard();
    const context = createContext({
      headers: {},
      user: { userId: 'user-1', role: UserRole.ADMIN },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
