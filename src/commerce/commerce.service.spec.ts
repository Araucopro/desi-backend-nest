import { ForbiddenException } from '@nestjs/common';
import { CommerceService } from './commerce.service';

describe('CommerceService tenant/store binding', () => {
  const tenantID = '5323b94c-bea8-40fd-aac4-efdb6efcd75c';
  const storeID = 'ad191d2e-934b-4ec7-9792-c91a758d7336';

  it('rejects a store outside the channel tenant before reading inventory', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const tenantContext = {
      getTenantId: jest.fn().mockReturnValue(tenantID),
      transaction: jest.fn(
        async (callback: (manager: unknown) => Promise<unknown>) =>
          callback({ getRepository: () => ({ findOne }) }),
      ),
    };
    const inventory = { getStoreInventory: jest.fn() };
    const commerce = new CommerceService(
      tenantContext as never,
      inventory as never,
      {} as never,
    );

    await expect(commerce.catalog(storeID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findOne).toHaveBeenCalledWith({
      where: { storeID, tenantID },
      select: ['storeID', 'tenantID', 'name'],
    });
    expect(inventory.getStoreInventory).not.toHaveBeenCalled();
  });
});
