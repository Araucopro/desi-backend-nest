import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'SaleFolioCounter' })
@Index(['tenantID', 'storeID'], { unique: true })
export class SaleFolioCounter {
  @PrimaryGeneratedColumn('uuid')
  saleFolioCounterID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  storeID!: string;

  @Column({ type: 'int', default: 0 })
  currentFolio!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
