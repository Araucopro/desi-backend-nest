# RLS: estado real por entorno y brecha documentada

## Qué dicen `AGENTS.md` y `CLAUDE.md`

Ambos documentos describen el aislamiento multitenant como si **Row-Level
Security** estuviera activo sobre todas las tablas de negocio, con
`FORCE ROW LEVEL SECURITY` y `app_runtime` sin `BYPASSRLS`.

## Qué hay realmente en desarrollo

Verificado contra la base de desarrollo:

- solo **3 tablas de RRHH** tienen `relrowsecurity = true`;
- las tablas de negocio (productos, stock, precios, caja, DTE, etc.) **no tienen
  políticas RLS**;
- la aplicación se conecta como **`postgres`**, que es superusuario y por lo tanto
  tiene `BYPASSRLS`. Aun si las políticas existieran, no se aplicarían.

En consecuencia: **en este entorno RLS no aísla nada.** El aislamiento efectivo
hoy depende por completo de que cada servicio filtre por `tenantID`, y de que
`TenantSubscriber` lo asigne al escribir.

## Por qué esto es un riesgo y no un detalle

La diferencia entre entornos es asimétrica en el peor sentido posible:

| Escenario                                            | Con RLS apagado (desarrollo) | Con RLS forzado (producción, si se aplica) |
| ---------------------------------------------------- | ---------------------------- | ------------------------------------------ |
| Query sin `app.tenant_id`                            | Devuelve filas               | Devuelve **0 filas**                       |
| Query con el `EntityManager` fuera de la transacción | Devuelve filas               | Devuelve **0 filas**                       |
| `assertUserCanAccessStore` con el repositorio global | Pasa                         | **403 falso**                              |

Es decir: un bug que en desarrollo es invisible o benigno en producción se
convierte en un fallo funcional. El caso está ya medido: el test de integración
`describe('aislamiento por tenant (RLS)')` fuerza `FORCE ROW LEVEL SECURITY` sobre
las tablas de caja precisamente para reproducir el comportamiento de producción, y
fue lo que detectó que `assertUserCanAccessStore` no podía usar el repositorio
global.

## Decisión

**Opción B, ahora:** dejar constancia explícita de que este entorno **no** tiene
RLS y que el aislamiento se sostiene en la capa de aplicación. No activar RLS en
desarrollo como parte de este plan.

**Opción A, en ticket aparte:** aplicar RLS a las tablas de negocio en todos los
entornos. Es un trabajo de otro tamaño:

1. migración que habilita `ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` por
   tabla — son más de 40 tablas;
2. política `tenant_isolation` por tabla, con `USING` y `WITH CHECK`;
3. rol de runtime `app_runtime` sin `BYPASSRLS` y su cadena de grants;
4. verificar que **todo** acceso pasa por `TenantContextService.transaction()`, y
   que ningún servicio usa el repositorio global antes de abrir la transacción;
5. correr la suite de integración con RLS forzado en todas las tablas, no solo en
   las de caja.

## Regla operativa mientras dure la brecha

Hasta que A esté hecho, en este repositorio se asume que **RLS está forzado en
producción**. Eso implica:

- toda query de negocio corre dentro de `TenantContextService.transaction(...)`;
- toda lectura auxiliar que valide permisos usa el `EntityManager` **recibido**,
  nunca un repositorio global inyectado;
- si un test unitario pasa con repositorios mockeados pero el flujo no respeta lo
  anterior, el test de integración con RLS es el que debe fallar primero.

## Verificación

```powershell
# En desarrollo: confirma que las tablas de negocio no tienen RLS.
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('Product', 'StoreProduct', 'CashRegisterSession', 'DteDocument');

# En el arnés de integración: aplica FORCE RLS sobre las tablas de caja.
# Ver `enableCashRls` en src/test/integration/database.util.ts.
pnpm test:integration
```
