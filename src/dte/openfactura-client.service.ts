import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateDteDocumentDto } from './dto/create-dte-document.dto';
import { DteDocumentValue } from './dto/get-dte-document-query.dto';

export const OPENFACTURA_TIMEOUT_MS = 15_000;
export const OPENFACTURA_DOWNLOAD_TIMEOUT_MS = 60_000;

const BINARY_RESPONSE_KEYS = ['XML', 'TIMBRE'];

export type OpenfacturaDocumentResponse = {
  TOKEN?: string;
  FOLIO?: number;
  PDF?: number;
  XML?: number;
  token?: string;
  folio?: number;
  status?: string;
  [key: string]: unknown;
};

export type OpenfacturaCallResult =
  | {
      ok: true;
      payload: OpenfacturaDocumentResponse;
    }
  | {
      ok: false;
      errorDetail: string;
      token?: string;
      folio?: number;
    };

@Injectable()
export class OpenfacturaClientService {
  private readonly logger = new Logger(OpenfacturaClientService.name);

  constructor(private readonly configService: ConfigService) {}

  maskApikey(apikey: string): string {
    if (apikey.length <= 8) return '****';
    return `${apikey.slice(0, 4)}...${apikey.slice(-4)}`;
  }

  createOpenfacturaDocument(
    apikey: string,
    idempotencyKey: string | null,
    dto: CreateDteDocumentDto,
  ): Promise<OpenfacturaCallResult> {
    const baseUrl = this.configService.get<string>(
      'OPENFACTURA_BASE_URL',
      'https://dev-api.haulmer.com',
    );
    const url = `${baseUrl.replace(/\/$/, '')}/v2/dte/document`;
    this.logger.log(`Enviando documento a Openfactura | url=${url}`);

    return this.callOpenfactura(url, {
      method: 'POST',
      headers: {
        apikey,
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(dto),
    });
  }

  getOpenfacturaDocument(
    apikey: string,
    token: string,
    value: DteDocumentValue = DteDocumentValue.JSON,
    timeoutMs: number = OPENFACTURA_TIMEOUT_MS,
  ): Promise<OpenfacturaCallResult> {
    const baseUrl = this.configService.get<string>(
      'OPENFACTURA_BASE_URL',
      'https://dev-api.haulmer.com',
    );
    const url = `${baseUrl.replace(/\/$/, '')}/v2/dte/document/${encodeURIComponent(
      token,
    )}/${encodeURIComponent(value)}`;
    this.logger.log(
      `Consultando documento en Openfactura | url=${url} | value=${value}`,
    );

    return this.callOpenfactura(
      url,
      {
        method: 'GET',
        headers: {
          apikey,
          accept: 'application/json',
        },
      },
      timeoutMs,
    );
  }

  anularDte52(
    apikey: string,
    folio: number,
    fecha: string,
  ): Promise<OpenfacturaCallResult> {
    const baseUrl = this.configService.get<string>(
      'OPENFACTURA_BASE_URL',
      'https://dev-api.haulmer.com',
    );
    const url = `${baseUrl.replace(/\/$/, '')}/v2/dte/anularDTE52`;
    this.logger.log(
      `Anulando guía de despacho en Openfactura | url=${url} | Folio=${folio} | Fecha=${fecha}`,
    );

    return this.callOpenfactura(url, {
      method: 'POST',
      headers: {
        apikey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ Dte: 52, Folio: folio, Fecha: fecha }),
    });
  }

  async callOpenfactura(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    },
    timeoutMs: number = OPENFACTURA_TIMEOUT_MS,
  ): Promise<OpenfacturaCallResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: OpenfacturaDocumentResponse = {};

      if (text) {
        try {
          payload = JSON.parse(text) as OpenfacturaDocumentResponse;
        } catch {
          payload = { status: response.status.toString() };
        }
      }

      if (!response.ok) {
        const detailBody = this.formatJson(payload) || text.trim();
        const detail = `Openfactura respondió con estado ${response.status}${
          detailBody ? `: ${detailBody}` : ''
        }`;
        this.logger.error(
          `Openfactura respondió error | url=${url} | detail=${detail}`,
        );
        return {
          ok: false,
          errorDetail: detail,
          token: payload.TOKEN ?? payload.token,
          folio: payload.FOLIO ?? payload.folio,
        };
      }

      this.logger.log(
        `Openfactura respondió OK | url=${url} | TOKEN=${
          payload.TOKEN ?? payload.token ?? 'none'
        } | FOLIO=${payload.FOLIO ?? payload.folio ?? 'none'} | status=${
          payload.status ?? 'none'
        }`,
      );
      return { ok: true, payload };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      const detail = aborted
        ? `Timeout llamando a Openfactura (${timeoutMs} ms)`
        : `Error de red llamando a Openfactura: ${
            error instanceof Error ? error.message : String(error)
          }`;
      this.logger.error(
        `Openfactura no respondió | url=${url} | detail=${detail}`,
      );
      return { ok: false, errorDetail: detail };
    } finally {
      clearTimeout(timer);
    }
  }

  private formatJson(payload: OpenfacturaDocumentResponse): string {
    try {
      const safePayload = Object.fromEntries(
        Object.entries(payload).filter(
          ([key]) => !BINARY_RESPONSE_KEYS.includes(key),
        ),
      );
      return JSON.stringify(safePayload) ?? '';
    } catch {
      return '';
    }
  }
}
