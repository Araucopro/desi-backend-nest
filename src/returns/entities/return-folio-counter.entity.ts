import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'ReturnFolioCounter' })
@Index(['tenantID', 'storeID'], { unique: true })
export class ReturnFolioCounter {
  @PrimaryGeneratedColumn('uuid')
  returnFolioCounterID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  storeID!: string;

  @Column({ type: 'int', default: 0 })
  currentFolio!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
