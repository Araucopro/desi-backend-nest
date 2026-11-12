# Promociones p?blicas del ecommerce

Ampliaci?n aditiva en la rama feats-descuentos-alcance:

- CommerceCatalogVariantDto.promotions publica las ofertas elegibles del canal,
  incluso 2x1 antes de completar un grupo. PricingService y StoreProductService
  reutilizan la misma carga de ofertas que decide el precio y su alcance.
- CommerceQuotedItemDto agrega baseUnitPrice, discount y promotions aplicadas.
  Una l?nea gratis conserva unitPrice=0 y lineTotal=0; no se excluye de la venta.
- La presentaci?n expone ?nicamente offerID, discountType, label, description,
  buyQuantity y payQuantity. No expone tenantID, costos ni permisos de margen.
- El ecommerce agrega un puente servidor de cotizaci?n, etiquetas y participantes,
  y adapta el servicio de pagos para representar fielmente los totales del ERP.

No requiere una migraci?n adicional. La migraci?n de alcance anterior y las
migraciones existentes del canal siguen pendientes de verificar individualmente
para desarrollo y producci?n. No se ejecut? migration:show, ninguna migraci?n ni
un despliegue durante esta ampliaci?n. Antes de iniciar el ERP actualizado,
seguir los nombres, efectos y comandos de [discount-coverage.md](discount-coverage.md).

Orden de publicaci?n: ERP y migraciones verificadas, servicio back del ecommerce,
front del ecommerce. El contrato remoto consultado a?n no contiene esta ampliaci?n.
Los DTOs Swagger de esta rama documentan los nuevos campos; no se guarda OpenAPI local.

Ver la gu?a completa y las comprobaciones de extremo a extremo en
[araucopro-ecommerce/docs/PROMOCIONES-ONLINE.md](../../araucopro-ecommerce/docs/PROMOCIONES-ONLINE.md).

Validaci?n: build, TypeScript y 807 pruebas del ERP (86 suites); 20 pruebas del
frontend ecommerce; 20 del servicio de pagos con simulaci?n HTTP, adem?s de la
revisi?n de navegador de promociones y la regresi?n de consulta de compras.
Esto no acredita migraciones aplicadas ni operaciones contra pagos o stock reales.
