```TS
// Tipo de Documento
// 33: Factura Electrónica
// 34: Factura No Afecta o Exenta Electrónica
// 39: Boleta Electrónica
// 43: Liquidación-Factura Electrónica
// 46: Factura de Compra Electrónica
// 52: Guía de Despacho Electrónica
// 56: Nota de Débito Electrónica
// 61: Nota de Crédito Electrónica
// 110: Factura de Exportación
// 111: Nota de Débito de Exportación
// 112: Nota de Crédito de Exportación
type TipoDTE = 33 | 34 | 39 | 43 | 46 | 52 | 56 | 61 | 110 | 111 | 112;

// Tipo de Despacho
// No se incluye si el documento no acompaña bienes o se trata de una Factura o Nota correspondiente a la prestación de servicios.
// 0: Sin despacho
// 1: Con despacho
type TipoDespacho = 0 | 1;

// Forma de Pago
// 1: Contado
// 2: Crédito
type FmaPago = 1 | 2;

// Medio de Pago (MedioPago)
// Indica la modalidad en que se realizará el pago
// Valores posibles:
// "CH": Cheque
// "CF": Cheque a fecha
// "LT": Letra
// "EF": Efectivo
// "PE": Pago a Cuenta Corriente
// "TC": Tarjeta de Crédito
type MedioPago = "CH"| "CF"| "LT"| "EF"| "PE"| "TC";

// Tipo de Venta para el vendedor:
// 1: Ventas del Giro
// 2: Venta Activo Fijo
// 3: Venta Bien Raíz
type TpoTranVenta = 1 | 2 | 3;

// Código utilizado para los siguientes casos (opcional):
/**
 * a) Nota de Crédito que elimina documento de referencia en forma completa (Factura de venta, Nota de débito, o Factura de compra
 * b) Nota de crédito que corrige un texto del documento de referencia (ver campo Corrección Factura)
 * c) Nota de Débito que elimina una Nota de Crédito en la referencia en forma completa
 * d) Notas de crédito o débito que corrigen montos de otro documento
**/
// 1: Anula Documento de Referencia
// 2: Corrige Texto Documento de Referencia
// 3: Corrige montos
type CodRef = 1 | 2 | 3;

// Indica si la transacción corresponde a la prestación de un servicio
// 1: Factura de servicios periódicos domiciliarios
// 2: Factura de otros servicios periódicos
// 3: Factura de Servicios. (en caso de Factura de Exportación: Servicios calificados como tal por Aduana)

type IndServicio = 1 | 2 | 3;
```
