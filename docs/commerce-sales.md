# Ventas pagadas desde un canal ecommerce

## Alcance

El ERP recibe la confirmacion de un pago ya verificado por el backend del
ecommerce. No recibe notificaciones del proveedor directamente y no conoce las
credenciales de Mercado Pago. El mismo contrato sirve para otros proveedores.

El ERP crea una NOTA_VENTA / CONTADO con el usuario de sistema del tenant,
movimientos de inventario SALE y ledger financiero SALE_NOTE, dentro de una
misma transaccion con el registro de pedido/pago. No requiere caja abierta ni
Haulmer. El nombre visible "Comprobante de venta" sigue siendo presentacion de
la nota en la UI; no se crea un DTE ni un tipo de documento nuevo.

## Activacion explicita

1. Compilar y aplicar la migracion CreateCommerceOrders1791000000000 antes de
   desplegar este codigo. Crea commerce_orders con RLS forzado y agrega dos
   columnas booleanas a commerce_channels. No cambia tablas de ventas o caja.
2. Un master SUPER_ADMIN activa el canal con el endpoint existente:
   PATCH /master/tenants/{tenantID}/commerce-channels/{channelID}
   y cuerpo { "salesEnabled": true }.
3. salesEnabled y acceptTestPayments empiezan en false, tambien para los
   canales existentes. El catalogo y las cotizaciones siguen siendo de lectura.
4. Solo en un tenant/canal dedicado a pruebas puede habilitarse tambien
   acceptTestPayments. Una venta de prueba aceptada modifica stock e ingresos;
   no debe habilitarse ese permiso en un canal comercial.

El tenant y la tienda salen exclusivamente del token del canal. No se aceptan
tenantID ni storeID en el cuerpo. El token vive solo en el backend del ecommerce.

## POST /internal/commerce/sales

Authorization: Bearer <token del canal>

Ejemplo de cuerpo (los UUID y referencias deben ser los reales del pedido):

    {
      "externalOrderID": "web-order-123",
      "items": [
        { "storeProductID": "550e8400-e29b-41d4-a716-446655440000", "quantity": 1 }
      ],
      "receiver": {
        "name": "Cliente Ejemplo",
        "email": "cliente@example.com"
      },
      "phone": "+56912345678",
      "shipping": {
        "street": "Calle de ejemplo 123",
        "comuna": "Temuco",
        "region": "La Araucania"
      },
      "notes": "Entregar por la tarde",
      "payment": {
        "provider": "mercadopago",
        "reference": "identificador-del-pago",
        "status": "approved",
        "amount": 19989,
        "currency": "CLP",
        "paidAt": "2026-10-15T15:00:00Z",
        "isTest": false
      }
    }

receiver requiere nombre y correo; admite RUT, giro, direccion y ciudad. Si no
se mandan address/city se usan shipping.street/comuna. El telefono, region y
comentarios se conservan en customerDetails del pedido. Sin RUT se guarda el
receptor en la nota; no se inventa un cliente registrado. Con RUT se reutiliza
el flujo de ClientsService. Si la tienda exige un cliente registrado, sigue
aplicando esa politica: el checkout debera recoger un RUT valido.

Respuesta 201 con el envoltorio global del ERP:

    {
      "statusCode": 200,
      "message": "Operacion exitosa",
      "error": null,
      "data": {
        "commerceOrderID": "uuid",
        "externalOrderID": "web-order-123",
        "tenantID": "uuid",
        "storeID": "uuid",
        "channelID": "uuid",
        "saleID": "uuid",
        "payment": { "provider": "mercadopago", "reference": "identificador-del-pago", "status": "approved", "amount": 19989, "currency": "CLP", "paidAt": "ISO", "isTest": false },
        "customerDetails": { "phone": "+56912345678", "shipping": {}, "notes": "Entregar por la tarde" },
        "sale": { "saleID": "uuid", "saleType": "NOTA_VENTA", "cashRegisterSessionID": null },
        "dte": null
      }
    }

sale conserva el formato de la venta existente, con receptor, items, folio y
totales. El pago online se guarda en commerce_orders, no en Payment de caja:
no se crea una sesion ficticia ni un movimiento de efectivo. Los ingresos y
costos aparecen mediante el ledger de notas de venta que ya usan los reportes.

## Reintentos, concurrencia y rechazos

- El externalOrderID es estable dentro de tenant/canal. Repetir el mismo cuerpo
  devuelve la misma venta sin volver a mover stock ni ingresos.
- Cambiar el contenido de un pedido registrado responde 409. El hash normaliza
  el orden de las propiedades, el orden de los items y la fecha del pago.
- Un pago (tenant, proveedor, referencia) no puede utilizarse para dos pedidos.
- Locks transaccionales y restricciones unicas protegen pedidos y pagos.
  Los productos se bloquean en orden estable y siempre se exige stock suficiente,
  aunque la tienda permita stock negativo para ventas presenciales.
- 403: canal sin permiso de venta, o pago de prueba no autorizado.
- 404: un producto no pertenece a la tienda del canal.
- 409: total pagado distinto del precio calculado por el ERP, stock insuficiente,
  pago reutilizado o pedido repetido con otro contenido.

Si un pago ya aprobado no puede registrarse, el backend del ecommerce debe
conservarlo para conciliacion/reintento y alertar al operador. No debe mostrar
la venta como sincronizada, descartar el pago ni repetir el cobro. Este endpoint
no reserva stock antes del pago, no almacena cotizaciones historicas y no
procesa tarifas de despacho o comisiones: el monto debe coincidir con los items
calculados por el ERP al confirmar. Si precio o stock cambiaron durante el pago,
se rechaza la operacion para conciliacion.

## GET /internal/commerce/sales/{externalOrderID}

Mismo token y vinculacion tenant/canal/tienda. Devuelve el mismo formato de datos
de la confirmacion. Permite consultar pedidos ya registrados sin reenviar el pago.

## Pendiente en otros repositorios

El adaptador del ecommerce debe enviar la confirmacion y los datos del checkout
a este endpoint, guardar saleID y reintentar con el mismo cuerpo. Su isTest debe
derivarse de la cuenta verificada del proveedor; live_mode por si solo no sirve
para clasificar cuentas ficticias. La UI master debe exponer los nuevos permisos
y la UI del tenant puede mostrar la referencia del pago online.

No se ejecutaron migraciones ni se registro una venta real durante el desarrollo.
