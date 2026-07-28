import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { MASTER_ROUTE } from '../../auth/decorators/master.decorator';
import { UserRole } from '../../users/entities/user.entity';
import { UserStore } from '../../relations/userstores/entities/userstore.entity';
import { STORE_ID_HEADER } from '../../multitenant/multitenant.constants';

@Injectable()
export class StoreContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(UserStore)
    private readonly userStoreRepo: Repository<UserStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const isMaster = this.reflector.getAllAndOverride<boolean>(MASTER_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic || isMaster) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const payload = request.user;

    const headerStoreId = request.headers[STORE_ID_HEADER] as
      | string
      | undefined;
    const storeId =
      headerStoreId || request.params?.storeID || request.body?.storeID;

    if (!storeId) {
      throw new ForbiddenException(
        `Store context is required. Please provide header '${STORE_ID_HEADER}' or storeID parameter`,
      );
    }

    if (!payload) {
      throw new ForbiddenException('User context missing');
    }

    // Los administradores de tenant o master admins tienen acceso a todas las tiendas
    if (payload.role === UserRole.ADMIN || payload.type === 'master') {
      request.storeId = storeId;
      return true;
    }

    const userId = payload.userId || payload.id;
    const userStore = await this.userStoreRepo.findOne({
      where: {
        user: { userID: userId },
        store: { storeID: storeId },
      },
    });

    if (!userStore) {
      throw new ForbiddenException(
        `Acceso denegado: El usuario no tiene permisos asignados para operar en la tienda ${storeId}`,
      );
    }

    request.storeId = storeId;
    return true;
  }
}
