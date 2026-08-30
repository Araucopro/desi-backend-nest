import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateDispatchGuideDto } from './create-dispatch-guide.dto';

describe('CreateDispatchGuideDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  function validPayload() {
    return {
      items: [
        {
          storeProductID: '550e8400-e29b-41d4-a716-446655440000',
          quantity: 2,
        },
      ],
      receiver: {
        rut: '66666666-6',
        name: 'Cliente SpA',
        address: 'Av. Providencia 1234',
        city: 'Providencia',
      },
      destination: {
        address: 'Av. Providencia 1234',
        city: 'Providencia',
      },
    };
  }

  it('aplica defaults indTraslado=1 e includePrices=true', async () => {
    const dto = (await pipe.transform(validPayload(), {
      type: 'body',
      metatype: CreateDispatchGuideDto,
    })) as CreateDispatchGuideDto;

    expect(dto).toBeInstanceOf(CreateDispatchGuideDto);
    expect(dto.indTraslado).toBe('1');
    expect(dto.includePrices).toBe(true);
  });

  it('acepta indTraslado e includePrices explícitos', async () => {
    const dto = (await pipe.transform(
      {
        ...validPayload(),
        indTraslado: '5',
        includePrices: false,
      },
      {
        type: 'body',
        metatype: CreateDispatchGuideDto,
      },
    )) as CreateDispatchGuideDto;

    expect(dto.indTraslado).toBe('5');
    expect(dto.includePrices).toBe(false);
  });

  it('rechaza indTraslado fuera de 1-5 e includePrices no booleano', async () => {
    await expect(
      pipe.transform(
        {
          ...validPayload(),
          indTraslado: '9',
        },
        {
          type: 'body',
          metatype: CreateDispatchGuideDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      pipe.transform(
        {
          ...validPayload(),
          includePrices: 'false',
        },
        {
          type: 'body',
          metatype: CreateDispatchGuideDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
