import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateSaleDto } from './create-sale.dto';
import { SalePaymentType, SaleType } from '../entities/sale.entity';

describe('CreateSaleDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  function validPayload() {
    return {
      saleType: SaleType.NOTA_VENTA,
      paymentType: SalePaymentType.CASH,
      items: [
        {
          storeProductID: '550e8400-e29b-41d4-a716-446655440000',
          quantity: 1,
        },
      ],
    };
  }

  it('accepts a sale without manualDiscount', async () => {
    const dto = await pipe.transform(validPayload(), {
      type: 'body',
      metatype: CreateSaleDto,
    });

    expect(dto).toBeInstanceOf(CreateSaleDto);
    expect((dto as CreateSaleDto).items).toHaveLength(1);
  });

  it('accepts an optional manualDiscount between 0 and 100', async () => {
    const dto = await pipe.transform(
      {
        ...validPayload(),
        manualDiscount: 10,
      },
      {
        type: 'body',
        metatype: CreateSaleDto,
      },
    );

    expect(dto).toBeInstanceOf(CreateSaleDto);
    expect((dto as CreateSaleDto).manualDiscount).toBe(10);
  });

  it('rejects manualDiscount outside 0-100', async () => {
    await expect(
      pipe.transform(
        {
          ...validPayload(),
          manualDiscount: 101,
        },
        {
          type: 'body',
          metatype: CreateSaleDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
