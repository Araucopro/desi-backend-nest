import { DteDocument } from '../dte/entities/dte-document.entity';
import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { Sale } from './entities/sale.entity';
import { SaleView } from './sales.types';

export function toDteSummary(
  dte: DteDocument | null | undefined,
): DteDocumentResponseDto | null {
  if (!dte) return null;
  return {
    dteDocumentID: dte.dteDocumentID,
    TOKEN: dte.token,
    FOLIO: dte.folio,
    STATUS: dte.status,
    saleID: dte.saleID,
  };
}

export function toSaleView(
  sale: Sale,
  dteResponse?: DteDocumentResponseDto | null,
): SaleView {
  const { payments, ...saleFields } = sale;

  return {
    sale: {
      ...saleFields,
      payments: (payments ?? []).map((payment) => ({
        paymentID: payment.paymentID,
        paymentMethodID: payment.paymentMethodID,
        paymentMethod: payment.paymentMethod
          ? {
              paymentMethodID: payment.paymentMethod.paymentMethodID,
              code: payment.paymentMethod.code,
              name: payment.paymentMethod.name,
              type: payment.paymentMethod.type,
            }
          : null,
        amount: Number(payment.amount),
        status: payment.status,
        paidAt: payment.paidAt,
        authorizationCode: payment.authorizationCode ?? null,
        transactionID: payment.transactionID ?? null,
        reference: payment.reference ?? null,
      })),
    },
    dte: dteResponse ?? toDteSummary(sale.dteDocument),
  };
}
