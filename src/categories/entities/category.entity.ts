import { Product } from '../../products/entities/product.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  categoryID!: string;

  @Column({ type: 'uuid', nullable: true })
  parentID!: string;

  @Column()
  name!: string;

  @ManyToOne(() => Category, (category) => category.children)
  @JoinColumn({ name: 'parentID' })
  parent!: Category;

  @OneToMany(() => Category, (category) => category.parent)
  children!: Category[];

  @OneToMany(() => Product, (product) => product.category)
  products!: Product[];
}
