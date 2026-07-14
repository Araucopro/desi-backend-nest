import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MESSAGE_KEY } from '../decorators/response-message';

export interface IResponse<T> {
  statusCode: number;
  message: string;
  error: string | null;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  IResponse<T>
> {
  constructor(private reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<IResponse<T>> {
    const customMessage = this.reflector.get<string>(
      MESSAGE_KEY,
      context.getHandler(),
    );

    return next.handle().pipe(
      map((data: T | IResponse<T>) => {
        // Detectar si ya es un IResponse
        if (typeof data === 'object') {
          if ('statusCode' in (data as IResponse<T>)) {
            return data as IResponse<T>;
          }
        }

        return {
          statusCode: 200,
          message: customMessage ?? this.buildDefaultMessage(200),
          error: null,
          data: data as T,
        };
      }),
    );
  }

  private buildDefaultMessage(statusCode: number): string {
    if (statusCode === 201) return 'Recurso creado exitosamente';
    if (statusCode >= 200 && statusCode < 300) return 'Operación exitosa';
    return 'Operación completada';
  }
}
