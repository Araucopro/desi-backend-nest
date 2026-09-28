import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AbstractHttpAdapter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './exceptions';

type ReplyPayload = {
  statusCode: number;
  message: string | string[];
  error: string;
  requestId?: string;
  data: undefined;
};

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let reply: jest.Mock;
  let httpAdapter: AbstractHttpAdapter;

  const buildHost = (request: Record<string, unknown> = {}) =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({}),
        getRequest: () => ({
          method: 'POST',
          url: '/cash-registers/abc/sessions/open',
          requestId: 'req-123',
          tenantId: 'tenant-1',
          user: { userId: 'user-1' },
          ...request,
        }),
      }),
    }) as never;

  const lastPayload = (): ReplyPayload =>
    reply.mock.calls[reply.mock.calls.length - 1][1] as ReplyPayload;

  const uniqueViolation = () =>
    new QueryFailedError(
      'INSERT INTO "CashRegisterSession" (...) VALUES (...)',
      [],
      Object.assign(
        new Error('duplicate key value violates unique constraint'),
        {
          code: '23505',
          constraint: 'IDX_unique_open_session_per_register',
          table: 'CashRegisterSession',
        },
      ),
    );

  beforeEach(() => {
    jest.restoreAllMocks();
    reply = jest.fn();
    httpAdapter = { reply } as unknown as AbstractHttpAdapter;
    filter = new AllExceptionsFilter(httpAdapter);
  });

  it('no expone el mensaje crudo del driver en una violación de unicidad', () => {
    filter.catch(uniqueViolation(), buildHost());

    const payload = lastPayload();
    expect(payload.statusCode).toBe(HttpStatus.CONFLICT);
    expect(payload.message).not.toContain('CashRegisterSession');
    expect(payload.message).not.toContain('INSERT INTO');
    expect(payload.message).not.toContain(
      'IDX_unique_open_session_per_register',
    );
  });

  it('registra code, constraint, url y tenantID en el log', () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    filter.catch(uniqueViolation(), buildHost());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line] = errorSpy.mock.calls[0];
    expect(String(line)).toContain('code=23505');
    expect(String(line)).toContain(
      'constraint=IDX_unique_open_session_per_register',
    );
    expect(String(line)).toContain('url=/cash-registers/abc/sessions/open');
    expect(String(line)).toContain('tenantID=tenant-1');
    expect(String(line)).toContain('requestId=req-123');
  });

  it('mapea 23505 a 409 y otras violaciones de integridad a 422', () => {
    filter.catch(uniqueViolation(), buildHost());
    expect(lastPayload().statusCode).toBe(HttpStatus.CONFLICT);

    const foreignKey = new QueryFailedError(
      'INSERT INTO "CashRegisterSession" (...) VALUES (...)',
      [],
      Object.assign(new Error('violates foreign key constraint'), {
        code: '23503',
        constraint: 'FK_cash_register_session_register',
      }),
    );
    filter.catch(foreignKey, buildHost());

    expect(lastPayload().statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('incluye requestId en la respuesta de error para correlacionar con el log', () => {
    filter.catch(uniqueViolation(), buildHost());

    expect(lastPayload().requestId).toBe('req-123');
  });

  it('deja un 4xx intencional intacto y sin log de error', () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    filter.catch(
      new HttpException('Sesión no encontrada', HttpStatus.NOT_FOUND),
      buildHost(),
    );

    const payload = lastPayload();
    expect(payload.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(payload.message).toBe('Sesión no encontrada');
    expect(errorSpy).not.toHaveBeenCalled();
    // 404 no genera ruido: solo 409 y 422 se registran como warning.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('registra los 409 con nivel warn', () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    filter.catch(
      new HttpException('Conflicto de caja', HttpStatus.CONFLICT),
      buildHost(),
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('HTTP 409');
  });
});
