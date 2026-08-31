import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantRequestContext {
  tenantId: string;
  timeZone?: string;
  userId?: string;
  masterUserId?: string;
  impersonating: boolean;
}

/**
 * Contexto tenant compartido entre TenantContextService (lo inicializa por
 * request) y TenantSubscriber (lo lee al insertar entidades).
 *
 * Vivir fuera del contenedor de Nest permite registrar el subscriber
 * directamente en TypeORM, que lo instancia sin inyección de dependencias.
 */
export const tenantContextStorage =
  new AsyncLocalStorage<TenantRequestContext>();
