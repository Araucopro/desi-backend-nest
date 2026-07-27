import * as bcrypt from 'bcrypt';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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

    const run = <T>(cb: (manager: any) => Promise<T>): Promise<T> =>
      this.tenantContext
        ? this.tenantContext.transaction(cb)
        : this.dataSource.transaction(cb);
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    return run(async (manager: any) => {
      const userRepository = manager.getRepository(User);
      const tenant = tenantId
        ? await manager
            .getRepository(Tenant)
            .findOne({
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
          throw new Error(`Tenant user limit (${tenant.maxUsers}) exceeded`);
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
    return this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(User).find(),
        )
      : this.userRepo.find();
  }

  async findOneByEmail(email: string): Promise<User> {
    const user = await (this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(User).findOne({ where: { email } }),
        )
      : this.userRepo.findOne({ where: { email } }));
    if (!user)
      throw new NotFoundException(`User with email ${email} not found`);
    return user;
  }

  async findOneById(id: string): Promise<User> {
    const user = await (this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(User).findOne({ where: { userID: id } }),
        )
      : this.userRepo.findOne({ where: { userID: id } }));
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async findStoresByUserId(id: string): Promise<any> {
    const find = this.tenantContext
      ? (options: any) =>
          this.tenantContext!.transaction((manager) =>
            manager.getRepository(User).findOne(options),
          )
      : (options: any) => this.userRepo.findOne(options);
    const user = await find({
      where: { userID: id },
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
