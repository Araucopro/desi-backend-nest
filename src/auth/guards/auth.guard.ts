import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      this.logger.log(
        `Ruta pública permitida | ${request.method} ${request.url}`,
      );
      return true;
    }

    const token = this.extractTokenFromHeader(request);

    if (!token) {
      this.logger.warn(
        `401 por token ausente | ${request.method} ${request.url}`,
      );
      throw new UnauthorizedException('Token not provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      if (payload.type === 'master') {
        request['user'] = payload;
      } else if (payload.type !== 'tenant' || !payload.tenantId) {
        throw new UnauthorizedException('Tenant token required');
      } else {
        request['user'] = payload;
      }

      // We're assigning the payload to the request object here
      // so that we can access it in our route handlers
      request['user'] = payload;
      this.logger.log(`Autenticación OK | ${request.method} ${request.url}`);
    } catch {
      this.logger.warn(
        `401 por token inválido o expirado | ${request.method} ${request.url}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
