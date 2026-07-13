**Problemas detectados que impactan directamente la migración a multi tentant**

1. `synchronize: true` en `database.module.ts` — incompatible con multi-tenancy, destruye esquemas al arrancar
2. `EntityManager` inyectado directamente en `ProductsService` — bypasea cualquier scope de tenant
3. `dataSource.manager.findOne()` directo en `PricingService`, `InventoryService` — queries globales sin scope
4. `@Public()` en `SeedController` — endpoint destructivo sin autenticación
5. Ninguna entidad tiene discriminador de tenant; todas las queries son globales
6. Entidades con `schema: 'public'` hardcodeado (`Store`, `User`, `UserStore`, `Expense`)

---

## Decisión arquitectónica: Schema-per-tenant vs Row-level

| Criterio          | Row-level (`tenantID` en cada tabla)                  | Schema-per-tenant (PostgreSQL schemas)            |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Aislamiento       | Bajo — un `WHERE` olvidado filtra cross-tenant        | Alto — imposible cruzar schemas sin intención     |
| Complejidad impl. | Media — 15+ entidades a modificar + todos los queries | Alta — setup inicial complejo, luego transparente |
| Costo operativo   | Bajo                                                  | Medio (migrar cada schema al hacer deploy)        |
| Escalabilidad     | Degradación con volumen                               | Particionable por schema                          |
| Backup por tenant | Imposible directo                                     | `pg_dump -n tenant_x`                             |
| TypeORM support   | Nativo                                                | Requiere `search_path` dinámico via `QueryRunner` |

**Recomendación: Schema-per-tenant.** Row-level en un codebase de este tamaño, con `DataSource` directo disperso en 7 servicios, garantiza fugas de datos tarde o temprano. Schema-per-tenant hace que el aislamiento sea estructural, no dependiente de disciplina de código.

---

## Plan de migración — 6 fases

### Fase 0 — Estabilización (bloqueante, hacer antes que nada)

**0.1 — Eliminar `synchronize` y migrar a TypeORM migrations**

```typescript
// database.module.ts — cambiar:
synchronize: false,
migrationsRun: true,
migrations: [__dirname + '/../migrations/**/*{.ts,.js}'],
```

Generar migración inicial del estado actual:

```bash
pnpm typeorm migration:generate src/migrations/InitialSchema
```

Esto produce la snapshot base. Cada tenant nuevo ejecutará estas mismas migrations contra su schema.

**0.2 — Asegurar SeedController**

```typescript
// seed.controller.ts — eliminar @Public(), agregar:
@Roles(UserRole.ADMIN)
@Get()
executeSeed() { ... }
```

En producción multi-tenant el seed no debe existir o debe operar por tenant con autenticación de master admin.

**0.3 — Auditar y centralizar acceso a DataSource**

Todos estos servicios usan `dataSource.transaction()` o `dataSource.manager` directamente:

- `SalesService`, `PurchaseOrdersService`, `TransfersService`
- `InventoryService`, `StoreProductService`, `PricingService`
- `ProductsService` (vía `EntityManager` inyectado)

En Fase 3 se reemplazarán por un `TenantDataSource` wrapper. Por ahora solo documentar los puntos de acceso.

---

### Fase 1 — Modelo de Tenant y Master Admin

Crear schema `master` separado del `public`. Todas las entidades de negocio se moverán a schemas de tenant; `master` solo contiene la tabla de tenants y usuarios maestros.

**Estructura de archivos nuevos:**

```
src/
├── master/
│   ├── entities/
│   │   ├── tenant.entity.ts
│   │   └── master-user.entity.ts
│   ├── dto/
│   │   ├── create-tenant.dto.ts
│   │   └── create-master-user.dto.ts
│   ├── master-tenants.controller.ts
│   ├── master-users.controller.ts
│   ├── master.module.ts
│   └── master-auth.guard.ts
└── tenant/
    ├── tenant-context.ts          ← AsyncLocalStorage
    ├── tenant-datasource.ts       ← wrapper para queries con search_path
    ├── tenant-resolution.middleware.ts
    └── tenant.module.ts
```

**`tenant.entity.ts`:**

```typescript
@Entity({ name: 'tenants', schema: 'master' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  tenantID: string;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  slug: string; // usado para nombrar el schema: t_${slug}

  @Column({ unique: true })
  dbSchema: string; // "t_acme", "t_company_b"

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'enum', enum: TenantPlan, default: TenantPlan.BASIC })
  plan: TenantPlan;

  @CreateDateColumn()
  createdAt: Date;
}
```

**`master-user.entity.ts`:**

```typescript
@Entity({ name: 'master_users', schema: 'master' })
export class MasterUser {
  @PrimaryGeneratedColumn('uuid')
  masterUserID: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string; // bcrypt

  @Column({ type: 'enum', enum: MasterRole })
  role: MasterRole; // SUPER_ADMIN | SUPPORT
}
```

**JWT payload — dos tipos distintos, nunca intercambiables:**

```typescript
// Token de master admin
interface MasterJwtPayload {
  type: 'master';
  masterUserID: string;
  role: MasterRole;
}

// Token de usuario de tenant (extiende el actual)
interface TenantJwtPayload {
  type: 'tenant';
  userID: string;
  tenantID: string;
  tenantSchema: string; // "t_desi"
  role: UserRole;
}
```

---

### Fase 2 — Gestión de schemas de tenant

**`tenant-schema.service.ts`:**

```typescript
@Injectable()
export class TenantSchemaService {
  constructor(private readonly dataSource: DataSource) {}

  async provisionTenant(tenant: Tenant): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();

    try {
      // 1. Crear schema
      await runner.query(`CREATE SCHEMA IF NOT EXISTS "${tenant.dbSchema}"`);

      // 2. Ejecutar todas las migrations de negocio en el schema nuevo
      await runner.query(
        `SET search_path = "${tenant.dbSchema}", master, public`,
      );
      await this.runTenantMigrations(runner, tenant.dbSchema);

      // 3. Crear la tienda central del tenant automáticamente
      await this.seedCentralStore(runner, tenant);
    } finally {
      await runner.release();
    }
  }

  async deprovisionTenant(tenant: Tenant): Promise<void> {
    // Soft: marcar como inactivo
    // Hard: DROP SCHEMA "${tenant.dbSchema}" CASCADE — solo con confirmación explícita
  }

  private async runTenantMigrations(
    runner: QueryRunner,
    schema: string,
  ): Promise<void> {
    // Ejecutar las mismas migrations generadas en Fase 0
    // contra el schema específico del tenant
    const migrations = await this.dataSource.driver.createSchemaBuilder();
    // ... lógica de ejecución de migrations por schema
  }
}
```

**Naming convention para schemas:**

- Schema de tenant: `t_{slug}` donde slug es alfanumérico, máx 30 chars
- Schema master: `master`
- Nunca usar `public` para datos de negocio

---

### Fase 3 — Context propagation y TenantDataSource

Este es el cambio más invasivo. Reemplaza todos los accesos directos a `DataSource`.

**`tenant-context.ts`:**

```typescript
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantID: string;
  schema: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getCurrentTenantContext(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx)
    throw new ForbiddenException('No tenant context in current execution');
  return ctx;
}
```

**`tenant-datasource.ts`:**

```typescript
@Injectable()
export class TenantDataSource {
  constructor(private readonly dataSource: DataSource) {}

  async transaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    const ctx = getCurrentTenantContext();
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      // Aísla todas las queries al schema del tenant actual
      await runner.query(
        `SET LOCAL search_path = "${ctx.schema}", master, public`,
      );
      const result = await fn(runner.manager);
      await runner.commitTransaction();
      return result;
    } catch (e) {
      await runner.rollbackTransaction();
      throw e;
    } finally {
      await runner.release();
    }
  }

  async getManager(): Promise<EntityManager> {
    const ctx = getCurrentTenantContext();
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path = "${ctx.schema}", master, public`);
    return runner.manager;
  }
}
```

**Impacto en servicios existentes — patrón de sustitución:**

```typescript
// ANTES (SalesService)
return this.dataSource.transaction(async (manager) => { ... });

// DESPUÉS
return this.tenantDataSource.transaction(async (manager) => { ... });
```

El cambio es mecánico en todos los servicios que usan `dataSource.transaction`. El `manager` resultante ya tiene el `search_path` del tenant seteado.

**`tenant-resolution.middleware.ts`:**

```typescript
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantService: TenantService,
    private readonly jwtService: JwtService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const token = this.extractToken(req);
    if (!token) return next(); // AuthGuard rechazará la request

    const payload = this.jwtService.decode(token) as TenantJwtPayload;

    if (payload?.type === 'tenant') {
      // Validar que el tenant existe y está activo
      const tenant = await this.tenantService.validateAndGet(payload.tenantID);

      // Inyectar contexto en AsyncLocalStorage para toda la cadena de ejecución
      tenantStorage.run(
        { tenantID: tenant.tenantID, schema: tenant.dbSchema },
        () => next(),
      );
    } else {
      next(); // master token no necesita tenant context
    }
  }
}
```

Registrar en `AppModule`:

```typescript
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(TenantResolutionMiddleware)
    .forRoutes('*');
}
```

---

### Fase 4 — Auth Guard unificado

El `AuthGuard` actual solo maneja tokens de tenant. Necesita manejar ambos tipos.

```typescript
@Injectable()
export class UnifiedAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublic(context, this.reflector)) return true;

    const token = extractToken(context);
    const payload = await this.jwtService.verifyAsync(token, { secret: ... });

    if (payload.type === 'master') {
      // Validar MasterUser — no requiere tenant context
      request['masterUser'] = payload;
      return true;
    }

    if (payload.type === 'tenant') {
      // Validar que tenant context fue inyectado por el middleware
      const ctx = tenantStorage.getStore();
      if (!ctx || ctx.tenantID !== payload.tenantID) {
        throw new UnauthorizedException('Tenant context mismatch');
      }
      request['user'] = payload;
      return true;
    }

    throw new UnauthorizedException('Invalid token type');
  }
}
```

**Nuevos decoradores:**

```typescript
export const MasterOnly = () => SetMetadata('masterOnly', true);
export const TenantOnly = () => SetMetadata('tenantOnly', true);
```

---

### Fase 5 — API de Master Admin

```typescript
@MasterOnly()
@ApiTags('Master Admin')
@Controller('master')
export class MasterTenantsController {
  @Post('tenants')
  async createTenant(@Body() dto: CreateTenantDto) {
    // 1. Crear registro en master.tenants
    // 2. Provisionar schema via TenantSchemaService
    // 3. Crear primer admin del tenant
    // 4. Retornar credenciales iniciales
  }

  @Delete('tenants/:id')
  async deprovisionTenant(@Param('id') id: string) {
    // Soft delete primero, hard delete solo con confirmación
  }

  @Get('tenants/:id/stats')
  async getTenantStats(@Param('id') id: string) {
    // Consulta cross-tenant SOLO disponible para master
    // Requiere set search_path explícito al schema del tenant objetivo
  }

  @Post('tenants/:id/impersonate')
  async impersonate(@Param('id') tenantID: string) {
    // Genera JWT temporal de tenant para soporte — auditable
  }
}
```

---

### Fase 6 — Migración de datos existentes

```sql
-- Crear schema master
CREATE SCHEMA IF NOT EXISTS master;

-- Mover tablas master al schema correcto (ejecutar una vez)
-- master_users y tenants son nuevas, no hay nada que mover

-- El tenant inicial = los datos actuales en public
INSERT INTO master.tenants (tenantID, name, slug, dbSchema, isActive)
VALUES (gen_random_uuid(), 'Tenant Original', 'original', 't_original', true);

-- Crear schema para el tenant original
CREATE SCHEMA t_original;

-- Copiar todas las tablas de public a t_original
-- (script de migración por tabla)
INSERT INTO t_original."Store" SELECT * FROM public."Store";
INSERT INTO t_original."Users" SELECT * FROM public."Users";
-- ... resto de tablas

-- Actualizar todos los JWT existentes forzando re-login
-- (cambiar JWT_SECRET o incrementar versión en token)
```

---

## Riesgos y limitaciones críticas

**Riesgo 1 — `SET search_path` no es persistente por conexión en pool**
TypeORM usa un connection pool. `SET search_path` sobre una conexión pooled persiste entre requests si no se resetea. Usar `SET LOCAL search_path` dentro de transacción, o `pg_connection_string` con `search_path` fijo por tenant usando múltiples `DataSource` instances (más costoso pero más seguro).

**Riesgo 2 — TypeORM migrations per-schema**
TypeORM no tiene soporte nativo para ejecutar migrations contra un schema arbitrario. Requiere una instancia de `DataSource` configurada con `schema` del tenant para correr `dataSource.runMigrations()`. Implementar un comando CLI:

```bash
pnpm tenant:migrate --tenant=t_acme
pnpm tenant:migrate --all  # ejecuta en todos los tenants activos
```

**Riesgo 3 — `isCentralStore` como flag booleano**
Actualmente `isCentralStore: true` asume que hay exactamente una tienda central. En multi-tenancy esto se mantiene igual — cada tenant tiene su propia tienda central dentro de su schema. No requiere cambio semántico, solo asegurar que las queries respetan el `search_path`.

**Riesgo 4 — `PricingService.resolveBasePricing` hace fallback a `isCentralStore: true`**

```typescript
// pricing.service.ts línea ~280
store: { isCentralStore: true },
```

Este query sin schema context buscaría en el schema activo por `search_path`. Si el context está bien seteado funciona. Es un punto a validar con tests de integración post-migración.

**Riesgo 5 — N+1 de `calculatePrice` en `findAll`**
`ProductsService.findAll` llama `pricingService.calculatePrice` en un loop por cada `StoreProduct`. En multi-tenancy con 50 tenants esto no escala. Este problema existe hoy pero se amplifica. Debe resolverse con un bulk pricing calculation antes o en paralelo con la migración.

---

## Orden de implementación recomendado

```
Fase 0 → Migrations, seed security, auditoría de DataSource usages
Fase 1 → Tenant entity, MasterUser, JWT payloads
Fase 2 → Schema provisioning, TenantSchemaService, CLI migrations
Fase 3 → AsyncLocalStorage context, TenantDataSource wrapper
Fase 4 → UnifiedAuthGuard, TenantResolutionMiddleware
Fase 5 → Master Admin API
Fase 6 → Migración datos existentes, validación
```

Total estimado: 15-22 días de desarrollo. El cuello de botella real es Fase 3 — el refactor de todos los servicios que usan `DataSource` directamente es la tarea más propensa a regresiones y requiere cobertura de tests antes de ejecutarla.
