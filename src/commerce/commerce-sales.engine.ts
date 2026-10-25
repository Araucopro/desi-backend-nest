import { createHash } from 'node:crypto';
import { CreateCommerceSaleDto } from './dto/create-commerce-sale.dto';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonical(object[key])]),
    );
  }
  return value;
}

export function commerceRequestHash(dto: CreateCommerceSaleDto): string {
  const payload = {
    externalOrderID: dto.externalOrderID,
    items: dto.items
      .map((item) => ({
        storeProductID: item.storeProductID.toLowerCase(),
        quantity: item.quantity,
      }))
      .sort((a, b) => a.storeProductID.localeCompare(b.storeProductID)),
    receiver: dto.receiver,
    payment: {
      ...dto.payment,
      paidAt: new Date(dto.payment.paidAt).toISOString(),
    },
    phone: dto.phone ?? null,
    shipping: dto.shipping ?? null,
    notes: dto.notes ?? null,
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(payload)))
    .digest('hex');
}

export function commerceIssueDate(paidAt: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(paidAt));
  const part = (type: string) =>
    parts.find((value) => value.type === type)!.value;
  return [part('year'), part('month'), part('day')].join('-');
}
