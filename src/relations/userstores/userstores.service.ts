import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStore } from './entities/userstore.entity';
import { CreateUserstoreDto } from './dto/create-userstore.dto';
import { UsersService } from '../../users/users.service';
import { StoresService } from '../../stores/stores.service';

@Injectable()
export class UserstoresService {
  constructor(
    @InjectRepository(UserStore)
    private readonly userStoreRepo: Repository<UserStore>,
    private readonly usersService: UsersService,
    private readonly storesService: StoresService,
  ) {}

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
    // Verificar si la relación ya existe
    const existingRelation = await this.userStoreRepo.findOne({
      where: {
        user: { userID: user.userID },
        store: { storeID: store.storeID },
      },
    });

    if (existingRelation) {
      throw new ConflictException('User is already associated with this store');
    }

    const userStore = this.userStoreRepo.create({
      user,
      store,
    });

    return this.userStoreRepo.save(userStore);
  }

  async findAll(): Promise<UserStore[]> {
    return this.userStoreRepo.find({ relations: ['user', 'store'] });
  }

  async findStoresByUserId(userId: string): Promise<UserStore[]> {
    return this.userStoreRepo.find({
      where: { user: { userID: userId } },
      relations: ['store'],
    });
  }

  async findUsersByStoreId(storeId: string): Promise<UserStore[]> {
    return this.userStoreRepo.find({
      where: { store: { storeID: storeId } },
      relations: ['user'],
    });
  }

  async remove(id: string): Promise<void> {
    const userStore = await this.userStoreRepo.findOne({
      where: { userStoreID: id },
    });
    if (!userStore) {
      throw new NotFoundException(`UserStore with ID ${id} not found`);
    }
    await this.userStoreRepo.remove(userStore);
  }
}
