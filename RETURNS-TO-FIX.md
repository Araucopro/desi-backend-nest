El diseño del motor (`engine`) está muy bien fundamentado: mantienes la lógica del dominio desacoplada de NestJS y de la base de datos (funciones puras, fáciles de testear), lo cual es una excelente práctica.

Para optimizar este código dentro de tu arquitectura y alinearlo con los requerimientos tributarios de Chile (SII) y OpenFactura, hay un par de observaciones críticas que debes ajustar:

### 1. El Redondeo del CLP (Peso Chileno)

En Chile, el **Peso Chileno (CLP) no usa decimales**.
En las funciones `toMoney` y en los cálculos de `lineTotal`, usas `Math.round(... * 100) / 100`. Para ventas y notas de crédito locales debes redondear a entero (`roundClp`). Si mantienes decimales, OpenFactura o el SII pueden rechazar el DTE si ven centavos en los montos en CLP.

Solución: Cambiar toMoney de decimales a entero para CLP usando el helper roundClp(value)

---

### 2. Inconsistencia entre `ReturnType.DESCUENTO` y el Código SII

Tu motor maneja `ReturnType.DESCUENTO` calculando el neto/IVA sobre un monto.

- En Chile, una Nota de Crédito por **Descuento/Rebaja** lleva `CodRef: 3` (Corrige Montos) y **no afecta inventario/costos (cogsTotal = 0)**. Tu motor lo hace correctamente devolviendo `items: []` y `cogsTotal: 0`.
- Sin embargo, al enviarlo a OpenFactura, el `CodRef` para un descuento global **debe ser 3**. Asegúrate de mapear `ReturnType.DESCUENTO` a `CodRef = 3` y no a `CodRef = 1` o `2`. (verificar con documentacion en .openfactura)

---

### 3. (Debatible) Asignación del `CodRef` de OpenFactura dentro del Engine

Para hacer el engine más expresivo y facilitar el trabajo al Mapper de OpenFactura, es recomendable calcular cuál será el `CodRef` según el tipo de devolución directamente en `resolveEffectiveDocument` o en `PreparedReturn`:

```typescript
export type EffectiveDocument = {
  requiresNce: boolean;
  documentType: 33 | 39 | null;
  codRef: 1 | 2 | 3 | null; // Agregamos el código de referencia SII
};

export function resolveEffectiveDocument(
  sale: Sale,
  returnType: ReturnType,
): EffectiveDocument {
  // Lógica de tipo de documento...
  let documentType: 33 | 39 | null = null;

  if (sale.dteDocumentID) {
    documentType =
      sale.dteDocument?.documentType === 33 ||
      sale.dteDocument?.documentType === 39
        ? sale.dteDocument.documentType
        : sale.receiver?.rut
          ? 33
          : 39;
  } else if (sale.saleType !== SaleType.NOTA_VENTA) {
    documentType = sale.saleType === SaleType.FACTURA ? 33 : 39;
  } else {
    return { requiresNce: false, documentType: null, codRef: null };
  }

  // Mapeo automático de CodRef según la regla del SII
  let codRef: 1 | 2 | 3 = 2; // Por defecto: Corrige texto/Devolución parcial (2)

  if (returnType === ReturnType.TOTAL) {
    codRef = 1; // Anula Documento de Referencia (1)
  } else if (returnType === ReturnType.DESCUENTO) {
    codRef = 3; // Corrige Montos / Rebaja (3)
  }

  return { requiresNce: true, documentType, codRef };
}
```

---

### 4. Bucle e Iteración en `ReturnType.TOTAL`

En la validación de `ReturnType.TOTAL`, asumes que el cliente enviará en `items` los elementos para validar. Una mejor práctica defensiva si `returnType === TOTAL` es **autogenerar los items** con los saldos restantes si el cliente no envía el arreglo explicitamente, o exigir que coincida exactamente con la diferencia entre el total original y lo ya devuelto.

---

### Mapeo de Arquitectura en tu NestJS

Integrando tu `engine` con la capa de repositorios y mappers, la secuencia de ejecución en tu **Service** se vería así:

```typescript
// sale-returns.service.ts
@Injectable()
export class SaleReturnsService {
  constructor(
    private readonly salesRepo: SalesRepository,
    private readonly returnsRepo: ReturnsRepository,
    private readonly openFacturaMapper: OpenFacturaMapper,
    private readonly openFacturaClient: OpenFacturaClient,
  ) {}

  async createReturn(dto: CreateReturnDto) {
    // 1. Cargar Entidades desde Repositorios
    const sale = await this.salesRepo.findById(dto.saleID);
    const activeReturns = await this.returnsRepo.findActiveBySaleId(dto.saleID);

    // 2. Ejecutar Lógica de Dominio con el Engine (Función pura)
    const preparedReturn = validateReturnRequest({
      sale,
      storeID: dto.storeID,
      returnType: dto.returnType,
      items: dto.items,
      discountAmount: dto.discountAmount,
      reason: dto.reason,
      activeReturns,
    });

    const effectiveDoc = resolveEffectiveDocument(sale, dto.returnType);

    // 3. Emitir Nota de Crédito en OpenFactura (si aplica)
    let dteResponse = null;
    if (effectiveDoc.requiresNce) {
      const payload = this.openFacturaMapper.toNcePayload(
        sale,
        preparedReturn,
        effectiveDoc,
      );
      dteResponse = await this.openFacturaClient.emitirNce(payload);
    }

    // 4. Guardar Devolución en Base de Datos vía Repositorio
    return await this.returnsRepo.createWithItems(preparedReturn, dteResponse);
  }
}
```

---

El `ReturnsService` está excelentemente estructurado: gestiona muy bien la atómica operacional mediante transacciones, ataja la concurrencia e idempotencia, maneja el evento de DTE finalizado y separa el flujo con/sin documento electrónico.

Sin embargo, al revisar en detalle la interacción con el `engine`, destacan **tres inconsistencias críticas de consistencia fiscal y de estado** que debes ajustar:

---

### 1. Desfase de Firma en `resolveEffectiveDocument`

En el método `approve` (línea 116) invocaste:

```typescript
const effective = resolveEffectiveDocument(current.sale);
```

Pero en la propuesta del engine (y en la lógica del SII), `resolveEffectiveDocument` necesita saber el tipo de devolución (`returnType`) para determinar el **`CodRef`** adecuado (1 para anulación total, 2 para parcial, 3 para descuento). Si mantienes la llamada con un solo parámetro, te perderás el código de referencia en la capa del DTE.

---

### 2. Bloqueo de Stock en Devoluciones de "Notas de Venta"

En `completeReturnInManager`:

```typescript
if (ret.returnType !== ReturnType.DESCUENTO) {
  for (const item of ret.items ??) {
    await this.inventoryService.applyMovement(manager, { ... });
  }
}

```

- **Problema:** En el método `create`, si la venta original fue una `NOTA_VENTA` (sin DTE), `resolveEffectiveDocument` devuelve `requiresNce: false`.
- Al llamar a `approve`, el servicio entra directo a `completeReturnInManager`, lo cual **devuelve el stock inmediatamente**.
- **Atención:** Si la devolución es de tipo `DESCUENTO`, tu condición `ret.returnType !== ReturnType.DESCUENTO` lo omite correctamente. Pero asegúrate de que si es una Nota de Venta y se devuelve el producto físico, el reingreso al inventario sea exactamente lo esperado por tu modelo de negocio (ej. validar si el producto vuelve defectuoso o a stock vendible).

---

### 3. Asincronía del DTE y Carrera de Estados en `approve`

Cuando `dteService.create(...)` retorna un estado pendiente (ej. `ENVIADO` o `PENDIENTE_ENVIO` a OpenFactura):

1. El método `approve` cambia el estado de la devolución a `ReturnStatus.APROBADA`.
2. Luego, cuando el SII procesa el DTE, se dispara el webhook/listener `onDteFinalized`.
3. El listener ejecuta `completeReturnInManager`, reingresando el inventario y cerrando el ciclo a `COMPLETADA`.

**Punto Ciego:** Si el DTE falla en el SII (estado `RECHAZADO`), la devolución se queda atrapada en `APROBADA` indefinidamente a menos que uses el método `reconcile`. Sería ideal que tu listener `onDteFinalized` o un handler de errores del DTE gestione el caso donde `document.status === DteDocumentStatus.RECHAZADO` para revertir la aprobación o marcarla en un estado de error fiscal.

---

### Ajustes Recomendados en el Service

#### A. Actualizar la llamada a `resolveEffectiveDocument` en `approve` y `completeReturnInManager`:

```typescript
// En approve()
const effective = resolveEffectiveDocument(current.sale, current.returnType);

// En completeReturnInManager()
const requiresNce = resolveEffectiveDocument(
  ret.sale,
  ret.returnType,
).requiresNce;
```

#### B. Pasar el `codRef` al Mapper de DTE:

```typescript
const dteDto = this.returnDteMapperService.mapReturnToNce({
  sale: current.sale,
  ret: current,
  originalDocumentType: effective.documentType!,
  codRef: effective.codRef!, // <-- Asegurar que pase el código SII (1, 2 o 3)
});
```
