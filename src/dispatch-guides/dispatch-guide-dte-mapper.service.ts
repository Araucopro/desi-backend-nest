import { Injectable } from '@nestjs/common';
import { Store } from '../stores/entities/store.entity';
import { roundClp } from '../common/utils/money.util';
import {
  CreateDteDocumentDto,
  DteResponseValue,
} from '../dte/dto/create-dte-document.dto';
import {
  DispatchGuideDestination,
  DispatchGuideReceiver,
  DispatchGuideTransport,
} from './entities/dispatch-guide.entity';
import { PreparedDispatchGuideItem, TAX_RATE } from './dispatch-guides-engine';

export type DispatchGuideDteInput = {
  issueDate: Date;
  indTraslado: string;
  includePrices: boolean;
  receiver: DispatchGuideReceiver;
  destination: DispatchGuideDestination;
  transport: DispatchGuideTransport | null;
  items: PreparedDispatchGuideItem[];
  total: number;
  netTotal: number;
  taxTotal: number;
  store: Store;
};

/**
 * Construye el payload Openfactura de una Guía de Despacho Electrónica (52).
 *
 * - IdDoc con IndTraslado '1' y DirDest/CmnaDest obligatorios.
 * - Emisor estilo factura desde la tienda.
 * - Totales neto/IVA positivos (la GD no registra ingreso; solo respalda el
 *   traslado).
 * - Detalle por SKU con precios netos.
 * - Transporte opcional: se envía solo si el creador lo entregó.
 */
@Injectable()
export class DispatchGuideDteMapperService {
  private toDateOnly(value: Date): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? new Date().toISOString().slice(0, 10)
      : date.toISOString().slice(0, 10);
  }

  mapDispatchGuideToDte(input: DispatchGuideDteInput): CreateDteDocumentDto {
    const { store, receiver, destination, transport } = input;

    const detalle = input.items.map((item, index) => {
      const includePrices = input.includePrices;
      return {
        NroLinDet: index + 1,
        NmbItem: item.productName,
        QtyItem: item.quantity,
        PrcItem: includePrices ? roundClp(item.unitPrice / (1 + TAX_RATE)) : 0,
        MontoItem: includePrices
          ? roundClp(item.lineTotal / (1 + TAX_RATE))
          : 0,
        CdgItem: {
          TpoCodigo: 'INT1',
          VlrCodigo: item.sku,
        },
      };
    });

    const mntTotal = roundClp(input.total);
    const mntNeto = roundClp(input.netTotal);
    const iva = roundClp(input.taxTotal);

    const dte: CreateDteDocumentDto['dte'] = {
      Encabezado: {
        IdDoc: {
          TipoDTE: 52 as const,
          Folio: 0,
          FchEmis: this.toDateOnly(input.issueDate),
          IndTraslado: input.indTraslado,
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
        Receptor: {
          RUTRecep: receiver.rut,
          RznSocRecep: receiver.name,
          ...(receiver.giro ? { GiroRecep: receiver.giro } : {}),
          ...(receiver.address ? { DirRecep: receiver.address } : {}),
          ...(receiver.city ? { CmnaRecep: receiver.city } : {}),
        },
        Transporte: {
          ...(transport?.patente ? { Patente: transport.patente } : {}),
          ...(transport?.rutConductor || transport?.nombreConductor
            ? {
                Chofer: {
                  ...(transport.rutConductor
                    ? { RUTChofer: transport.rutConductor }
                    : {}),
                  ...(transport.nombreConductor
                    ? { NombreChofer: transport.nombreConductor }
                    : {}),
                },
              }
            : {}),
          DirDest: destination.address,
          CmnaDest: destination.city,
          ...(transport?.fechaTraslado
            ? { FchSalida: transport.fechaTraslado }
            : {}),
        },
        Totales: input.includePrices
          ? {
              MntNeto: mntNeto,
              TasaIVA: '19',
              IVA: iva,
              MntTotal: mntTotal,
              VlrPagar: mntTotal,
            }
          : {
              MntNeto: 0,
              IVA: 0,
              MntTotal: 0,
              VlrPagar: 0,
            },
      },
      Detalle: detalle,
    };

    return {
      response: [
        DteResponseValue.FOLIO,
        DteResponseValue.STATUS,
        DteResponseValue.PDF,
      ],
      dte,
      customer: {
        fullName: receiver.name,
        ...(receiver.email ? { email: receiver.email } : {}),
      },
    };
  }
}
