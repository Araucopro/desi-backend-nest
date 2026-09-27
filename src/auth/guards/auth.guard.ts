import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MASTER_ROUTE } from '../decorators/master.decorator';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContextService } from '../../multitenant/tenant-context.service';
import { User } from '../../users/entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: any;
}

type SessionUser = Pick<User, 'userID' | 'sessionVersion'>;

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
    private configService: ConfigService,
    private readonly dataSource: DataSource,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
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

    const isMaster = this.reflector.getAllAndOverride<boolean>(MASTER_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isMaster) {
      this.logger.log(
        `Ruta master delegada a MasterAuthGuard | ${request.method} ${request.url}`,
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
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      if (payload.type === 'master') {
        request.user = payload;
      } else if (payload.type !== 'tenant' || !payload.tenantId) {
        throw new UnauthorizedException('Tenant token required');
      } else {
        await this.assertSessionVersion(payload);
        request.user = payload;
      }

      this.logger.log(`Autenticación OK | ${request.method} ${request.url}`);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn(
        `401 por token inválido o expirado | ${request.method} ${request.url}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  /**
   * Un cambio de contraseña (o reset administrativo) incrementa
   * `sessionVersion`, por lo que los tokens emitidos antes quedan inválidos.
   * La consulta corre dentro del contexto tenant para respetar RLS.
   */
  private async assertSessionVersion(payload: JwtPayload): Promise<void> {
    const user = await this.findUserForSession(payload);

    if (!user || user.sessionVersion !== payload.sessionVersion) {
      this.logger.warn(
        `401 por sessionVersion desactualizado | userID=${payload.userId}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async findUserForSession(
    payload: JwtPayload,
  ): Promise<SessionUser | null> {
    const load = (manager: EntityManager) =>
      manager.getRepository(User).findOne({
        where: { userID: payload.userId, tenantID: payload.tenantId },
        select: ['userID', 'sessionVersion'],
      });

    if (this.tenantContext) {
      return this.tenantContext.run(
        {
          tenantId: payload.tenantId,
          userId: payload.userId,
          impersonating: false,
        },
        () => this.tenantContext!.transaction(load),
      );
    }

    return this.dataSource.transaction(load);
  }

  private extractTokenFromHeader(request: FastifyRequest): string | undefined {
    const authorization = request.headers.authorization;
    const [type, token] = authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
