import { InsertEvent } from 'typeorm';
import { tenantContextStorage } from './tenant-context.storage';
import { TenantSubscriber } from './tenant-subscriber';

describe('TenantSubscriber', () => {
  let subscriber: TenantSubscriber;

  beforeEach(() => {
    subscriber = new TenantSubscriber();
  });

  const buildEvent = (
    entity: Record<string, unknown>,
    hasTenantColumn = true,
  ): InsertEvent<Record<string, unknown>> =>
    ({
      metadata: {
        hasColumnWithPropertyPath: jest.fn().mockReturnValue(hasTenantColumn),
      },
      entity,
    }) as unknown as InsertEvent<Record<string, unknown>>;

  it('asigna tenantID desde el contexto cuando la entidad no lo trae', () => {
    const event = buildEvent({ name: 'Cliente' });

    tenantContextStorage.run(
      { tenantId: 'tenant-123', impersonating: false },
      () => subscriber.beforeInsert(event),
    );

    expect(event.entity.tenantID).toBe('tenant-123');
  });

  it('no sobrescribe un tenantID ya asignado', () => {
    const event = buildEvent({ tenantID: 'tenant-existente', name: 'Cliente' });

    tenantContextStorage.run(
      { tenantId: 'tenant-123', impersonating: false },
      () => subscriber.beforeInsert(event),
    );

    expect(event.entity.tenantID).toBe('tenant-existente');
  });

  it('ignora entidades sin columna tenantID (tablas master)', () => {
    const event = buildEvent({ name: 'Tenant' }, false);

    tenantContextStorage.run(
      { tenantId: 'tenant-123', impersonating: false },
      () => subscriber.beforeInsert(event),
    );

    expect(event.entity.tenantID).toBeUndefined();
  });

  it('no falla cuando no hay contexto tenant activo', () => {
    const event = buildEvent({ name: 'Cliente' });

    expect(() => subscriber.beforeInsert(event)).not.toThrow();
    expect(event.entity.tenantID).toBeUndefined();
  });
});
