# Etapa 4 — Telemetría, Monitoreo de Cuotas y Facturación SaaS

**Fecha:** 2026-07-27  
**Estado:** 📋 Especificación e Implementación de Telemetría y Suscripciones  
**Typecheck:** `pnpm exec tsc --noEmit`  

---

## 1. Objetivo

La **Etapa 4** extiende el ecosistema multitenant proporcionando **observabilidad**, **monitoreo en tiempo real de consumo y cuotas**, **gestión de suscripciones/facturación SaaS con vencimientos automáticos**, y **herramientas de backup/exportación de datos aislados por tenant**.

---

## 2. Telemetría y Métricas por Tenant (`GET /master/tenants/:id/metrics`)

Cada tenant registrado genera métricas operativas de uso consumibles desde la superficie MASTER para supervisión técnica y comercial.

### 2.1 Métrica de Recursos y Cuotas

```json
{
  "tenantID": "uuid",
  "name": "Empresa Ejemplo",
  "status": "ACTIVE",
  "usage": {
    "storesCount": 3,
    "maxStores": 5,
    "storesUsagePct": 60.0,
    "usersCount": 4,
    "maxUsers": 5,
    "usersUsagePct": 80.0,
    "warningThresholdReached": true
  },
  "activity": {
    "productsCount": 150,
    "salesThisMonthCount": 1240,
    "totalRevenueThisMonth": 15450000,
    "lastAuditEventAt": "2026-07-27T21:00:00Z"
  },
  "subscription": {
    "plan": "STANDARD",
    "expiresAt": "2026-12-31T23:59:59Z",
    "daysRemaining": 157,
    "autoRenew": true
  }
}
```

---

## 3. Control de Suscripciones y Desconexión Automática

### 3.1 Campos de Suscripción en `Tenant`

- `planType`: `BASIC` | `STANDARD` | `ENTERPRISE` | `CUSTOM`
- `subscriptionExpiresAt`: Timestamp de expiración.
- `autoRenew`: booleano.

### 3.2 Interceptor / Check de Vencimiento

En `TenantContextGuard`, además de verificar que `status === TenantStatus.ACTIVE`, se verifica la vigencia de la suscripción:

```typescript
if (tenant.subscriptionExpiresAt && tenant.subscriptionExpiresAt < new Date()) {
  tenant.status = TenantStatus.SUSPENDED;
  await this.tenantsRepo.save(tenant);
  throw new ForbiddenException('Suscripción vencida. Tenant suspendido automáticamente.');
}
```

---

## 4. Exportación y Backup de Datos por Tenant (`GET /master/tenants/:id/export`)

Permite a los administradores MASTER generar un volcado limpio y aislado de todos los datos comerciales pertenencientes al `tenantID` especificado:

- Datos de la Tienda y Configuración
- Usuarios y Roles
- Productos, Variaciones y Precios
- Movimientos de Inventario e Histórico de Ventas DTE
- Gastos y Metas Mensuales

---

## 5. Especificación de Cambios por Archivo

### 5.1 Entidad `Tenant`
- Se añaden campos `planType`, `subscriptionExpiresAt` y `autoRenew`.

### 5.2 DTOs
- `update-subscription.dto.ts` **[NEW]**: DTO para `PATCH /master/tenants/:id/subscription`.

### 5.3 Servicios y Controladores
- `MasterService.getTenantMetrics(id)`
- `MasterService.updateSubscription(id, dto)`
- `MasterService.exportTenantData(id)`
- `MasterController`: Endpoints `/master/tenants/:id/metrics`, `/master/tenants/:id/subscription` y `/master/tenants/:id/export`.

---

## 6. Plan de Verificación

1. `pnpm exec tsc --noEmit` sin errores.
2. Consulta de métricas `GET /master/tenants/:id/metrics`.
3. Actualización de fecha de vencimiento y verificación de suspensión automática en `TenantContextGuard`.
