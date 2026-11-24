# Desglose de despacho en pedidos commerce

`GET /internal/commerce/context` anuncia `supportsShipping: true` para que el
ecommerce detecte compatibilidad antes de iniciar un pago con despacho.

`POST /internal/commerce/sales` acepta en el objeto `shipping` existente:

```json
{
  "street": "Calle 123",
  "comuna": "Santiago",
  "region": "Metropolitana",
  "cost": 4877,
  "carrier": "Chilexpress",
  "serviceCode": 3,
  "serviceName": "EXPRESS"
}
```

`payment.amount` conserva el pago completo, productos más despacho. La venta de
productos valida `payment.amount - shipping.cost` con el motor de precios del ERP.
El cargo debe ser entero no negativo y menor que el pago; si es positivo requiere
transportista y servicio. No se modifica la validación de precios ni de stock.

`CommerceOrder.amount` guarda el total pagado y `customerDetails.shipping` guarda
el desglose. La nota de venta y los reportes de productos conservan la mercadería;
no se crea un producto de flete ni un DTE de despacho. Una futura contabilización
o tributación de ese cargo requiere una integración específica. La autenticación
de canal y los permisos de pagos de prueba siguen vigentes.

La idempotencia ya incluye `shipping`: repetir el mismo pago no duplica ventas,
y cambiar el desglose de un pedido confirmado produce conflicto. Las estructuras
persistidas ya son JSON: este cambio no requiere migración. Un pedido antiguo sin
`cost` mantiene el comportamiento anterior.

Verificación local: 31 pruebas de `commerce-sales.service.spec.ts`,
`commerce.controller.spec.ts` y `create-commerce-sale.dto.spec.ts`, más
`tsc --noEmit`. No se probó una escritura en PostgreSQL ni se desplegó esta rama.

Coordinar el despliegue con `CHILEXPRESS_CHECKOUT_ENABLED` del ecommerce y
`NEXT_PUBLIC_CHILEXPRESS_ENABLED` de su frontend. El ecommerce no cobra despacho
si el contexto del ERP no anuncia compatibilidad. La rama se basa en `fa0f1a0`
de `feats-descuentos-alcance`. El 24-11-2026 se verificó que ese commit ya está
incluido en `origin/main` (`f311c87`) y que el remoto ya no tiene `dev`.
El PR se prepara hacia `main`, sin fusionar ni activar un despliegue productivo.
