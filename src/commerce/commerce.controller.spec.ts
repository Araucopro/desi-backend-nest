import { CommerceController } from './commerce.controller';

// The binding is populated by AuthGuard from the channel record, never from checkout data.
describe('CommerceController channel photo policy', () => {
  it.each([true, false])(
    'returns the authenticated sales permissions in channel context: %s',
    async (acceptTestPayments) => {
      const service = {
        context: jest.fn().mockResolvedValue({
          tenantID: 'tenant-1',
          storeID: 'store-1',
          storeName: 'Store',
        }),
      };
      const controller = new CommerceController(service as never);
      const request = {
        user: { storeId: 'store-1', salesEnabled: true, acceptTestPayments },
      } as never;
      await expect(controller.context(request)).resolves.toMatchObject({
        tenantID: 'tenant-1',
        storeID: 'store-1',
        salesEnabled: true,
        acceptTestPayments,
      });
    },
  );
  it.each([true, false, undefined])(
    'forwards the authenticated policy to both listing and quoting: %s',
    async (requireProductPhoto) => {
      const service = {
        catalog: jest.fn().mockResolvedValue([]),
        quote: jest.fn().mockResolvedValue({}),
      };
      const controller = new CommerceController(service as never);
      const request = {
        user: { storeId: 'store-1', requireProductPhoto },
      } as never;
      const dto = { items: [{ storeProductID: 'sp-1', quantity: 1 }] };
      await controller.catalog(request);
      await controller.quote(request, dto);
      expect(service.catalog).toHaveBeenCalledWith(
        'store-1',
        requireProductPhoto !== false,
      );
      expect(service.quote).toHaveBeenCalledWith(
        'store-1',
        dto,
        requireProductPhoto !== false,
      );
    },
  );
});
