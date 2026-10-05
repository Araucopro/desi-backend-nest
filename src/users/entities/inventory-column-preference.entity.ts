import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

export enum InventoryColumnStoreFilter {
  ALL = 'all',
  PROPIAS = 'propias',
  CONSIGNADAS = 'consignadas',
}

@Entity({ name: 'UserInventoryColumnPreference' })
export class InventoryColumnPreference {
  @PrimaryGeneratedColumn('uuid', { name: 'preferenceID' })
  preferenceID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @Column({ type: 'uuid' })
  userID!: string;

  @Column({ type: 'uuid', nullable: true })
  storeID!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  storeFilter!: InventoryColumnStoreFilter | null;

  @Column({ type: 'jsonb' })
  hiddenColumns!: string[];

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updatedAt' })
  updatedAt!: Date;
}
