# Pool de PostgreSQL: bloqueo del ERP

## Defecto reproducido y corregido

El catalogo abre una transaccion en StoreProductService.getStoreInventory.
OfferService.getApplicableOffersForItems recibia su EntityManager, pero consultaba
las ofertas con el repositorio global. Esto requeria otra conexion mientras la
primera seguia ocupada. Con un pool lleno de peticiones en ese estado, todas
podian esperar otra conexion; el login usa el mismo pool y tambien esperaba.

La reproduccion de solo lectura, con un pool privado de una conexion, fallo antes
con timeout de adquisicion y paso despues de usar el manager recibido. Esto
confirma el defecto, pero sin logs y metricas de Railway durante el incidente no
confirma que fuera la unica causa del cuelgue reportado.

Tambien se propaga el manager de la venta a PricingService.calculateCart, ofertas,
categorias, validacion de descuento manual y lectura del cliente. Las formulas de
precios y descuentos siguen usando los mismos motores. No se cambia el contrato
HTTP, la autenticacion ni el aislamiento por tenant. Las consultas de categorias
y ofertas mantienen el contexto RLS de la transaccion del llamador.

## Logs aportados del incidente del 15 de octubre

- 19:23-19:27 UTC: cientos de GET /internal/commerce/catalog pendientes y 499.
- 19:35-19:37 UTC: /auth/login y /master/login tambien entran sin respuesta.
- 19:39:08 UTC: al reiniciar la API, PostgreSQL registra diez conexiones cortadas
  con transacciones abiertas. Coincide con el maximo habitual de diez del pool.
- Tras el reinicio: la API arranca y /internal/commerce/context devuelve 200.

Esto refuerza la hipotesis de agotamiento circular del pool reproducida en codigo.
El EOF no prueba por si solo la ausencia de COMMIT/ROLLBACK: una transaccion cuyo
callback espera otra conexion tampoco llega al cierre gestionado por TypeORM.
No se capturo pg_stat_activity durante el bloqueo para confirmar cada conexion.

La compilacion de validacion del ecommerce termino a las 19:24 UTC, dentro de la
ventana de peticiones. Pudo amplificar el trafico; los logs compartidos no incluyen
IP/identidad del cliente para atribuirle todas las solicitudes. El ecommerce tenia
generacion estatica de una ficha por producto y lecturas repetidas del catalogo.
El timeout con AbortSignal tambien opta fuera de la deduplicacion automatica de
fetch de la version instalada de Next. Se corrigio el ecommerce para generar las
fichas remotas al visitarlas y compartir explicitamente lecturas simultaneas.
La validacion con 200 productos simulados hizo un GET de catalogo en el build y
un GET compartido al abrir diez fichas en paralelo. Ese cambio complementa la
correccion del ERP; no sustituye reutilizar correctamente sus transacciones.

## Configuracion de runtime

Los defaults aplican tanto con DATABASE_URL como con las variables PG separadas:

| Variable                       | Default       | Uso                                                     |
| ------------------------------ | ------------- | ------------------------------------------------------- |
| PG_POOL_MAX                    | 10            | Maximo de conexiones por replica de la API              |
| PG_CONNECTION_TIMEOUT_MS       | 5000          | Espera para adquirir/conectar una conexion              |
| PG_IDLE_TIMEOUT_MS             | 30000         | Cierre de conexiones inactivas del pool                 |
| PG_STATEMENT_TIMEOUT_MS        | 30000         | PostgreSQL cancela una consulta que tarda mas           |
| PG_LOCK_TIMEOUT_MS             | 10000         | PostgreSQL cancela una consulta esperando locks         |
| PG_IDLE_TRANSACTION_TIMEOUT_MS | 60000         | Cierra una sesion con transaccion abandonada e inactiva |
| PG_APP_NAME                    | araucopro-api | Identifica las sesiones en pg_stat_activity             |

Los tres timeouts SQL aceptan cero para deshabilitarlos deliberadamente.
Consultas de reportes que de verdad requieran mas de 30 segundos necesitan revisar
su plan y ajustar PG_STATEMENT_TIMEOUT_MS segun la medicion. Estos defaults son
para las sesiones de la API; el datasource CLI de migraciones no cambia.

Se conserva el tamano habitual del pool; aumentar conexiones sin corregir las
adquisiciones anidadas solo posterga la saturacion. TypeORM administra el release
en sus transacciones: no hay que llamar client.release manualmente sobre ellas.

## Verificacion reproducible de solo lectura

Desde la raiz del backend, con DATABASE_URL accesible en .env:

    npm run build
    node --env-file=.env scripts/check-pool-readonly.cjs

La comprobacion crea su propio pool de una conexion, consulta ofertas de un
tenant/tienda ficticios, confirma que catalogo y carrito reutilizan la conexion,
fuerza un statement_timeout mediante pg_sleep y comprueba que el pool vuelve a
responder. Todas sus sesiones son read-only. No crea ventas, modifica stock,
aplica migraciones, recrea esquemas ni cancela sesiones ajenas.

## Despliegue y evidencia pendiente

1. Subir esta correccion en la rama de trabajo y llevarla a multitenant, la rama
   de desarrollo que despliega el ERP. No hace falta una nueva migracion.
2. Reimplantar el backend y comprobar login master, catalogo y una venta de prueba
   autorizada. El presente cambio por si solo no habilita ventas de un canal.
3. Capturar logs de API y PostgreSQL del 15 de octubre alrededor de las 19:06 UTC,
   el warning del servicio db multitenant y CPU/memoria/conexiones. Los IDs de
   deployment de Railway no son necesariamente SHAs de commits Git.
4. Ante otra espera, capturar pg_stat_activity y pg_blocking_pids antes de
   reiniciar. Registrar pool ocupado, conexiones esperando y edad de transaccion;
   un reinicio borra la evidencia de una espera en el pool de la aplicacion.

No se encontro uso directo de client.query sin await en el runtime revisado; las
llamadas directas encontradas pertenecen al arnes de pruebas. El warning historico
sobre consultas simultaneas no puede atribuirse a una linea actual sin su stack.

Referencias: [node-postgres pool](https://node-postgres.com/apis/pool),
[timeouts del cliente](https://node-postgres.com/apis/client).
