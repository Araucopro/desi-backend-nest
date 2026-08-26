import { FindOperator } from 'typeorm';
import { ReturnStatus } from './entities/return.entity';
import { findActiveReturnsForSale } from './returns-repository.helpers';

describe('findActiveReturnsForSale', () => {
  it('filtra por estados activos usando un FindOperator In(...)', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const manager = {
      getRepository: jest.fn(() => ({ find })),
    } as any;

    await findActiveReturnsForSale(manager, 'sale-1');

    expect(manager.getRepository).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(1);

    const options = find.mock.calls[0][0] as {
      where: { saleID: string; status: unknown };
    };
    expect(options.where.saleID).toBe('sale-1');

    const status = options.where.status;
    expect(status).toBeInstanceOf(FindOperator);
    expect((status as FindOperator<string[]>).type).toBe('in');
    expect((status as FindOperator<string[]>).value).toEqual([
      ReturnStatus.PENDIENTE,
      ReturnStatus.APROBADA,
      ReturnStatus.COMPLETADA,
    ]);
  });
});
