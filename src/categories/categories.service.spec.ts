import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Repository } from 'typeorm';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryRepository: Repository<Category>;

  const mockCategoryRepository = {
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
