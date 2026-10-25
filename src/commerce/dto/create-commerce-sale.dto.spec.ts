import { ValidationPipe } from '@nestjs/common';
import { CreateCommerceSaleDto } from './create-commerce-sale.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const payload = () => ({
  externalOrderID: 'order-1',
  items: [
    { storeProductID: 'ad191d2e-934b-4ec7-9792-c91a758d7336', quantity: 1 },
  ],
  receiver: { name: 'Cliente Web', email: 'cliente@example.test' },
  payment: {
    provider: 'mercadopago',
    reference: 'payment-1',
    amount: 1190,
    currency: 'CLP',
    status: 'approved',
    isTest: false,
    paidAt: '2026-10-15T12:00:00Z',
  },
});
const validate = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: CreateCommerceSaleDto });

it('accepts a buyer without RUT and rejects client-supplied tenant/store routing', async () => {
  await expect(validate(payload())).resolves.toMatchObject(payload());
  await expect(validate({ ...payload(), tenantID: 'other' })).rejects.toThrow();
  await expect(validate({ ...payload(), storeID: 'other' })).rejects.toThrow();
  await expect(
    validate({ ...payload(), receiver: { name: 'Cliente' } }),
  ).rejects.toThrow();
});

it.each(
  [
    [],
    [{ ...payload().items[0], quantity: 0 }],
    [{ ...payload().items[0], quantity: 101 }],
    [...payload().items, ...payload().items],
  ].map((items) => ({ items })),
)(
  'rejects invalid quantities, empty orders and duplicate items',
  async ({ items }) => {
    await expect(validate({ ...payload(), items })).rejects.toThrow();
  },
);

it.each([
  { amount: 1190.5 },
  { amount: -1 },
  { currency: 'MXN' },
  { status: 'pending' },
  { isTest: 'false' },
  { paidAt: 'invalid' },
])('rejects invalid confirmed payment data: %j', async (patch) => {
  await expect(
    validate({ ...payload(), payment: { ...payload().payment, ...patch } }),
  ).rejects.toThrow();
});
