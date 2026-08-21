import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Store } from './entities/store.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { Tenant } from '../multitenant/entities/tenant.entity';
import { EncryptionService } from '../common/services/encryption.service';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly encryptionService?: EncryptionService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async create(dto: CreateStoreDto): Promise<Store> {
    if (!this.tenantContext)
      return this.storeRepo.save(this.storeRepo.create(dto));
    return this.tenantContext.transaction(async (manager) => {
      const tenant = await manager.getRepository(Tenant).findOne({
        where: { tenantID: this.tenantContext!.getTenantId() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');
      const count = await manager
        .getRepository(Store)
        .count({ where: { tenantID: tenant.tenantID } });
      if (count >= tenant.maxStores)
        throw new ForbiddenException(
          `Tenant store limit (${tenant.maxStores}) exceeded`,
        );
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
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId ? { tenantID: tenantId } : {};
    return this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(Store).find({ where }),
        )
      : this.storeRepo.find({ where });
  }

  async findOne(id: string): Promise<Store> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId
      ? { storeID: id, tenantID: tenantId }
      : { storeID: id };
    const store = await (this.tenantContext
      ? this.tenantContext.transaction((manager) =>
          manager.getRepository(Store).findOne({ where }),
        )
      : this.storeRepo.findOne({ where }));
    if (!store) throw new NotFoundException(`Store with ID ${id} not found`);
    return store;
  }

  async findUsersByStoreId(id: string): Promise<any> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId
      ? { storeID: id, tenantID: tenantId }
      : { storeID: id };
    const find = this.tenantContext
      ? (options: any) =>
          this.tenantContext!.transaction((manager) =>
            manager.getRepository(Store).findOne(options),
          )
      : (options: any) => this.storeRepo.findOne(options);
    const store = await find({
      where,
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

  async setOpenfacturaKey(
    id: string,
    apiKey: string,
  ): Promise<{ hasOpenfacturaKey: boolean }> {
    const store = await this.findOne(id);
    const encryption =
      this.encryptionService ??
      new EncryptionService(this.configService ?? new ConfigService());

    const encrypted = encryption.encrypt(apiKey.trim());
    store.openfacturaKeyEncrypted = encrypted;
    store.hasOpenfacturaKey = true;

    if (this.tenantContext) {
      await this.tenantContext.transaction((manager) =>
        manager.getRepository(Store).save(store),
      );
    } else {
      await this.storeRepo.save(store);
    }

    return { hasOpenfacturaKey: true };
  }

  async resolveOpenfacturaKey(id: string): Promise<string> {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const store = await (this.tenantContext
      ? this.tenantContext.transaction((manager) => {
          const qb = manager
            .getRepository(Store)
            .createQueryBuilder('store')
            .addSelect('store.openfacturaKeyEncrypted')
            .where('store.storeID = :id', { id });
          if (tenantId) {
            qb.andWhere('store.tenantID = :tenantId', { tenantId });
          }
          return qb.getOne();
        })
      : this.storeRepo
          .createQueryBuilder('store')
          .addSelect('store.openfacturaKeyEncrypted')
          .where('store.storeID = :id', { id })
          .getOne());

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${id} no encontrada`);
    }

    if (store.openfacturaKeyEncrypted) {
      const encryption =
        this.encryptionService ??
        new EncryptionService(this.configService ?? new ConfigService());
      return encryption.decrypt(store.openfacturaKeyEncrypted);
    }

    // Fallback a variable de entorno global durante migración
    const fallback =
      this.configService?.get<string>('OPENFACTURA_APIKEY') ||
      process.env.OPENFACTURA_APIKEY;

    if (fallback?.trim()) {
      return fallback.trim();
    }

    throw new InternalServerErrorException(
      `La tienda "${store.name || id}" no tiene configurada la API key de Openfactura y no existe variable global de fallback`,
    );
  }
}
