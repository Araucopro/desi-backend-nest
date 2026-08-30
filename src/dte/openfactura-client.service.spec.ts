import { DteDocumentValue } from './dto/get-dte-document-query.dto';
import {
  OpenfacturaClientService,
  OPENFACTURA_DOWNLOAD_TIMEOUT_MS,
  OPENFACTURA_TIMEOUT_MS,
} from './openfactura-client.service';

describe('OpenfacturaClientService', () => {
  const mockConfigService = {
    get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({ TOKEN: 'token-1', PDF: 'base64-pdf' }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds /v2/dte/document/{token}/{value} with the requested value and extended timeout', async () => {
    const client = new OpenfacturaClientService(mockConfigService as any);
    const callSpy = jest.spyOn(client, 'callOpenfactura');

    const result = await client.getOpenfacturaDocument(
      'apikey-test',
      'tok-en',
      DteDocumentValue.PDF,
      OPENFACTURA_DOWNLOAD_TIMEOUT_MS,
    );

    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://dev-api.haulmer.com/v2/dte/document/tok-en/pdf',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ apikey: 'apikey-test' }),
      }),
    );
    expect(callSpy).toHaveBeenCalledWith(
      'https://dev-api.haulmer.com/v2/dte/document/tok-en/pdf',
      expect.objectContaining({ method: 'GET' }),
      OPENFACTURA_DOWNLOAD_TIMEOUT_MS,
    );
  });

  it('defaults to json with the standard 15s timeout for reconcile/create flows', async () => {
    const client = new OpenfacturaClientService(mockConfigService as any);
    const callSpy = jest.spyOn(client, 'callOpenfactura');

    const result = await client.getOpenfacturaDocument('apikey-test', 'tok-en');

    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://dev-api.haulmer.com/v2/dte/document/tok-en/json',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(callSpy).toHaveBeenCalledWith(
      'https://dev-api.haulmer.com/v2/dte/document/tok-en/json',
      expect.objectContaining({ method: 'GET' }),
      OPENFACTURA_TIMEOUT_MS,
    );
  });

  it('reports Openfactura errors with detail and does not throw', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ message: 'boom' }),
    });

    const client = new OpenfacturaClientService(mockConfigService as any);
    const result = await client.getOpenfacturaDocument(
      'apikey-test',
      'tok-en',
      DteDocumentValue.STATUS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorDetail).toContain('estado 500');
      expect(result.errorDetail).toContain('boom');
    }
  });
});
