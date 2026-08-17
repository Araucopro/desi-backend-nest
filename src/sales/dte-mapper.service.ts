import { BadRequestException, Injectable } from '@nestjs/common';
import { Store } from '../stores/entities/store.entity';
import {
  SalePaymentType,
  SaleReceiver,
  SaleType,
} from './entities/sale.entity';
import {
  CreateDteDocumentDto,
  DteResponseValue,
} from '../dte/dto/create-dte-document.dto';

const TAX_RATE = 0.19;

export type SaleDteInput = {
  saleType: SaleType;
  paymentType: SalePaymentType;
  issueDate: Date;
  receiver: SaleReceiver | null;
  items: Array<{
    productName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  total: number;
  netTotal: number;
  taxTotal: number;
  store: Store;
};

/**
 * Construye el payload Openfactura a partir de una venta ya calculada.
 *
 * - Boleta (39): ítems con precios que incluyen IVA y RUTRecep genérico
 *   `66666666-6`, `IndServicio: '3'` en IdDoc y totales sin `TasaIVA` ni
 *   `MontoPeriodo`.
 * - Factura (33): ítems netos y receptor obligatorio con RUT válido.
 */
@Injectable()
export class DteMapperService {
  private toInteger(value: number): number {
    return Math.round(value);
  }

  private toDateOnly(value: Date): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? new Date().toISOString().slice(0, 10)
      : date.toISOString().slice(0, 10);
  }

  private mapFmaPago(paymentType: SalePaymentType): string {
    if (paymentType === SalePaymentType.CREDIT) return '2';
    return '1';
  }

  mapSaleToDte(
    sale: SaleDteInput,
    options: { documentType: 39 | 33 },
  ): CreateDteDocumentDto {
    const documentType = options.documentType;
    const isBoleta = documentType === 39;
    const store = sale.store;

    if (!isBoleta && (!sale.receiver?.rut || !sale.receiver?.name)) {
      throw new BadRequestException(
        'La factura requiere receptor con RUT y nombre',
      );
    }

    const receptor = isBoleta
      ? {
          RUTRecep: '66666666-6',
          RznSocRecep: 'Anonimo',
        }
      : {
          RUTRecep: sale.receiver!.rut!,
          RznSocRecep: sale.receiver!.name!,
          ...(sale.receiver?.giro ? { GiroRecep: sale.receiver.giro } : {}),
          ...(sale.receiver?.address
            ? { DirRecep: sale.receiver.address }
            : {}),
          ...(sale.receiver?.city ? { CmnaRecep: sale.receiver.city } : {}),
        };

    const detalle = sale.items.map((item, index) => {
      const unitPrice = isBoleta
        ? this.toInteger(item.unitPrice)
        : this.toInteger(item.unitPrice / (1 + TAX_RATE));
      const lineTotal = isBoleta
        ? this.toInteger(item.lineTotal)
        : this.toInteger(item.lineTotal / (1 + TAX_RATE));

      return {
        NroLinDet: index + 1,
        NmbItem: item.productName,
        QtyItem: item.quantity,
        PrcItem: unitPrice,
        MontoItem: lineTotal,
        CdgItem: { TpoCodigo: 'INT1', VlrCodigo: item.sku },
      };
    });

    const mntTotal = this.toInteger(sale.total);
    const mntNeto = this.toInteger(sale.total / (1 + TAX_RATE));
    const iva = mntTotal - mntNeto;

    const encabezado = isBoleta
      ? {
          IdDoc: {
            TipoDTE: 39 as const,
            Folio: 0,
            FchEmis: this.toDateOnly(sale.issueDate),
            // Openfactura exige IndServicio en la Boleta 39 (su ejemplo usa '3').
            IndServicio: '3',
          },
          Emisor: {
            RUTEmisor: store.rut,
            RznSocEmisor: store.businessName || store.name,
            ...(store.giro ? { GiroEmisor: store.giro } : {}),
            ...(store.address ? { DirOrigen: store.address } : {}),
            ...(store.city ? { CmnaOrigen: store.city } : {}),
            ...(store.cdgSIISucur ? { CdgSIISucur: store.cdgSIISucur } : {}),
          },
          Receptor: receptor,
          Totales: {
            MntNeto: mntNeto,
            IVA: iva,
            MntTotal: mntTotal,
            VlrPagar: mntTotal,
          },
        }
      : {
          IdDoc: {
            TipoDTE: 33 as const,
            Folio: 0,
            FchEmis: this.toDateOnly(sale.issueDate),
            FmaPago: this.mapFmaPago(sale.paymentType),
          },
          Emisor: {
            RUTEmisor: store.rut,
            RznSoc: store.businessName || store.name,
            ...(store.giro ? { GiroEmis: store.giro } : {}),
            ...(store.acteco
              ? {
                  Acteco: store.acteco
                    .split(',')
                    .map((code) => code.trim())
                    .filter(Boolean),
                }
              : {}),
            ...(store.address ? { DirOrigen: store.address } : {}),
            ...(store.city ? { CmnaOrigen: store.city } : {}),
            ...(store.phone ? { Telefono: store.phone } : {}),
            ...(store.cdgSIISucur ? { CdgSIISucur: store.cdgSIISucur } : {}),
          },
          Receptor: receptor,
          Totales: {
            MntNeto: mntNeto,
            TasaIVA: '19',
            IVA: iva,
            MntTotal: mntTotal,
            MontoPeriodo: mntTotal,
            VlrPagar: mntTotal,
          },
        };

    return {
      response: [
        DteResponseValue.FOLIO,
        DteResponseValue.STATUS,
        DteResponseValue.PDF,
      ],
      dte: {
        Encabezado: encabezado,
        Detalle: detalle,
      },
      customer: {
        fullName: sale.receiver?.name,
        ...(sale.receiver?.email ? { email: sale.receiver.email } : {}),
      },
    };
  }
}
