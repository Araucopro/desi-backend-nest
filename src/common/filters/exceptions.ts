import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AbstractHttpAdapter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  isUniqueViolation,
  resolveDbConstraint,
  resolveDbErrorCode,
} from '../utils/db-errors.util';

interface IErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  /** Correlaciona la respuesta con la línea de log del backend. */
  requestId?: string;
  data: undefined;
}

/** Contexto mínimo que la app adjunta al request y usamos para el log. */
interface RequestWithContext extends FastifyRequest {
  requestId?: string;
  tenantId?: string;
  user?: { userId?: string; id?: string; masterUserId?: string };
}

/** Status que se registran en nivel `warn`; el ruido de 401/403/404 se omite. */
const WARN_STATUSES = new Set<number>([
  HttpStatus.CONFLICT,
  HttpStatus.UNPROCESSABLE_ENTITY,
]);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapter: AbstractHttpAdapter) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<RequestWithContext>();

    let status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal Server Error';
    let error: string = 'InternalServerError';

    if (exception instanceof QueryFailedError) {
      // No se expone `exception.message`: filtra el SQL, el nombre del índice y
      // el de la tabla a un cliente externo. El detalle vive solo en el log.
      if (isUniqueViolation(exception)) {
        status = HttpStatus.CONFLICT;
        error = 'Conflict';
        message = 'El recurso ya existe o viola una restricción de unicidad';
      } else {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
        error = 'QueryFailedError';
        message =
          'La operación no pudo completarse por una restricción de datos';
      }

      this.logQueryFailure(exception, req);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        message = response;
        error = exception.name.replace(/Exception$/, '');
      } else {
        const httpResponse = response as Record<string, string>;
        message = httpResponse.message ?? 'An HTTP error occurred.';
        error = httpResponse.error ?? exception.name.replace(/Exception$/, '');
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled exception | ${this.describeRequest(req)}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (WARN_STATUSES.has(status)) {
      this.logger.warn(
        `HTTP ${status} | ${this.describeRequest(req)} | error=${error} | message=${
          Array.isArray(message) ? message.join('; ') : message
        }`,
      );
    }

    const errorResponse: IErrorResponse = {
      statusCode: status,
      message: message,
      error: error,
      data: undefined,
    };

    if (req?.requestId) {
      errorResponse.requestId = req.requestId;
    }

    this.httpAdapter.reply(reply, errorResponse, status);
  }

  /**
   * Registra una violación de integridad con los datos que permiten identificar
   * el invariante exacto. Nunca incluye `query` ni `parameters`, que pueden
   * contener datos personales.
   */
  private logQueryFailure(
    exception: QueryFailedError,
    req: RequestWithContext,
  ): void {
    const code = resolveDbErrorCode(exception);
    const constraint = resolveDbConstraint(exception);
    const table = (exception as { driverError?: { table?: string } })
      ?.driverError?.table;

    this.logger.error(
      [
        'QueryFailedError',
        `code=${code ?? 'unknown'}`,
        `constraint=${constraint ?? 'n/a'}`,
        `table=${table ?? 'n/a'}`,
        this.describeRequest(req),
      ].join(' | '),
      exception.stack,
    );
  }

  private describeRequest(req: RequestWithContext): string {
    const userId =
      req?.user?.userId ?? req?.user?.id ?? req?.user?.masterUserId;

    return [
      `method=${req?.method ?? 'n/a'}`,
      `url=${req?.url ?? 'n/a'}`,
      `tenantID=${req?.tenantId ?? 'n/a'}`,
      `userID=${userId ?? 'n/a'}`,
      `requestId=${req?.requestId ?? 'n/a'}`,
    ].join(' ');
  }
}
