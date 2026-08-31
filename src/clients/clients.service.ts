import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQueryDto } from './dto/list-clients.query.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client, ClientSegment } from './entities/client.entity';

export type ClientReceiverData = {
  rut?: string;
  name?: string;
  giro?: string;
  address?: string;
  city?: string;
  email?: string;
};

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    cb: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(cb)
      : this.clientRepository.manager.transaction(cb);
  }

  async create(dto: CreateClientDto): Promise<Client> {
    return this.runInTransaction(async (manager) => {
      const existing = await manager.findOne(Client, {
        where: { rut: dto.rut.trim() },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe un cliente con el RUT ${dto.rut}`,
        );
      }

      const client = manager.create(Client, {
        rut: dto.rut.trim(),
        name: dto.name.trim(),
        giro: dto.giro?.trim() ?? null,
        address: dto.address?.trim() ?? null,
        city: dto.city?.trim() ?? null,
        email: dto.email?.trim() ?? null,
        phone: dto.phone?.trim() ?? null,
        segment: dto.segment ?? ClientSegment.RETAIL,
        notes: dto.notes?.trim() ?? null,
      });

      return manager.save(Client, client);
    });
  }

  async findAll(query: ListClientsQueryDto): Promise<{
    clients: Client[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const qb = this.clientRepository.createQueryBuilder('client');

    if (query.search) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(client.rut ILIKE :term OR client.name ILIKE :term OR client.email ILIKE :term)',
        { term },
      );
    }

    if (query.segment) {
      qb.andWhere('client.segment = :segment', { segment: query.segment });
    }

    qb.orderBy('client.createdAt', 'DESC').skip(skip).take(limit);

    const [clients, total] = await qb.getManyAndCount();

    return {
      clients,
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  async findOne(clientID: string): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { clientID },
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientID} no encontrado`);
    }

    return client;
  }

  async update(clientID: string, dto: UpdateClientDto): Promise<Client> {
    return this.runInTransaction(async (manager) => {
      const client = await manager.findOne(Client, {
        where: { clientID },
      });

      if (!client) {
        throw new NotFoundException(`Cliente con ID ${clientID} no encontrado`);
      }

      if (dto.rut && dto.rut.trim() !== client.rut) {
        const existing = await manager.findOne(Client, {
          where: { rut: dto.rut.trim() },
        });
        if (existing && existing.clientID !== clientID) {
          throw new ConflictException(
            `Ya existe un cliente con el RUT ${dto.rut}`,
          );
        }
        client.rut = dto.rut.trim();
      }

      if (dto.name !== undefined) client.name = dto.name.trim();
      if (dto.giro !== undefined) client.giro = dto.giro?.trim() ?? null;
      if (dto.address !== undefined)
        client.address = dto.address?.trim() ?? null;
      if (dto.city !== undefined) client.city = dto.city?.trim() ?? null;
      if (dto.email !== undefined) client.email = dto.email?.trim() ?? null;
      if (dto.phone !== undefined) client.phone = dto.phone?.trim() ?? null;
      if (dto.segment !== undefined) client.segment = dto.segment;
      if (dto.notes !== undefined) client.notes = dto.notes?.trim() ?? null;

      return manager.save(Client, client);
    });
  }

  async remove(clientID: string): Promise<void> {
    const client = await this.findOne(clientID);
    await this.clientRepository.remove(client);
  }

  /**
   * findOrCreate para uso interno en emisión de ventas y guías de despacho.
   * Si existe un cliente por RUT, actualiza silenciosamente los campos recibidos del receptor.
   * Si no existe, lo crea con segment = RETAIL por defecto.
   */
  async findOrCreate(
    tenantID: string,
    receiver: ClientReceiverData,
    transactionManager?: EntityManager,
  ): Promise<Client | null> {
    if (!receiver.rut || !receiver.rut.trim()) {
      return null;
    }

    const mgr = transactionManager ?? this.clientRepository.manager;
    const rut = receiver.rut.trim();

    let client = await mgr.findOne(Client, {
      where: { rut },
    });

    if (client) {
      // Silent update de datos del receptor sin alterar segment, phone ni notes
      let modified = false;
      if (receiver.name && receiver.name.trim() !== client.name) {
        client.name = receiver.name.trim();
        modified = true;
      }
      if (
        receiver.giro !== undefined &&
        receiver.giro?.trim() !== (client.giro ?? '')
      ) {
        client.giro = receiver.giro?.trim() || null;
        modified = true;
      }
      if (
        receiver.address !== undefined &&
        receiver.address?.trim() !== (client.address ?? '')
      ) {
        client.address = receiver.address?.trim() || null;
        modified = true;
      }
      if (
        receiver.city !== undefined &&
        receiver.city?.trim() !== (client.city ?? '')
      ) {
        client.city = receiver.city?.trim() || null;
        modified = true;
      }
      if (
        receiver.email !== undefined &&
        receiver.email?.trim() !== (client.email ?? '')
      ) {
        client.email = receiver.email?.trim() || null;
        modified = true;
      }

      if (modified) {
        client = await mgr.save(Client, client);
      }
      return client;
    }

    // Crear nuevo cliente
    client = mgr.create(Client, {
      tenantID,
      rut,
      name: receiver.name?.trim() || 'Cliente Sin Nombre',
      giro: receiver.giro?.trim() || null,
      address: receiver.address?.trim() || null,
      city: receiver.city?.trim() || null,
      email: receiver.email?.trim() || null,
      segment: ClientSegment.RETAIL,
    });

    return mgr.save(Client, client);
  }
}
