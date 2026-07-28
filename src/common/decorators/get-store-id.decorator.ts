import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { STORE_ID_HEADER } from '../../multitenant/multitenant.constants';

export const GetStoreId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return (
      (request.storeId as string) ||
      (request.headers[STORE_ID_HEADER] as string) ||
      (request.params?.storeID as string) ||
      (request.body?.storeID as string)
    );
  },
);
