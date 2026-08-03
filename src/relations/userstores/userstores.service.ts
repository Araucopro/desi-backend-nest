import {
  ConflictException,
  Optional,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStore } from './entities/userstore.entity';
import { CreateUserstoreDto } from './dto/create-userstore.dto';
import { UsersService } from '../../users/users.service';
import { StoresService } from '../../stores/stores.service';
import { TenantContextService } from '../../multitenant/tenant-context.service';

@Injectable()
export class UserstoresService {
  constructor(
    @InjectRepository(UserStore)
    private readonly userStoreRepo: Repository<UserStore>,
    private readonly usersService: UsersService,
    private readonly storesService: StoresService,
    @Optional() private readonly tenantContext?: TenantContextService,
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
      ...(this.tenantContext
        ? { tenantID: this.tenantContext.getTenantId() }
        : {}),
    });

    return this.userStoreRepo.save(userStore);
  }

  async findAll(): Promise<UserStore[]> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId ? { tenantID: tenantId } : {};
    return this.userStoreRepo.find({ where, relations: ['user', 'store'] });
  }

  async findStoresByUserId(userId: string): Promise<UserStore[]> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId
      ? { user: { userID: userId }, tenantID: tenantId }
      : { user: { userID: userId } };
    return this.userStoreRepo.find({
      where,
      relations: ['store'],
    });
  }

  async findUsersByStoreId(storeId: string): Promise<UserStore[]> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId
      ? { store: { storeID: storeId }, tenantID: tenantId }
      : { store: { storeID: storeId } };
    return this.userStoreRepo.find({
      where,
      relations: ['user'],
    });
  }

  async remove(id: string): Promise<void> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId
      ? { userStoreID: id, tenantID: tenantId }
      : { userStoreID: id };
    const userStore = await this.userStoreRepo.findOne({
      where,
    });
    if (!userStore) {
      throw new NotFoundException(`UserStore with ID ${id} not found`);
    }
    await this.userStoreRepo.remove(userStore);
  }
}
