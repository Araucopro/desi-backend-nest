import { BadRequestException, Injectable } from '@nestjs/common';
import { Store } from '../stores/entities/store.entity';
import { Sale } from '../sales/entities/sale.entity';
import {
  CreateDteDocumentDto,
  DteResponseValue,
} from '../dte/dto/create-dte-document.dto';
import { Return, ReturnType } from './entities/return.entity';
import {
  roundClp,
  splitIvaIncluded,
  TAX_RATE,
} from '../common/utils/money.util';

export type ReturnNceInput = {
  sale: Sale & { store: Store };
  ret: Return;
  originalDocumentType: 33 | 39;
  codRef: 1 | 3 | null;
};

@Injectable()
export class ReturnDteMapperService {
  private toDateOnly(value: Date): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? new Date().toISOString().slice(0, 10)
      : date.toISOString().slice(0, 10);
  }

  mapReturnToNce(input: ReturnNceInput): CreateDteDocumentDto {
    const { sale, ret, originalDocumentType, codRef } = input;
    const isBoletaOriginal = originalDocumentType === 39;

    if (!isBoletaOriginal && (!sale.receiver?.rut || !sale.receiver?.name)) {
      throw new BadRequestException(
        'La factura original requiere receptor con RUT y nombre',
      );
    }

    const detalle =
      ret.returnType === ReturnType.DESCUENTO
        ? [
            {
              NroLinDet: 1,
              NmbItem: ret.reason || 'Descuento posterior',
              QtyItem: 1,
              PrcItem: roundClp(
                isBoletaOriginal
                  ? Number(ret.discountAmount)
                  : Number(ret.discountAmount) / (1 + TAX_RATE),
              ),
              MontoItem: roundClp(
                isBoletaOriginal
                  ? Number(ret.discountAmount)
                  : Number(ret.discountAmount) / (1 + TAX_RATE),
              ),
            },
          ]
        : (ret.items ?? []).map((item, index) => {
            const unitPrice = isBoletaOriginal
              ? roundClp(Number(item.unitPrice))
              : roundClp(Number(item.unitPrice) / (1 + TAX_RATE));
            const lineTotal = isBoletaOriginal
              ? roundClp(Number(item.lineTotal))
              : roundClp(Number(item.lineTotal) / (1 + TAX_RATE));

            return {
              NroLinDet: index + 1,
              NmbItem: item.productName,
              QtyItem: item.quantity,
              PrcItem: unitPrice,
              MontoItem: lineTotal,
              CdgItem: {
                TpoCodigo: 'INT1',
                VlrCodigo: item.sku,
              },
            };
          });

    const mntTotal = roundClp(Number(ret.total));
    const { netTotal: mntNeto, taxTotal: iva } = splitIvaIncluded(mntTotal);
    const store = sale.store;
    const originalFolio = sale.folio ?? sale.dteDocument?.folio ?? 0;

    const receptor = isBoletaOriginal
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

    const encabezado = isBoletaOriginal
      ? {
          IdDoc: {
            TipoDTE: 61 as const,
            Folio: 0,
            FchEmis: this.toDateOnly(ret.issueDate),
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
            TipoDTE: 61 as const,
            Folio: 0,
            FchEmis: this.toDateOnly(ret.issueDate),
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
        Referencia: [
          {
            NroLinRef: 1,
            TpoDocRef: originalDocumentType,
            FolioRef: originalFolio,
            FchRef: this.toDateOnly(sale.issueDate),
            ...(codRef ? { CodRef: codRef } : {}),
            RazonRef: ret.reason ?? 'Devolución',
          },
        ],
      },
      customer: {
        fullName: sale.receiver?.name,
        ...(sale.receiver?.email ? { email: sale.receiver.email } : {}),
      },
    };
  }
}
