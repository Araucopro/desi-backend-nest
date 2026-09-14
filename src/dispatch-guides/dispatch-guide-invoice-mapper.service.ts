import { BadRequestException, Injectable } from '@nestjs/common';
import { Store } from '../stores/entities/store.entity';
import {
  CreateDteDocumentDto,
  DteReferenciaDto,
  DteResponseValue,
} from '../dte/dto/create-dte-document.dto';
import { DteDocumentPaymentType } from '../dte/entities/dte-document.entity';
import { DispatchGuide } from './entities/dispatch-guide.entity';
import {
  roundClp,
  splitIvaIncluded,
  TAX_RATE,
} from '../common/utils/money.util';
import { InvoiceDispatchGuidesDto } from './dto/invoice-dispatch-guides.dto';

export type ConsolidatedInvoiceItem = {
  storeProductID: string;
  variationID: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
};

@Injectable()
export class DispatchGuideInvoiceMapperService {
  private toDateOnly(value: Date | string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? new Date().toISOString().slice(0, 10)
      : date.toISOString().slice(0, 10);
  }

  private mapFmaPago(paymentType: DteDocumentPaymentType): string {
    if (paymentType === DteDocumentPaymentType.CREDIT) return '2';
    return '1';
  }

  mapGuidesToInvoice(
    guides: DispatchGuide[],
    store: Store,
    dto: InvoiceDispatchGuidesDto,
  ): {
    dteDto: CreateDteDocumentDto;
    consolidatedItems: ConsolidatedInvoiceItem[];
    total: number;
    netTotal: number;
    taxTotal: number;
    cogsTotal: number;
  } {
    if (!guides.length) {
      throw new BadRequestException(
        'Se requiere al menos una guía de despacho para emitir la factura',
      );
    }

    if (guides.length > 40) {
      throw new BadRequestException(
        'El SII permite un máximo de 40 documentos referenciados por factura',
      );
    }

    const firstGuide = guides[0];
    const receiverRut = firstGuide.receiver?.rut;
    if (!receiverRut || !firstGuide.receiver?.name) {
      throw new BadRequestException(
        'La guía de despacho no cuenta con receptor válido (RUT y nombre requeridos para factura)',
      );
    }

    for (const guide of guides) {
      if (guide.receiver?.rut !== receiverRut) {
        throw new BadRequestException(
          `Todas las guías a consolidar deben pertenecer al mismo receptor (RUT ${receiverRut})`,
        );
      }
      if (!guide.folio) {
        throw new BadRequestException(
          `La guía de despacho ${guide.dispatchGuideID} no tiene folio SII asignado`,
        );
      }
    }

    // Consolidar ítems agrupando por SKU y precio unitario si coinciden, o agregándolos ordenadamente
    const itemMap = new Map<string, ConsolidatedInvoiceItem>();
    let cogsTotal = 0;

    for (const guide of guides) {
      for (const item of guide.items ?? []) {
        const unitPrice = Number(item.unitPrice);
        const unitCost = Number(item.unitCost);
        const quantity = item.quantity;
        const lineTotal = Number(item.lineTotal);

        cogsTotal += unitCost * quantity;

        // Clave única para agrupar por SKU y precio unitario
        const key = `${item.sku}__${unitPrice}`;
        const existing = itemMap.get(key);
        if (existing) {
          existing.quantity += quantity;
          existing.lineTotal += lineTotal;
        } else {
          itemMap.set(key, {
            storeProductID: item.storeProductID,
            variationID: item.variationID,
            productName: item.productName,
            sku: item.sku,
            quantity,
            unitPrice,
            unitCost,
            lineTotal,
          });
        }
      }
    }

    const consolidatedItems = Array.from(itemMap.values());
    if (!consolidatedItems.length) {
      throw new BadRequestException(
        'Las guías de despacho referenciadas no contienen ítems para facturar',
      );
    }

    const total = roundClp(
      consolidatedItems.reduce((acc, item) => acc + item.lineTotal, 0),
    );
    const { netTotal, taxTotal } = splitIvaIncluded(total);

    const detalle = consolidatedItems.map((item, index) => {
      const prcNeto = roundClp(item.unitPrice / (1 + TAX_RATE));
      const montoNeto = roundClp(item.lineTotal / (1 + TAX_RATE));

      return {
        NroLinDet: index + 1,
        NmbItem: item.productName,
        QtyItem: item.quantity,
        PrcItem: prcNeto,
        MontoItem: montoNeto,
        CdgItem: {
          TpoCodigo: 'INT1',
          VlrCodigo: item.sku,
        },
      };
    });

    const references: DteReferenciaDto[] = guides.map((guide, index) => ({
      NroLinRef: index + 1,
      TpoDocRef: 52 as const,
      FolioRef: guide.folio!,
      FchRef: this.toDateOnly(guide.issueDate),
      RazonRef: 'Guía de despacho',
    }));

    const receiver = firstGuide.receiver;
    const issueDate = dto.issueDate ?? new Date();

    const dteDto: CreateDteDocumentDto = {
      response: [
        DteResponseValue.FOLIO,
        DteResponseValue.STATUS,
        DteResponseValue.PDF,
      ],
      dte: {
        Encabezado: {
          IdDoc: {
            TipoDTE: 33 as const,
            Folio: 0,
            FchEmis: this.toDateOnly(issueDate),
            FmaPago: this.mapFmaPago(dto.paymentType),
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
          Totales: {
            MntNeto: netTotal,
            TasaIVA: '19',
            IVA: taxTotal,
            MntTotal: total,
            MontoPeriodo: total,
            VlrPagar: total,
          },
        },
        Detalle: detalle,
        Referencia: references,
      },
      customer: {
        fullName: receiver.name,
        ...(receiver.email ? { email: receiver.email } : {}),
      },
    };

    return {
      dteDto,
      consolidatedItems,
      total,
      netTotal,
      taxTotal,
      cogsTotal: Math.round(cogsTotal * 100) / 100,
    };
  }
}
