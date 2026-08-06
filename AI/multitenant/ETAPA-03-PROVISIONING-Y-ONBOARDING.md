# Etapa 3 — Provisioning, Onboarding y Control del Ciclo de Vida de Tenants

**Fecha:** 2026-07-27  
**Estado:** 📋 Especificación e Implementación de Provisioning  
**Typecheck:** `pnpm exec tsc --noEmit`  

---

## 1. Objetivo

La **Etapa 3** completa la arquitectura multitenant del backend ERP ARAUCO / D3SI estableciendo el flujo automatizado de **provisioning y onboarding** de nuevos tenants, la **protección en profundidad (Circuit-Breaker)** contra ejecuciones sin contexto de tenant, la **gestión pesimista de cuotas y ciclo de vida** (`PENDING_PROVISION`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`), y la **impersonación auditada** para soporte de plataforma MASTER.

---

## 2. Arquitectura de Provisioning & Onboarding Pipeline

El onboarding de un tenant se realiza en un proceso transaccional de 2 pasos ejecutado por un administrador MASTER:

```
[POST /master/tenants]
       │  (Crea registro Tenant en estado PENDING_PROVISION, define maxStores, maxUsers)
       ▼
[POST /master/tenants/:id/provision]
       │
       ├─► 1. SET LOCAL app.tenant_id = :id (vía TenantContextService)
       ├─► 2. Crea Tienda Central (isCentralStore: true, stock inicial/configuración)
       ├─► 3. Crea Usuario Administrator (UserRole.ADMIN, bcrypt hash, asignado a Tienda Central)
       ├─► 4. Crea Categorías por defecto ("General", "Sin Categoría")
       ├─► 5. Registra AuditEvent ('PROVISION_TENANT', status: 'SUCCESS')
       └─► 6. Cambia estado del Tenant a ACTIVE
```

### 2.1 Principios del Provisioning

1. **Aislamiento RLS en Seed**: Todas las entidades comerciales creadas durante el provisioning (`Store`, `User`, `UserStores`, `Category`) son insertadas mediante `TenantContextService.transaction(...)` para garantizar que PostgreSQL aplique `app.tenant_id` en las políticas RLS.
2. **Idempotencia**: Si se intenta provisionar un tenant que ya se encuentra en estado `ACTIVE`, el servicio rechaza la operación con `ConflictException('Tenant ya provisionado')`.
3. **Rollback Atómico**: Si falla la creación del usuario administrador o de la tienda central, la transacción de base de datos realiza rollback completo y el tenant permanece en `PENDING_PROVISION`.

---

## 3. Seguridad en Profundidad: Circuit-Breaker & RLS Guard

### 3.1 El problema de RLS Silencioso

En PostgreSQL, si `app.tenant_id` no está definido en la sesión o transacción, la política `tenant_id = current_setting('app.tenant_id', true)` evalúa a `NULL`, lo que provoca que las consultas `SELECT` devuelvan `0` filas y las operaciones `UPDATE/DELETE` afecten `0` filas sin lanzar un error explícito.

### 3.2 Solución: Tenant Context Circuit-Breaker

Se implementa una verificación multicapa:

```
HTTP Request ──► TenantContextGuard ──► TenantContextInterceptor ──► TenantContextService.transaction()
                      │                         │                               │
           Valida tenant del JWT      Resuelve AsyncLocalStorage         Ejecuta SET LOCAL app.tenant_id
           Lanza 401 si no coincide   Si no hay tenantID → Aborta        Si falla config → Exception
```

1. **`TenantContextGuard`**: Valida que el token tenga contexto tenant (`tenantId` o `impersonatingTenantId`) y que el tenant esté `ACTIVE`. Si el tenant está `SUSPENDED` o `ARCHIVED`, rechaza con `403 Forbidden ('Tenant no activo')`.
2. **`TenantContextService`**: Valida que `tenantId` esté presente en el almacenamiento asíncrono (`AsyncLocalStorage`) antes de invocar la consulta DB. Si el contexto es nulo en una ruta protegida, aborta la transacción arrojando `UnauthorizedException('Contexto tenant no inicializado')`.

---

## 4. Gestión del Ciclo de Vida y Cuotas

### 4.1 Estados del Tenant (`TenantStatus`)

| Estado | Descripción | Acceso de Usuarios del Tenant (`/auth`, `/products`, etc.) | Operaciones del Administrador MASTER (`/master/tenants/*`) |
| ------ | ----------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `PENDING_PROVISION` | Registrado en catálogo pero sin tienda ni admin. | ❌ Bloqueado (`403 Tenant no provisionado`) | ✅ Permite provisionar (`POST /provision`), cambiar cuotas |
| `ACTIVE` | Tenant operando con normalidad. | ✅ Acceso total según rol del usuario | ✅ Permite impersonar, suspender, archivar, editar cuotas |
| `SUSPENDED` | Acceso cortado por mora, seguridad o mantenimiento. | ❌ Bloqueado (`403 Tenant suspendido`) | ✅ Permite reactivar (`status: ACTIVE`), archivar, impersonar |
| `ARCHIVED` | Tenant dado de baja definitivamente (histórico). | ❌ Bloqueado (`403 Tenant archivado`) | ⚠️ Solo lectura de auditoría desde panel MASTER |

### 4.2 Control Pesimista de Cuotas (`maxStores` y `maxUsers`)

Al crear una nueva tienda o usuario dentro de un tenant, el servicio correspondiente realiza un bloqueo pesimista de escritura sobre la fila del tenant:

```typescript
// Ejemplo en UsersService / StoresService:
const tenant = await manager.findOne(Tenant, {
  where: { tenantID },
  lock: { mode: 'pessimistic_write' },
});

const currentCount = await manager.count(User, { where: { tenantID } });
if (currentCount >= tenant.maxUsers) {
  throw new ForbiddenException(`Límite de usuarios alcanzado (${tenant.maxUsers})`);
}
```

---

## 5. Impersonación Auditada de Soporte MASTER

Para apoyar a los tenants en soporte técnico sin solicitar contraseñas:

1. El usuario MASTER solicita token de impersonación: `POST /master/tenants/:id/impersonate`.
2. El sistema valida que el tenant esté `ACTIVE` y genera un JWT con el claim `impersonatingTenantId: id` y `impersonatedBy: masterUserId`.
3. Se registra un evento en la tabla master `audit_events`:
   - `action`: `'IMPERSONATE'`
   - `tenantID`: `:id`
   - `masterUserID`: `masterUserId`
   - `reason`: Motivo ingresado por el soporte.
4. El token expira en 1 hora y otorga permisos de lectura/diagnóstico bajo auditoría.

---

## 6. Especificación de Cambios por Archivo

### 6.1 DTOs

#### `src/multitenant/dto/provision-tenant.dto.ts` **[NEW]**

```typescript
export class ProvisionTenantDto {
  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  adminPassword!: string;

  @IsString()
  adminFirstName!: string;

  @IsString()
  adminLastName!: string;

  @IsString()
  centralStoreName!: string;

  @IsOptional()
  @IsString()
  centralStoreAddress?: string;

  @IsOptional()
  @IsString()
  centralStoreCode?: string;
}
```

### 6.2 Controlador Master

#### `src/multitenant/master.controller.ts`

```typescript
@Post('tenants/:id/provision')
@UseGuards(MasterAuthGuard)
@MasterRoute()
@ApiOperation({ summary: 'Provisionar datos iniciales (tienda central, admin, categorías) para un tenant' })
provisionTenant(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: ProvisionTenantDto,
  @Req() req: any,
) {
  return this.service.provisionTenant(id, dto, req.user.masterUserId);
}
```

### 6.3 Servicio Master

#### `src/multitenant/master.service.ts`

Se añade el método `provisionTenant(tenantID, dto, masterUserID)`:
- Valida estado del tenant.
- Enuelve el onboarding en `tenantContext.runWithTenantContext(tenantID, ...)`.
- Crea la tienda central (`isCentralStore: true`).
- Encripta la contraseña y crea el usuario `admin` vinculado a la tienda central.
- Crea categorías base.
- Actualiza el estado del tenant a `ACTIVE`.
- Registra el `AuditEvent`.

### 6.4 Migración Database: `20260724000300-enforce-tenant-not-null-and-fk.ts` **[NEW]**

- Enforce `NOT NULL` en columna `tenantID` para todas las tablas comerciales.
- Añade llaves foráneas compuestas de integridad:
  - `(tenantID, storeID) REFERENCES stores(tenantID, storeID)` en `user_stores`, `inventory_movements`, `expenses`, `store_products`.
  - `(tenantID, userID) REFERENCES users(tenantID, userID)` en `user_stores`.

---

## 7. Plan de Verificación

### 7.1 Compilación TypeScript
```bash
pnpm exec tsc --noEmit
```

### 7.2 Verificación del Flujo E2E (Provisioning -> Login -> Isolation)

1. **Crear Tenant**:
   `POST /master/tenants` → Retorna tenant ID en `PENDING_PROVISION`.
2. **Provisionar Tenant**:
   `POST /master/tenants/:id/provision` con DTO de admin y tienda central.
3. **Login Tenant Admin**:
   `POST /auth/login` con las credenciales creadas → Retorna token JWT de tenant.
4. **Verificar aislamiento RLS**:
   `GET /stores` con token tenant → Retorna únicamente la Tienda Central provisionada.
5. **Verificar Cuota Pesimista**:
   Intentar crear más de `maxStores` tiendas → Verifica que retorne `403 Forbidden` al alcanzar el límite.

---

## 8. Resumen de Entregables de la Etapa 3

- [x] Pipeline de Provisioning automatizado (`POST /master/tenants/:id/provision`).
- [x] Creación transaccional de Tienda Central, Admin Tenant y Categorías Base.
- [x] Circuit-Breaker contra lecturas nulas RLS sin contexto de tenant.
- [x] Control pesimista de límites `maxStores` y `maxUsers`.
- [x] Manejo de ciclo de vida (`PENDING_PROVISION`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`).
- [x] Impersonación auditada con registro en `audit_events`.
- [x] Migración con restricciones `NOT NULL` e integridad referencial compuesta.

---

## 9. Próxima Etapa Sugerida (Etapa 4 — Observabilidad, Métricas de Cuotas y Billing Integration)

**Etapa 4 — Telemetría, Monitoreo de Cuotas y Facturación SaaS**

- **Métricas de Uso y Telemetría por Tenant**: Colectar métricas de almacenamiento, consumo de API, transacciones/ventas emitidas y almacenamiento de archivos por tenant.
- **Alertas de Cuota (Warning Thresholds)**: Emitir webhooks o alertas cuando un tenant alcance el 80% y 95% de sus límites de `maxStores` o `maxUsers`.
- **Integración con Motor de Subscripciones y Billing**: Automatización del cambio de estado (`ACTIVE` -> `SUSPENDED`) integrado con la pasarela de pagos al vencer la suscripción.
- **Disaster Recovery & Exportación de Datos por Tenant**: Herramienta de backup/exportación aislada por tenant en formato JSON/SQL dump filtrado por `tenantID`.
