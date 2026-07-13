import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProductVariation } from './product-variation.entity';
import { Category } from '../../categories/entities/category.entity';

export enum ProductGenre {
  HOMBRE = 'Hombre',
  MUJER = 'Mujer',
  UNISEX = 'Unisex',
}

@Entity({ name: 'Products' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  productID!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image?: string;

  @Column({ type: 'uuid', nullable: true })
  categoryID?: string;

  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn({ name: 'categoryID' })
  category!: Category;

  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand?: string;

  @Column({
    type: 'enum',
    enum: ProductGenre,
    nullable: true,
  })
  genre?: ProductGenre;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string;

  @OneToMany(() => ProductVariation, (variation) => variation.product, {
    cascade: true,
  })
  variations!: ProductVariation[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
