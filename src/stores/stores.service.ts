import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from './entities/store.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { Tenant } from '../multitenant/entities/tenant.entity';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  async create(dto: CreateStoreDto): Promise<Store> {
    if (!this.tenantContext)
      return this.storeRepo.save(this.storeRepo.create(dto));
    return this.tenantContext.transaction(async (manager) => {
      const tenant = await manager
        .getRepository(Tenant)
        .findOne({
          where: { tenantID: this.tenantContext!.getTenantId() },
          lock: { mode: 'pessimistic_write' },
        });
      if (!tenant) throw new NotFoundException('Tenant not found');
      const count = await manager
        .getRepository(Store)
        .count({ where: { tenantID: tenant.tenantID } });
      if (count >= tenant.maxStores)
        throw new Error(`Tenant store limit (${tenant.maxStores}) exceeded`);
      return manager
        .getRepository(Store)
        .save(
          manager
            .getRepository(Store)
            .create({ ...dto, tenantID: tenant.tenantID }),
        );
    });
  }

  async findAll(): Promise<Store[]> {
    return this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(Store).find(),
        )
      : this.storeRepo.find();
  }

  async findOne(id: string): Promise<Store> {
    const store = await (this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(Store).findOne({ where: { storeID: id } }),
        )
      : this.storeRepo.findOne({ where: { storeID: id } }));
    if (!store) throw new NotFoundException(`Store with ID ${id} not found`);
    return store;
  }

  async findUsersByStoreId(id: string): Promise<any> {
    const find = this.tenantContext
      ? (options: any) =>
          this.tenantContext!.transaction((manager) =>
            manager.getRepository(Store).findOne(options),
          )
      : (options: any) => this.storeRepo.findOne(options);
    const store = await find({
      where: { storeID: id },
      relations: ['userStores', 'userStores.user'],
    });

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${id} no encontrada`);
    }

    return store.userStores.map((userStore: UserStore) => userStore.user);
  }

  async update(id: string, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.findOne(id);
    Object.assign(store, dto);
    return this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(Store).save(store),
        )
      : this.storeRepo.save(store);
  }

  async remove(id: string): Promise<void> {
    const store = await this.findOne(id);
    if (this.tenantContext)
      await this.tenantContext.transaction((manager) =>
        manager.getRepository(Store).remove(store),
      );
    else await this.storeRepo.remove(store);
  }
}
