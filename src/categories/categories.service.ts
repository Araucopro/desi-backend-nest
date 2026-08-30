import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, IsNull } from 'typeorm';
import {
  BulkCategoryItemDto,
  CreateCategoriesBulkDto,
} from './dto/create-categories-bulk.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';

interface NormalizedBulkItem extends BulkCategoryItemDto {
  normalizedName: string;
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.categoryRepository.manager.transaction(callback);
  }

  create(createCategoryDto: CreateCategoryDto) {
    if (this.tenantContext) {
      return this.tenantContext.transaction((manager) => {
        const tenantID = this.tenantContext!.getTenantId();
        const repo = manager.getRepository(Category);
        const category = repo.create({ ...createCategoryDto, tenantID });
        return repo.save(category);
      });
    }
    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }

  /**
   * Crea o actualiza categorías de forma masiva en una sola transacción.
   *
   * Cada item se resuelve contra las categorías existentes del tenant:
   * - Si trae `categoryID`, se actualiza esa categoría (debe existir).
   * - Si no trae `categoryID`, se busca por nombre normalizado (trim + case-insensitive).
   * - Si no existe, se crea.
   *
   * La operación usa una única transacción con una sola lectura de categorías
   * existentes, un INSERT masivo para las nuevas y updates puntuales para las
   * existentes, evitando el round-trip de guardar una a una.
   */
  async bulkUpsert(dto: CreateCategoriesBulkDto): Promise<Category[]> {
    const items = this.validateAndNormalizeItems(dto.items);

    return this.runInTransaction(async (manager) => {
      const repo = manager.getRepository(Category);
      const tenantID = this.tenantContext?.getTenantId();

      const existing = await repo.find({
        where: tenantID ? { tenantID } : {},
        select: ['categoryID', 'tenantID', 'name', 'parentID'],
      });

      const byId = new Map(
        existing.map((category) => [category.categoryID, category]),
      );
      const byName = new Map(
        existing.map((category) => [
          category.name.trim().toLowerCase(),
          category,
        ]),
      );

      const batchCategoryIDs = new Set(
        items
          .filter((item) => item.categoryID)
          .map((item) => item.categoryID as string),
      );
      const providedParentIDs = new Set(
        items
          .filter((item) => item.parentID)
          .map((item) => item.parentID as string),
      );

      this.validateParents(providedParentIDs, byId, batchCategoryIDs);

      const toCreate: Category[] = [];
      const toUpdate: Category[] = [];
      const results: Category[] = [];

      for (const item of items) {
        const existingCategory = item.categoryID
          ? byId.get(item.categoryID)
          : byName.get(item.normalizedName);

        if (existingCategory) {
          if (item.parentID === existingCategory.categoryID) {
            throw new BadRequestException(
              `La categoría "${item.name}" no puede ser padre de sí misma.`,
            );
          }

          const nextName = item.name;
          const nextParentID = item.parentID ?? existingCategory.parentID;

          if (
            existingCategory.name !== nextName ||
            existingCategory.parentID !== nextParentID
          ) {
            existingCategory.name = nextName;
            existingCategory.parentID = nextParentID;
            toUpdate.push(existingCategory);
          }

          results.push(existingCategory);
          continue;
        }

        if (item.categoryID) {
          throw new BadRequestException(
            `No se encontró la categoría con ID ${item.categoryID} en el tenant actual.`,
          );
        }

        const created = repo.create({
          name: item.name,
          parentID: item.parentID,
          ...(tenantID ? { tenantID } : {}),
        });
        toCreate.push(created);
        results.push(created);
      }

      const savedByOriginal = new Map<Category, Category>();

      if (toCreate.length > 0) {
        const saved = await repo.save(toCreate);
        toCreate.forEach((original, index) =>
          savedByOriginal.set(original, saved[index]),
        );
      }

      if (toUpdate.length > 0) {
        const saved = await repo.save(toUpdate);
        toUpdate.forEach((original, index) =>
          savedByOriginal.set(original, saved[index]),
        );
      }

      return results.map(
        (category) => savedByOriginal.get(category) ?? category,
      );
    });
  }

  private validateAndNormalizeItems(
    items: BulkCategoryItemDto[],
  ): NormalizedBulkItem[] {
    const seenIDs = new Set<string>();
    const seenNames = new Set<string>();

    return items.map((item, index) => {
      const name = item.name.trim();
      if (!name) {
        throw new BadRequestException(
          `El nombre de la categoría en la posición ${index + 1} no puede estar vacío.`,
        );
      }

      const normalizedName = name.toLowerCase();

      if (item.categoryID) {
        if (seenIDs.has(item.categoryID)) {
          throw new BadRequestException(
            `La categoría con ID ${item.categoryID} está duplicada en la carga masiva.`,
          );
        }
        seenIDs.add(item.categoryID);
      } else {
        if (seenNames.has(normalizedName)) {
          throw new BadRequestException(
            `La categoría "${item.name}" está duplicada en la carga masiva.`,
          );
        }
        seenNames.add(normalizedName);
      }

      return { ...item, name, normalizedName };
    });
  }

  private validateParents(
    parentIDs: Set<string>,
    existingById: Map<string, Category>,
    batchCategoryIDs: Set<string>,
  ): void {
    const missing = [...parentIDs].filter(
      (parentID) =>
        !existingById.has(parentID) && !batchCategoryIDs.has(parentID),
    );

    if (missing.length > 0) {
      throw new BadRequestException(
        `Las siguientes categorías padre no existen en el tenant actual: ${missing.join(', ')}.`,
      );
    }
  }

  findAll() {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const tenantWhere = tenantId ? { tenantID: tenantId } : {};
    if (this.tenantContext) {
      return this.tenantContext.transaction((manager) =>
        manager.getRepository(Category).find({
          where: { parentID: IsNull(), ...tenantWhere },
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
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const tenantWhere = tenantId ? { tenantID: tenantId } : {};
    if (this.tenantContext) {
      return this.tenantContext.transaction((manager) =>
        manager.getRepository(Category).findOne({
          where: { categoryID: id, ...tenantWhere },
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
