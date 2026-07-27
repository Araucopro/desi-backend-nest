import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  create(createCategoryDto: CreateCategoryDto) {
    if (this.tenantContext) {
      return this.tenantContext.transaction((manager) => {
        const repo = manager.getRepository(Category);
        const category = repo.create(createCategoryDto);
        return repo.save(category);
      });
    }
    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }

  findAll() {
    if (this.tenantContext) {
      return this.tenantContext.transaction((manager) =>
        manager.getRepository(Category).find({
          where: { parentID: IsNull() },
          relations: ['children', 'parent'],
        }),
      );
    }
    return this.categoryRepository.find({
      where: { parentID: IsNull() },
      relations: ['children', 'parent'],
    });
  }

  findOne(id: string) {
    if (this.tenantContext) {
      return this.tenantContext.transaction((manager) =>
        manager.getRepository(Category).findOne({
          where: { categoryID: id },
          relations: ['children', 'parent'],
        }),
      );
    }
    return this.categoryRepository.findOne({
      where: { categoryID: id },
      relations: ['children', 'parent'],
    });
  }

  update(id: string, updateCategoryDto: UpdateCategoryDto) {
    if (this.tenantContext) {
      return this.tenantContext.transaction((manager) =>
        manager.getRepository(Category).update(id, updateCategoryDto),
      );
    }
    return this.categoryRepository.update(id, updateCategoryDto);
  }

  remove(id: string) {
    if (this.tenantContext) {
      return this.tenantContext.transaction((manager) =>
        manager.getRepository(Category).delete(id),
      );
    }
    return this.categoryRepository.delete(id);
  }
}

