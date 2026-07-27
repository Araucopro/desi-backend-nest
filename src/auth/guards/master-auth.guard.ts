import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MASTER_ROUTE } from '../decorators/master.decorator';

@Injectable()
export class MasterAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      !this.reflector.getAllAndOverride<boolean>(MASTER_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const [, token] = (request.headers.authorization ?? '').split(' ');
    if (!token) throw new UnauthorizedException('Master token required');

    try {
      const secret = process.env.JWT_SECRET;
      const payload = await this.jwt.verifyAsync(token, { secret });
      if (payload.type !== 'master') {
        throw new ForbiddenException('Master token required');
      }
      request.user = payload;
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Invalid master token');
    }
  }
}

