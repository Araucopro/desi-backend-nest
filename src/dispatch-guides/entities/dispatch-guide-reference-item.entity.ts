import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DispatchGuideReference } from './dispatch-guide-reference.entity';

/**
 * Cantidad consumida de una guía de despacho por una factura/boleta.
 * Permite que una GD pueda ser referenciada por N documentos mientras la
 * cantidad despachada acumulada lo permita.
 */
@Entity({ name: 'DispatchGuideReferenceItem' })
@Index(['tenantID', 'dispatchGuideReferenceID'])
@Index(['tenantID', 'dispatchGuideID'])
export class DispatchGuideReferenceItem {
  @PrimaryGeneratedColumn('uuid')
  dispatchGuideReferenceItemID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => DispatchGuideReference, (reference) => reference.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dispatchGuideReferenceID' })
  reference!: DispatchGuideReference;

  @Column({ type: 'uuid' })
  dispatchGuideReferenceID!: string;

  @Column({ type: 'uuid' })
  dispatchGuideID!: string;

  @Column({ type: 'uuid' })
  variationID!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
