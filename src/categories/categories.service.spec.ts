import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Repository } from 'typeorm';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryRepository: Repository<Category>;

  const mockCategoryRepository = {
    manager: {
      transaction: jest.fn(),
    },
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockCategory: Partial<Category> = {
    categoryID: 'cat-uuid-1',
    name: 'Test Category',
    parentID: undefined,
    children: [],
    parent: undefined,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCategoryRepository.manager.transaction.mockImplementation((callback) =>
      callback({ getRepository: () => mockCategoryRepository }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: mockCategoryRepository,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    categoryRepository = module.get<Repository<Category>>(
      getRepositoryToken(Category),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a category', async () => {
      const createDto = { name: 'New Category' };

      mockCategoryRepository.create.mockReturnValue(createDto);
      mockCategoryRepository.save.mockResolvedValue({
        categoryID: 'new-uuid',
        ...createDto,
      });

      const result = await service.create(createDto);

      expect(mockCategoryRepository.create).toHaveBeenCalledWith(createDto);
      expect(mockCategoryRepository.save).toHaveBeenCalled();
      expect(result.categoryID).toBe('new-uuid');
    });
  });

  describe('bulkUpsert', () => {
    it('creates all categories when none exist, using a single save', async () => {
      mockCategoryRepository.find.mockResolvedValue([]);
      const created = [
        { categoryID: 'new-1', name: 'Vestuario', parentID: null },
        { categoryID: 'new-2', name: 'Calzado', parentID: null },
      ];
      mockCategoryRepository.create.mockImplementation((data) => data);
      mockCategoryRepository.save.mockResolvedValue(created);

      const result = await service.bulkUpsert({
        items: [{ name: '  Vestuario  ' }, { name: 'Calzado' }],
      });

      expect(mockCategoryRepository.find).toHaveBeenCalledTimes(1);
      expect(mockCategoryRepository.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual(created);
    });

    it('updates existing categories by name and creates the rest', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        {
          categoryID: 'existing-1',
          tenantID: 'tenant-1',
          name: 'Vestuario',
          parentID: null,
        },
        {
          categoryID: 'parent-1',
          tenantID: 'tenant-1',
          name: 'Accesorios',
          parentID: null,
        },
      ]);
      mockCategoryRepository.create.mockImplementation((data) => ({
        categoryID: 'new-1',
        ...data,
      }));
      mockCategoryRepository.save.mockImplementation((entities) =>
        Promise.resolve(entities),
      );

      const result = await service.bulkUpsert({
        items: [
          { name: 'Vestuario', parentID: 'parent-1' },
          { name: 'Calzado' },
        ],
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        categoryID: 'existing-1',
        name: 'Vestuario',
        parentID: 'parent-1',
      });
      expect(result[1]).toMatchObject({
        categoryID: 'new-1',
        name: 'Calzado',
      });
      expect(mockCategoryRepository.create).toHaveBeenCalledTimes(1);
    });

    it('keeps the current parent when parentID is omitted for an existing category', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        {
          categoryID: 'existing-1',
          tenantID: 'tenant-1',
          name: 'Vestuario',
          parentID: 'parent-1',
        },
      ]);
      mockCategoryRepository.save.mockImplementation((entities) =>
        Promise.resolve(entities),
      );

      const result = await service.bulkUpsert({
        items: [{ name: 'Vestuario' }],
      });

      expect(result[0].parentID).toBe('parent-1');
    });

    it('rejects duplicate names in the payload before querying', async () => {
      await expect(
        service.bulkUpsert({
          items: [{ name: 'Vestuario' }, { name: ' vestuario ' }],
        }),
      ).rejects.toThrow('duplicada');

      expect(mockCategoryRepository.find).not.toHaveBeenCalled();
    });

    it('rejects a categoryID that does not exist', async () => {
      mockCategoryRepository.find.mockResolvedValue([]);

      await expect(
        service.bulkUpsert({
          items: [{ categoryID: 'missing-id', name: 'Calzado' }],
        }),
      ).rejects.toThrow('No se encontró la categoría con ID missing-id');
    });

    it('rejects parentID references that do not exist', async () => {
      mockCategoryRepository.find.mockResolvedValue([]);

      await expect(
        service.bulkUpsert({
          items: [{ name: 'Poleras', parentID: 'missing-parent' }],
        }),
      ).rejects.toThrow('no existen');
    });
  });

  describe('findAll', () => {
    it('should return root categories with children', async () => {
      mockCategoryRepository.find.mockResolvedValue([mockCategory]);

      const result = await service.findAll();

      expect(result).toEqual([mockCategory]);
      expect(mockCategoryRepository.find).toHaveBeenCalledWith({
        where: { parentID: expect.anything() },
        relations: ['children', 'parent'],
      });
    });
  });

  describe('findOne', () => {
    it('should return a category by ID', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(mockCategory);

      const result = await service.findOne('cat-uuid-1');

      expect(result).toEqual(mockCategory);
      expect(mockCategoryRepository.findOne).toHaveBeenCalledWith({
        where: { categoryID: 'cat-uuid-1' },
        relations: ['children', 'parent'],
      });
    });
  });

  describe('update', () => {
    it('should update a category', async () => {
      mockCategoryRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.update('cat-uuid-1', {
        name: 'Updated Category',
      });

      expect(mockCategoryRepository.update).toHaveBeenCalledWith('cat-uuid-1', {
        name: 'Updated Category',
      });
    });
  });

  describe('remove', () => {
    it('should delete a category', async () => {
      mockCategoryRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.remove('cat-uuid-1');

      expect(mockCategoryRepository.delete).toHaveBeenCalledWith('cat-uuid-1');
    });
  });
});
