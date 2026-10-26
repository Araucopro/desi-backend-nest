# Fotos opcionales por canal ecommerce

El Master SUPER_ADMIN puede cambiar `requireProductPhoto` al crear o editar un
canal dentro de un tenant. Es una configuracion del canal, no de todos los
comercios ni de todas las tiendas del tenant.

- `true` (valor inicial de canales nuevos y existentes): exige al menos una foto HTTP/HTTPS.
- `false`: permite publicar y cotizar productos sin foto.
- Descripcion y slug son opcionales. Si falta el slug, el catalogo devuelve `producto-{productID}` sin modificar la base de datos. Precio, margen y stock conservan sus validaciones al comprar.

## Contrato

`POST /master/tenants/{tenantID}/commerce-channels` acepta el booleano opcional
`requireProductPhoto`. Si se omite, vale `true`.

`PATCH /master/tenants/{tenantID}/commerce-channels/{channelID}` acepta
`{ "requireProductPhoto": false }` para desactivar y `true` para reactivar.
Si se omite en PATCH, conserva el valor anterior. Rechaza cadenas, numeros y null.
Las respuestas de listado, creacion y actualizacion incluyen el booleano.
Se mantienen la autorizacion de SUPER_ADMIN, el alcance por tenant/canal y el registro de auditoria.

El guard carga el ajuste desde el canal autenticado en cada peticion. El cliente
no puede cambiarlo enviando campos en su cotizacion. `GET /internal/commerce/context`
lo informa. Catalogo y cotizacion aplican la misma politica; al reactivar el
requisito, un carrito anterior con un producto sin foto deja de poder cotizarse.
Las ventas cuyo pago ya fue aprobado conservan el flujo de registro existente.

Si no hay fotos, el catalogo devuelve `image: ""` y la cotizacion `image: null`.
El ecommerce confia en la publicacion del ERP y muestra su imagen provisional
local en catalogo, ficha y carrito. No usa fotos de productos mockeadas.

## Despliegue

La publicacion sin descripcion ni slug no requiere nuevas migraciones. Desplegar
el backend ERP y el frontend ecommerce actualizados. La politica de fotos sigue
usando la columna existente `requireProductPhoto`.

1. Compilar el ERP backend. En Railway, `railway.json` ejecuta las migraciones
   pendientes antes de arrancar, incluida `AddChannelPhotoRequirement1792965600000`.
   Configurar una conexion con permisos de migracion a la misma base del despliegue;
   ver `src/datasource/migrations/README.md`. Fuera de Railway, ejecutar
   `npm run build` y `npm run migration:run` antes de iniciar la API.
2. Desplegar el backend ERP, el frontend ERP y el frontend ecommerce actualizados.
3. Master > empresa > canales ecommerce > editar > Exigir foto para publicar > guardar.

La migracion agrega una columna NOT NULL con DEFAULT true y conserva la politica
anterior de todos los canales. No modifica productos, fotos ni tokens.
Despues del despliegue inicial, cambiar el interruptor no necesita redesplegar;
el ecommerce refleja el ajuste al revalidar su catalogo (cache de hasta 60 segundos).
