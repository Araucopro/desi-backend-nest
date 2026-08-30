import * as bcrypt from 'bcrypt';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-list.query.dto';
import { UserListResponseDto } from './dto/user-list-response.dto';
import { Store, StoreType } from '../stores/entities/store.entity';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { Tenant } from '../multitenant/entities/tenant.entity';
import { Role } from '../roles/entities/role.entity';

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
      const userQuery = userRepository.createQueryBuilder('user');
      const hasUsers = await (typeof userQuery.where === 'function'
        ? userQuery.where('user.isSystem = false').getExists()
        : userQuery.getExists());
      if (tenant) {
        const userCount = await userRepository.count({
          where: { tenantID: tenant.tenantID, isSystem: false },
        });
        if (userCount >= tenant.maxUsers)
          throw new ForbiddenException(
            `Tenant user limit (${tenant.maxUsers}) exceeded`,
          );
      }

      const roleRepository = manager.getRepository(Role);
      const role = roleRepository
        ? await roleRepository.findOne({
            where: {
              tenantID: tenantId!,
              ...(dto.roleID ? { id: dto.roleID } : { name: dto.role }),
            },
          })
        : null;
      if (tenantId && !role)
        throw new NotFoundException('Role not found for tenant');
      const user = userRepository.create({
        ...dto,
        role: dto.role ?? UserRole.TERCERO,
        roleID: role?.id ?? dto.roleID,
        status: dto.status ?? UserStatus.ACTIVE,
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

  async findAll(query: UserListQueryDto = {}): Promise<UserListResponseDto> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const { limit = 10, offset = 0, search, role, roleID, status } = query;

    const applyFilters = (qb: SelectQueryBuilder<User>) => {
      if (tenantId) qb.andWhere('user.tenantID = :tenantId', { tenantId });
      qb.andWhere('user.isSystem = false');
      if (search?.trim()) {
        const term = `%${search.trim()}%`;
        qb.andWhere('(user.name ILIKE :term OR user.email ILIKE :term)', {
          term,
        });
      }
      if (role) {
        qb.andWhere('user.role = :role', { role });
      }
      if (roleID) qb.andWhere('user.roleID = :roleID', { roleID });
      if (status) {
        qb.andWhere('user.status = :status', { status });
      }
      qb.orderBy('user.createdAt', 'DESC');
      return qb;
    };

    const execute = async (
      repo: Repository<User>,
    ): Promise<UserListResponseDto> => {
      const qb = applyFilters(repo.createQueryBuilder('user'));
      const [users, total] = await qb
        .take(limit)
        .skip(offset)
        .getManyAndCount();

      return {
        users: users.map((user) => ({
          userID: user.userID,
          email: user.email,
          name: user.name,
          role: user.role,
          roleID: user.roleID,
          userImg: user.userImg,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
        meta: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total,
        },
      };
    };

    return this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          execute(manager.getRepository(User)),
        )
      : execute(this.userRepo);
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

    if (dto.roleID || dto.role) {
      const role = await (this.tenantContext
        ? this.tenantContext.transaction((manager) =>
            manager.getRepository(Role).findOne({
              where: {
                tenantID: user.tenantID,
                ...(dto.roleID ? { id: dto.roleID } : { name: dto.role }),
              },
            }),
          )
        : this.dataSource.getRepository(Role).findOne({
            where: {
              tenantID: user.tenantID,
              ...(dto.roleID ? { id: dto.roleID } : { name: dto.role }),
            },
          }));
      if (!role) throw new NotFoundException('Role not found for tenant');
      user.roleID = role.id;
      if (role.name in UserRole) user.role = role.name as UserRole;
      user.sessionVersion += 1;
    }
    if (dto.status && dto.status !== user.status) user.sessionVersion += 1;
    Object.assign(user, { ...dto, roleID: user.roleID });
    return this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(User).save(user),
        )
      : this.userRepo.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOneById(id);
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    if (user.isSystem)
      throw new ForbiddenException('System user cannot be removed');
    user.status = UserStatus.INACTIVE;
    user.sessionVersion += 1;
    if (this.tenantContext)
      await this.tenantContext.transaction((manager) =>
        manager.getRepository(User).save(user),
      );
    else await this.userRepo.save(user);
  }
}
