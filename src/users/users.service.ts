import * as bcrypt from 'bcrypt';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Store, StoreType } from '../stores/entities/store.entity';
import { UserStore } from '../relations/userstores/entities/userstore.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const hasUsers = await userRepository
        .createQueryBuilder('user')
        .getExists();

      const user = userRepository.create({
        ...dto,
        password: hashedPassword,
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
        });

        const savedStore = await storeRepository.save(centralStore);
        const userStore = userStoreRepository.create({
          user: savedUser,
          store: savedStore,
        });

        await userStoreRepository.save(userStore);
        savedUser.userStores = [userStore];
      }

      return savedUser;
    });
  }

  async findAll(): Promise<User[]> {
    return this.userRepo.find();
  }

  async findOneByEmail(email: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user)
      throw new NotFoundException(`User with email ${email} not found`);
    return user;
  }

  async findOneById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { userID: id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async findStoresByUserId(id: string): Promise<any> {
    const user = await this.userRepo.findOne({
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
    return this.userRepo.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOneById(id);
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    await this.userRepo.remove(user);
  }
}
