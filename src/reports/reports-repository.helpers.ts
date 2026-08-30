import { Repository } from 'typeorm';
import { DteDocument } from '../dte/entities/dte-document.entity';
import { FinancialMovement } from '../financial-movements/entities/financial-movement.entity';
import { Sale, SaleStatus, SaleType } from '../sales/entities/sale.entity';
import { CountTotalAggregate, FinancialMovementRow } from './report-helpers';

export async function aggregateMovements(
  repo: Repository<FinancialMovement>,
  start: Date,
  end: Date,
  storeId?: string,
): Promise<FinancialMovementRow[]> {
  const qb = repo
    .createQueryBuilder('movement')
    .select('EXTRACT(MONTH FROM movement.date)', 'month')
    .addSelect('movement.category', 'category')
    .addSelect('movement.direction', 'direction')
    .addSelect('movement.taxCredit', 'taxCredit')
    .addSelect('movement.acceptedForTax', 'acceptedForTax')
    .addSelect('COALESCE(SUM(movement.amount), 0)', 'total')
    .addSelect('COALESCE(SUM(movement.taxAmount), 0)', 'taxTotal')
    .where('movement.date >= :start AND movement.date < :end', {
      start: start.toISOString(),
      end: end.toISOString(),
    });

  if (storeId) {
    qb.andWhere('movement.storeID = :storeId', { storeId });
  }

  return qb
    .groupBy('month')
    .addGroupBy('movement.category')
    .addGroupBy('movement.direction')
    .addGroupBy('movement.taxCredit')
    .addGroupBy('movement.acceptedForTax')
    .getRawMany();
}

export async function aggregateDteCountAndTotal(
  repo: Repository<DteDocument>,
  startIso: string,
  endIso: string,
  storeId?: string,
): Promise<CountTotalAggregate> {
  const qb = repo
    .createQueryBuilder('document')
    .select(
      'COALESCE(SUM(CASE WHEN document.documentType = 61 THEN -document.total ELSE document.total END),0)',
      'total',
    )
    .addSelect(
      'COALESCE(SUM(CASE WHEN document.documentType IS DISTINCT FROM 61 THEN 1 ELSE 0 END),0)',
      'count',
    )
    .where('document.createdAt >= :start AND document.createdAt < :end', {
      start: startIso,
      end: endIso,
    })
    .andWhere("document.status = 'EMITIDO'")
    .andWhere('document.documentType IS DISTINCT FROM 52');

  if (storeId) qb.andWhere('document.storeID = :storeId', { storeId });

  const raw =
    (await qb.getRawOne<{
      count?: string | number;
      total?: string | number;
    }>()) ?? {};
  return { count: Number(raw.count || 0), total: Number(raw.total || 0) };
}

export async function aggregateSaleNoteCountAndTotal(
  repo: Repository<Sale>,
  startIso: string,
  endIso: string,
  storeId?: string,
): Promise<CountTotalAggregate> {
  const qb = repo
    .createQueryBuilder('sale')
    .select('COUNT(sale.saleID)', 'count')
    .addSelect('COALESCE(SUM(sale.total),0)', 'total')
    .where('sale.createdAt >= :start AND sale.createdAt < :end', {
      start: startIso,
      end: endIso,
    })
    .andWhere('sale.status = :status', { status: SaleStatus.EMITIDA })
    .andWhere('sale.saleType = :saleType', {
      saleType: SaleType.NOTA_VENTA,
    });

  if (storeId) qb.andWhere('sale.storeID = :storeId', { storeId });

  const raw =
    (await qb.getRawOne<{
      count?: string | number;
      total?: string | number;
    }>()) ?? {};
  return { count: Number(raw.count || 0), total: Number(raw.total || 0) };
}

export async function fetchDtePaymentBreakdown(
  repo: Repository<DteDocument>,
  from: string,
  to: string,
  storeId?: string,
): Promise<Array<Record<string, unknown>>> {
  const qb = repo
    .createQueryBuilder('document')
    .select('document.paymentType', 'key')
    .addSelect(
      'SUM(CASE WHEN document.documentType = 61 THEN -document.total ELSE document.total END)',
      'total',
    )
    .addSelect(
      'SUM(CASE WHEN document.documentType IS DISTINCT FROM 61 THEN 1 ELSE 0 END)',
      'count',
    )
    .where('document.createdAt >= :from AND document.createdAt < :to', {
      from,
      to,
    })
    .andWhere("document.status = 'EMITIDO'")
    .andWhere('document.documentType IS DISTINCT FROM 52');

  if (storeId) {
    qb.andWhere('document.storeID = :storeId', { storeId });
  }

  return qb.groupBy('document.paymentType').getRawMany();
}

export async function fetchDteStatusBreakdown(
  repo: Repository<DteDocument>,
  from: string,
  to: string,
  storeId?: string,
): Promise<Array<Record<string, unknown>>> {
  const qb = repo
    .createQueryBuilder('document')
    .select('document.status', 'key')
    .addSelect(
      'SUM(CASE WHEN document.documentType = 61 THEN -document.total ELSE document.total END)',
      'total',
    )
    .addSelect(
      'SUM(CASE WHEN document.documentType IS DISTINCT FROM 61 THEN 1 ELSE 0 END)',
      'count',
    )
    .where('document.createdAt >= :from AND document.createdAt < :to', {
      from,
      to,
    })
    .andWhere('document.documentType IS DISTINCT FROM 52');

  if (storeId) {
    qb.andWhere('document.storeID = :storeId', { storeId });
  }

  return qb.groupBy('document.status').getRawMany();
}

export async function fetchSalePaymentBreakdown(
  repo: Repository<Sale>,
  from: string,
  to: string,
  storeId?: string,
): Promise<Array<Record<string, unknown>>> {
  const qb = repo
    .createQueryBuilder('sale')
    .select('sale.paymentType', 'key')
    .addSelect('COUNT(sale.saleID)', 'count')
    .addSelect('SUM(sale.total)', 'total')
    .where('sale.createdAt >= :from AND sale.createdAt < :to', {
      from,
      to,
    })
    .andWhere('sale.status = :status', { status: SaleStatus.EMITIDA })
    .andWhere('sale.saleType = :saleType', {
      saleType: SaleType.NOTA_VENTA,
    });

  if (storeId) {
    qb.andWhere('sale.storeID = :storeId', { storeId });
  }

  return qb.groupBy('sale.paymentType').getRawMany();
}

export async function fetchSaleStatusBreakdown(
  repo: Repository<Sale>,
  from: string,
  to: string,
  storeId?: string,
): Promise<Array<Record<string, unknown>>> {
  const qb = repo
    .createQueryBuilder('sale')
    .select('sale.status', 'key')
    .addSelect('COUNT(sale.saleID)', 'count')
    .addSelect('SUM(sale.total)', 'total')
    .where('sale.createdAt >= :from AND sale.createdAt < :to', {
      from,
      to,
    })
    .andWhere('sale.status = :status', { status: SaleStatus.EMITIDA })
    .andWhere('sale.saleType = :saleType', {
      saleType: SaleType.NOTA_VENTA,
    });

  if (storeId) {
    qb.andWhere('sale.storeID = :storeId', { storeId });
  }

  return qb.groupBy('sale.status').getRawMany();
}

export async function fetchDocumentList(
  repo: Repository<DteDocument>,
  from: string,
  to: string,
  storeId: string | undefined,
  takeCount: number,
): Promise<[DteDocument[], number]> {
  const qb = repo
    .createQueryBuilder('document')
    .leftJoinAndSelect('document.store', 'store')
    .where('document.createdAt >= :from AND document.createdAt < :to', {
      from,
      to,
    })
    .andWhere('document.documentType IS DISTINCT FROM 52');

  if (storeId) qb.andWhere('document.storeID = :storeId', { storeId });

  return qb
    .orderBy('document.createdAt', 'DESC')
    .skip(0)
    .take(takeCount)
    .getManyAndCount();
}

export async function fetchSaleNoteList(
  repo: Repository<Sale>,
  from: string,
  to: string,
  storeId: string | undefined,
  takeCount: number,
): Promise<[Sale[], number]> {
  const qb = repo
    .createQueryBuilder('sale')
    .leftJoinAndSelect('sale.store', 'store')
    .leftJoinAndSelect('sale.items', 'items')
    .where('sale.createdAt >= :from AND sale.createdAt < :to', {
      from,
      to,
    })
    .andWhere('sale.status = :status', { status: SaleStatus.EMITIDA })
    .andWhere('sale.saleType = :saleType', {
      saleType: SaleType.NOTA_VENTA,
    });

  if (storeId) qb.andWhere('sale.storeID = :storeId', { storeId });

  return qb
    .orderBy('sale.createdAt', 'DESC')
    .skip(0)
    .take(takeCount)
    .getManyAndCount();
}
