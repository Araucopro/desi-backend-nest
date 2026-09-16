import {
  ConflictException,
  Optional,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { UserStore } from './entities/userstore.entity';
import { CreateUserstoreDto } from './dto/create-userstore.dto';
import { UsersService } from '../../users/users.service';
import { StoresService } from '../../stores/stores.service';
import { TenantContextService } from '../../multitenant/tenant-context.service';
import { getZonedParts } from '../../common/utils/date-timezone.util';

@Injectable()
export class UserstoresService {
  constructor(
    @InjectRepository(UserStore)
    private readonly userStoreRepo: Repository<UserStore>,
    private readonly usersService: UsersService,
    private readonly storesService: StoresService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private withRepository<T>(
    callback: (repository: Repository<UserStore>) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          callback(manager.getRepository(UserStore)),
        )
      : callback(this.userStoreRepo);
  }

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.userStoreRepo.manager.transaction(callback);
  }

  async create(dto: CreateUserstoreDto): Promise<UserStore> {
    const { userID, storeID } = dto;

    // Verificar si el usuario y la tienda existen
    const user = await this.usersService.findOneById(userID);
    if (!user) {
      throw new NotFoundException(`User with ID ${userID} not found`);
    }
    const store = await this.storesService.findOne(storeID);
    if (!store) {
      throw new NotFoundException(`Store with ID ${storeID} not found`);
    }

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(UserStore);
      const tenantID = this.tenantContext?.get(false)?.tenantId;
      const scope = {
        user: { userID: user.userID },
        store: { storeID: store.storeID },
        ...(tenantID ? { tenantID } : {}),
      };

      // Verificar si la relación ya está vigente
      const existingRelation = await repository.findOne({
        where: {
          ...scope,
          effectiveTo: IsNull(),
          removedAt: IsNull(),
        },
      });

      if (existingRelation) {
        throw new ConflictException(
          'User is already associated with this store',
        );
      }

      const today = this.getToday();

      // Si el trabajador fue desvinculado hoy (la fila cerrada aún cubre el
      // día de baja), se reabre esa asignación en vez de insertar una nueva:
      // ambas cubrirían la misma fecha y el roster lo mostraría duplicado.
      const reopenableQuery = repository
        .createQueryBuilder('assignment')
        .where('assignment.userID = :userID', { userID: user.userID })
        .andWhere('assignment.storeID = :storeID', {
          storeID: store.storeID,
        })
        .andWhere('assignment.effectiveTo >= :today', { today })
        .andWhere('assignment.removedAt IS NOT NULL')
        .orderBy('assignment.effectiveFrom', 'DESC')
        .setLock('pessimistic_write');

      if (tenantID) {
        reopenableQuery.andWhere('assignment.tenantID = :tenantID', {
          tenantID,
        });
      }

      const reopenable = await reopenableQuery.getOne();

      if (reopenable) {
        reopenable.effectiveTo = null;
        reopenable.removedAt = null;
        reopenable.user = user;
        reopenable.store = store;
        return repository.save(reopenable);
      }

      const userStore = repository.create({
        user,
        store,
        effectiveFrom: today,
        ...(tenantID ? { tenantID } : {}),
      });

      return repository.save(userStore);
    });
  }

  private getToday(): string {
    const parts = getZonedParts(new Date(), this.tenantContext?.getTimeZone());
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  async findAll(): Promise<UserStore[]> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId ? { tenantID: tenantId } : {};
    return this.withRepository((repository) =>
      repository.find({
        where: { ...where, effectiveTo: IsNull(), removedAt: IsNull() },
        relations: ['user', 'store'],
      }),
    );
  }

  async findStoresByUserId(userId: string): Promise<UserStore[]> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId
      ? {
          user: { userID: userId },
          tenantID: tenantId,
          effectiveTo: IsNull(),
          removedAt: IsNull(),
        }
      : {
          user: { userID: userId },
          effectiveTo: IsNull(),
          removedAt: IsNull(),
        };
    return this.withRepository((repository) =>
      repository.find({ where, relations: ['store'] }),
    );
  }

  async findUsersByStoreId(storeId: string): Promise<UserStore[]> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId
      ? {
          store: { storeID: storeId },
          tenantID: tenantId,
          effectiveTo: IsNull(),
          removedAt: IsNull(),
        }
      : {
          store: { storeID: storeId },
          effectiveTo: IsNull(),
          removedAt: IsNull(),
        };
    return this.withRepository((repository) =>
      repository.find({ where, relations: ['user'] }),
    );
  }

  async remove(id: string): Promise<void> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId
      ? {
          userStoreID: id,
          tenantID: tenantId,
          effectiveTo: IsNull(),
          removedAt: IsNull(),
        }
      : { userStoreID: id, effectiveTo: IsNull(), removedAt: IsNull() };
    const close = async (manager: EntityManager): Promise<void> => {
      const repository = manager.getRepository(UserStore);
      const userStore = await repository.findOne({ where });
      if (!userStore) {
        throw new NotFoundException(`UserStore with ID ${id} not found`);
      }
      const parts = getZonedParts(
        new Date(),
        this.tenantContext?.getTimeZone(),
      );
      userStore.effectiveTo = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
      userStore.removedAt = new Date();
      await repository.save(userStore);
    };

    if (this.tenantContext) {
      await this.tenantContext.transaction(close);
    } else {
      await this.userStoreRepo.manager.transaction(close);
    }
  }
}
