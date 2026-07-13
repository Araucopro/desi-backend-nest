import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { initialData } from './data/seed-data';
import { Product } from '../products/entities/product.entity';
import { Category } from '../categories/entities/category.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { ProductGenre } from '../products/entities/product.entity';

@Injectable()
export class SeedService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(StoreProduct)
    private readonly storeProductRepository: Repository<StoreProduct>,
    @InjectRepository(ProductVariation)
    private readonly productVariationRepository: Repository<ProductVariation>,
  ) {}

  async runSeed() {
    await this.deleteTables();
    await this.insertStores();
    const categories = await this.insertCategories();
    await this.insertProducts(categories);
    return 'SEED EXECUTED SUCCESSFULLY';
  }

  private async deleteTables() {
    // Delete data in order to avoid foreign key constraints
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Order matters due to Foreign Keys
      await queryRunner.query(
        'TRUNCATE TABLE "StoreProduct" RESTART IDENTITY CASCADE',
      );
      await queryRunner.query(
        'TRUNCATE TABLE "ProductVariations" RESTART IDENTITY CASCADE',
      );
      await queryRunner.query(
        'TRUNCATE TABLE "Products" RESTART IDENTITY CASCADE',
      );
      await queryRunner.query(
        'TRUNCATE TABLE "categories" RESTART IDENTITY CASCADE',
      );
      await queryRunner.query(
        'TRUNCATE TABLE "Store" RESTART IDENTITY CASCADE',
      );
    } catch (error) {
      console.error('Error truncating tables', error);
      // Fallback for non-postgres or specific errors, though user uses Postgres.
      // We can try delete with empty criteria if TRUNCATE fails, but TRUNCATE is better for seeds.
    } finally {
      await queryRunner.release();
    }
  }

  private async insertStores() {
    const stores = initialData.stores;
    const insertPromises: Store[] = [];

    stores.forEach((store) => {
      insertPromises.push(this.storeRepository.create(store));
    });

    await this.storeRepository.save(insertPromises);
  }

  private async insertCategories() {
    const categoriesData = initialData.categories;
    const categories: Category[] = [];

    for (const catName of categoriesData) {
      const cat = this.categoryRepository.create({
        name: catName,
      });
      await this.categoryRepository.save(cat);
      categories.push(cat);
    }
    return categories;
  }

  private async insertProducts(categories: Category[]) {
    const products = initialData.products;
    const centralStore = await this.storeRepository.findOne({
      where: { isCentralStore: true },
    });

    for (const prod of products) {
      const category = categories.find((c) => c.name === prod.type);

      const product = this.productRepository.create({
        name: prod.name,
        description: prod.description,
        brand: prod.brand,
        image: prod.image,
        genre: prod.genre as ProductGenre,
        category: category,
      });

      const savedProduct = await this.productRepository.save(product);

      // Create variations
      for (const variationData of prod.variations) {
        const variation = this.productVariationRepository.create({
          product: savedProduct,
          sku: variationData.sku,
          size: variationData.size,
          color: variationData.color,
        });

        const savedVariation =
          await this.productVariationRepository.save(variation);

        // Add stock to Central Store if exists
        if (centralStore) {
          const storeProduct = this.storeProductRepository.create({
            store: centralStore,
            variation: savedVariation,
            stock: variationData.stock,
            priceCost: variationData.priceCost,
            priceList: variationData.priceList,
          });
          await this.storeProductRepository.save(storeProduct);
        }
      }
    }
  }
}
