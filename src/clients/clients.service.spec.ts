import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientsService } from './clients.service';
import { Client, ClientSegment } from './entities/client.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../multitenant/tenant-context.service';

describe('ClientsService', () => {
  let service: ClientsService;
  let repo: jest.Mocked<Repository<Client>>;

  const mockClient: Client = {
    clientID: 'client-uuid-1',
    tenantID: 'tenant-uuid-1',
    rut: '76234556-6',
    name: 'Cliente Ejemplo SpA',
    giro: 'Venta',
    address: 'Av. Test 123',
    city: 'Santiago',
    email: 'test@cliente.cl',
    phone: '+56912345678',
    segment: ClientSegment.RETAIL,
    notes: 'Nota test',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQueryBuilder: any = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[mockClient], 1]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        {
          provide: TenantContextService,
          useValue: {
            getTenantId: jest.fn().mockReturnValue('tenant-uuid-1'),
            transaction: jest.fn().mockImplementation((cb) =>
              cb({
                findOne: jest.fn(),
                create: jest.fn().mockImplementation((_, dto) => dto),
                save: jest
                  .fn()
                  .mockImplementation((_, client) =>
                    Promise.resolve({ clientID: 'client-uuid-1', ...client }),
                  ),
              }),
            ),
          },
        },
        {
          provide: getRepositoryToken(Client),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn().mockImplementation((dto) => dto),
            save: jest
              .fn()
              .mockImplementation((client) =>
                Promise.resolve({ ...mockClient, ...client }),
              ),
            remove: jest.fn().mockResolvedValue(mockClient),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
            manager: {
              transaction: jest.fn((cb) =>
                cb({
                  findOne: jest.fn(),
                  create: jest.fn().mockImplementation((_, dto) => dto),
                  save: jest
                    .fn()
                    .mockImplementation((_, client) =>
                      Promise.resolve({ clientID: 'client-uuid-1', ...client }),
                    ),
                }),
              ),
              findOne: jest.fn(),
              create: jest.fn().mockImplementation((_, dto) => dto),
              save: jest
                .fn()
                .mockImplementation((_, client) =>
                  Promise.resolve({ clientID: 'client-uuid-1', ...client }),
                ),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
    repo = module.get(getRepositoryToken(Client));
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe listar clientes con paginación y filtros', async () => {
      const result = await service.findAll({
        page: 1,
        limit: 10,
        search: '76234',
      });
      expect(result.clients).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(repo.createQueryBuilder).toHaveBeenCalledWith('client');
    });
  });

  describe('findOne', () => {
    it('debe retornar un cliente si existe', async () => {
      repo.findOne.mockResolvedValue(mockClient);
      const result = await service.findOne('client-uuid-1');
      expect(result).toEqual(mockClient);
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('invalido')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('debe crear un cliente con el tenantID del contexto', async () => {
      const result = await service.create({
        rut: '76234556-6',
        name: 'Cliente Ejemplo SpA',
      });

      expect(result).toBeDefined();
      expect(result.tenantID).toBe('tenant-uuid-1');
      expect(result.name).toBe('Cliente Ejemplo SpA');
    });
  });

  describe('findOrCreate', () => {
    it('debe retornar null si receiver no tiene RUT', async () => {
      const result = await service.findOrCreate('tenant-uuid', {});
      expect(result).toBeNull();
    });

    it('debe crear un nuevo cliente si no existe por RUT', async () => {
      const mgr: any = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((_, data) => data),
        save: jest
          .fn()
          .mockImplementation((_, data) =>
            Promise.resolve({ clientID: 'new-id', ...data }),
          ),
      };

      const result = await service.findOrCreate(
        'tenant-uuid',
        { rut: '76234556-6', name: 'Nuevo' },
        mgr,
      );

      expect(result).toBeDefined();
      expect(result?.clientID).toBe('new-id');
      expect(mgr.save).toHaveBeenCalled();
    });

    it('debe actualizar silenciosamente un cliente existente por RUT', async () => {
      const mgr: any = {
        findOne: jest.fn().mockResolvedValue({ ...mockClient, name: 'Viejo' }),
        save: jest.fn().mockImplementation((_, data) => Promise.resolve(data)),
      };

      const result = await service.findOrCreate(
        'tenant-uuid',
        { rut: '76234556-6', name: 'Nombre Actualizado' },
        mgr,
      );

      expect(result).toBeDefined();
      expect(result?.name).toBe('Nombre Actualizado');
      expect(mgr.save).toHaveBeenCalled();
    });
  });
});
