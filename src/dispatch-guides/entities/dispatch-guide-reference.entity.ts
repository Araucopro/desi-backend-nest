import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DteDocument } from '../../dte/entities/dte-document.entity';
import { DispatchGuide } from './dispatch-guide.entity';

@Entity({ name: 'DispatchGuideReference' })
@Index(['dispatchGuideID', 'dteDocumentID'], { unique: true })
export class DispatchGuideReference {
  @PrimaryGeneratedColumn('uuid')
  dispatchGuideReferenceID!: string;

  @Column({ type: 'uuid' })
  tenantID!: string;

  @ManyToOne(() => DispatchGuide, (guide) => guide.references, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dispatchGuideID' })
  guide!: DispatchGuide;

  @Column({ type: 'uuid' })
  dispatchGuideID!: string;

  @ManyToOne(() => DteDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dteDocumentID' })
  dteDocument!: DteDocument;

  @Column({ type: 'uuid' })
  dteDocumentID!: string;

  @Column({ type: 'uuid', nullable: true })
  saleID!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
