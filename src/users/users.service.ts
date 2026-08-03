import * as bcrypt from 'bcrypt';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Store, StoreType } from '../stores/entities/store.entity';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { Tenant } from '../multitenant/entities/tenant.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    const run = <T>(cb: (manager: EntityManager) => Promise<T>): Promise<T> =>
      this.tenantContext
        ? this.tenantContext.transaction(cb)
        : this.dataSource.transaction(cb);
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    return run(async (manager: EntityManager) => {
      const userRepository = manager.getRepository(User);
      const tenant = tenantId
        ? await manager.getRepository(Tenant).findOne({
            where: { tenantID: tenantId },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      if (tenantId && !tenant) throw new NotFoundException('Tenant not found');
      const hasUsers = await userRepository
        .createQueryBuilder('user')
        .getExists();
      if (tenant) {
        const userCount = await userRepository.count({
          where: { tenantID: tenant.tenantID },
        });
        if (userCount >= tenant.maxUsers)
          throw new ForbiddenException(
            `Tenant user limit (${tenant.maxUsers}) exceeded`,
          );
      }

      const user = userRepository.create({
        ...dto,
        password: hashedPassword,
        tenantID: tenantId,
      });

      const savedUser = await userRepository.save(user);

      if (!hasUsers) {
        const storeRepository = manager.getRepository(Store);
        const userStoreRepository = manager.getRepository(UserStore);

        const centralStore = storeRepository.create({
          location: 'Santiago',
          rut: '11111111-1',
          address: 'Santiago',
          phone: '9999999',
          city: 'Santiago',
          storeImg: undefined,
          email: 'central@demo.com',
          name: `Tienda de ${dto.name}`,
          type: StoreType.CENTRAL,
          isCentralStore: true,
          tenantID: tenantId,
          giro: 'VENTA AL POR MENOR GENERAL',
          acteco: '479100',
          cdgSIISucur: '0',
          businessName: `COMERCIAL ${dto.name.toUpperCase()} SPA`,
        });

        const savedStore = await storeRepository.save(centralStore);
        const userStore = userStoreRepository.create({
          user: savedUser,
          store: savedStore,
          tenantID: tenantId,
        });

        await userStoreRepository.save(userStore);
        savedUser.userStores = [userStore];
      }

      return savedUser;
    });
  }

  async findAll(): Promise<User[]> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId ? { tenantID: tenantId } : {};
    return this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(User).find({ where }),
        )
      : this.userRepo.find({ where });
  }

  async findOneByEmail(email: string): Promise<User> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId ? { email, tenantID: tenantId } : { email };
    const user = await (this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(User).findOne({ where }),
        )
      : this.userRepo.findOne({ where }));
    if (!user)
      throw new NotFoundException(`User with email ${email} not found`);
    return user;
  }

  async findOneById(id: string): Promise<User> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId
      ? { userID: id, tenantID: tenantId }
      : { userID: id };
    const user = await (this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(User).findOne({ where }),
        )
      : this.userRepo.findOne({ where }));
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async findStoresByUserId(id: string): Promise<any> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId
      ? { userID: id, tenantID: tenantId }
      : { userID: id };
    const find = this.tenantContext
      ? (options: any) =>
          this.tenantContext!.transaction((manager) =>
            manager.getRepository(User).findOne(options),
          )
      : (options: any) => this.userRepo.findOne(options);
    const user = await find({
      where,
      relations: ['userStores', 'userStores.store'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return user.userStores.map((userStore) => userStore.store);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOneById(id);
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    if (dto.password) {
      const saltRounds = 10;
      dto.password = await bcrypt.hash(dto.password, saltRounds);
    }

    Object.assign(user, dto);
    return this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(User).save(user),
        )
      : this.userRepo.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOneById(id);
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    if (this.tenantContext)
      await this.tenantContext.transaction((manager) =>
        manager.getRepository(User).remove(user),
      );
    else await this.userRepo.remove(user);
  }
}
