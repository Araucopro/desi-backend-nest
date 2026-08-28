import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantAbility } from '../ability/ability.factory';

export const GetAbility = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantAbility | undefined =>
    ctx.switchToHttp().getRequest().ability as TenantAbility | undefined,
);
