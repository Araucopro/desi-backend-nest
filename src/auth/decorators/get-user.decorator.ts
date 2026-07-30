import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../interfaces/jwt-payload.interface';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: JwtPayload | MasterJwtPayload;
}

export const GetUser = createParamDecorator(
  (
    data: keyof JwtPayload | keyof MasterJwtPayload | undefined,
    ctx: ExecutionContext,
  ) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new InternalServerErrorException('User not found in request');
    }

    if (data) {
      return user[data as keyof typeof user];
    }

    return user;
  },
);
