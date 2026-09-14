import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { SalePaymentType } from '../sales/entities/sale.entity';
import {
  findCashRegisterOrFail,
  findOpenSessionOrFail,
  findSessionOrFail,
  toMoney,
} from './cash-registers.helpers';
import { CashMovementsService } from './cash-movements.service';
import { SalePaymentInputDto } from './dto/sale-payment.dto';
import { QuerySessionPaymentsDto } from './dto/query-session-payments.dto';
import {
  CashMovement,
  CashMovementReason,
  CashMovementReferenceType,
  CashMovementType,
} from './entities/cash-movement.entity';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import {
  PaymentMethod,
  PaymentMethodType,
} from './entities/payment-method.entity';

export type ResolveSalePaymentsInput = {
  tenantID?: string | null;
  storeID: string;
  saleTotal: number;
  paymentType: SalePaymentType;
  cashRegisterID?: string;
  payments?: SalePaymentInputDto[];
  lock?: boolean;
};

export type ResolvedSalePaymentLine = {
  input: SalePaymentInputDto;
  method: PaymentMethod;
  amount: number;
};

export type ResolvedSalePayments = {
  tenantID: string;
  register: CashRegister;
  session: CashRegisterSession;
  total: number;
  lines: ResolvedSalePaymentLine[];
};

export type PersistedSalePayments = {
  payments: Payment[];
  cashMovements: CashMovement[];
};

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly cashMovementsService: CashMovementsService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.paymentRepository.manager.transaction(callback);
  }

  private getEffectiveTenantId(): string {
    const tenantId = this.tenantContext?.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto tenant no disponible');
    }
    return tenantId;
  }

  /**
   * Valida el contexto de cobro de una venta: caja de la tienda con sesión
   * `OPEN`, medios de pago activos y cumplimiento del invariante
   * `sum(Payment.amount) = Sale.total` (Regla 3).
   *
   * Devuelve `null` cuando la venta no se cobra contra una caja (ventas sin
   * POS o integraciones previas).
   */
  async resolveSalePayments(
    manager: EntityManager,
    input: ResolveSalePaymentsInput,
  ): Promise<ResolvedSalePayments | null> {
    const requestedPayments = input.payments ?? [];

    if (!input.cashRegisterID && requestedPayments.length === 0) {
      return null;
    }
    if (!input.cashRegisterID) {
      throw new BadRequestException(
        'Los pagos requieren indicar la caja (cashRegisterID) desde la que se cobra',
      );
    }
    if (requestedPayments.length === 0) {
      throw new BadRequestException(
        'Se informó la caja de cobro pero no los pagos de la venta',
      );
    }

    const register = await findCashRegisterOrFail(
      manager,
      input.cashRegisterID,
      input.tenantID ?? undefined,
    );

    if (register.storeID !== input.storeID) {
      throw new BadRequestException(
        'La caja informada no pertenece a la tienda de la venta',
      );
    }

    const tenantID = input.tenantID ?? register.tenantID;
    if (tenantID !== register.tenantID) {
      throw new BadRequestException(
        'La caja informada pertenece a otro tenant',
      );
    }

    const session = await findOpenSessionOrFail(
      manager,
      register.cashRegisterID,
      { tenantID, lock: input.lock },
    );

    const methodIDs = [
      ...new Set(requestedPayments.map((payment) => payment.paymentMethodID)),
    ];
    const methods = await manager.getRepository(PaymentMethod).find({
      where: { paymentMethodID: In(methodIDs), tenantID },
    });
    const methodByID = new Map(
      methods.map((method) => [method.paymentMethodID, method]),
    );

    const lines: ResolvedSalePaymentLine[] = requestedPayments.map(
      (payment) => {
        const method = methodByID.get(payment.paymentMethodID);
        if (!method) {
          throw new BadRequestException(
            `El medio de pago ${payment.paymentMethodID} no existe en el tenant`,
          );
        }
        if (!method.active) {
          throw new BadRequestException(
            `El medio de pago "${method.name}" está inactivo`,
          );
        }

        const amount = toMoney(Number(payment.amount));
        if (amount <= 0) {
          throw new BadRequestException(
            'Los montos de pago deben ser mayores a cero',
          );
        }

        return { input: payment, method, amount };
      },
    );

    const paidTotal = toMoney(
      lines.reduce((accumulator, line) => accumulator + line.amount, 0),
    );
    const saleTotal = toMoney(Number(input.saleTotal));

    if (Math.abs(paidTotal - saleTotal) > 0.01) {
      throw new BadRequestException(
        `La suma de los pagos (${paidTotal}) no coincide con el total de la venta (${saleTotal})`,
      );
    }

    this.assertPaymentTypeMatches(input.paymentType, lines);

    return {
      tenantID,
      register,
      session,
      total: saleTotal,
      lines,
    };
  }

  /**
   * Un cobro en efectivo declarado en la venta debe incluir al menos un medio
   * que mueva efectivo; un cobro con débito debe incluir la tarjeta de débito.
   */
  private assertPaymentTypeMatches(
    paymentType: SalePaymentType,
    lines: ResolvedSalePaymentLine[],
  ): void {
    if (
      paymentType === SalePaymentType.CASH &&
      !lines.some((line) => line.method.affectsCash)
    ) {
      throw new BadRequestException(
        'La venta está marcada como pago en efectivo pero ningún medio informado mueve efectivo',
      );
    }

    if (
      paymentType === SalePaymentType.DEBIT &&
      !lines.some((line) => line.method.type === PaymentMethodType.DEBIT_CARD)
    ) {
      throw new BadRequestException(
        'La venta está marcada como pago con débito pero no se informó una tarjeta de débito',
      );
    }
  }

  /**
   * Persiste los cobros resueltos y genera los `CashMovement` de entrada para
   * los medios que afectan efectivo. Debe ejecutarse en la misma transacción
   * que persiste la venta.
   */
  async persistSalePayments(
    manager: EntityManager,
    resolved: ResolvedSalePayments,
    options: { saleID: string; createdByUserID: string },
  ): Promise<PersistedSalePayments> {
    const repository = manager.getRepository(Payment);
    const paidAt = new Date();

    const payments = await repository.save(
      resolved.lines.map((line) =>
        repository.create({
          tenantID: resolved.tenantID,
          saleID: options.saleID,
          sessionID: resolved.session.sessionID,
          paymentMethodID: line.method.paymentMethodID,
          amount: line.amount,
          status: PaymentStatus.COMPLETED,
          authorizationCode: line.input.authorizationCode?.trim() ?? null,
          transactionID: line.input.transactionID?.trim() ?? null,
          reference: line.input.reference?.trim() ?? null,
          paidAt,
        }),
      ),
    );

    const cashMovements: CashMovement[] = [];
    for (const line of resolved.lines) {
      if (!line.method.affectsCash) continue;

      cashMovements.push(
        await this.cashMovementsService.recordSystemMovement(manager, {
          tenantID: resolved.tenantID,
          sessionID: resolved.session.sessionID,
          type: CashMovementType.CASH_IN,
          amount: line.amount,
          reason: CashMovementReason.SALE,
          referenceType: CashMovementReferenceType.SALE,
          referenceID: options.saleID,
          description: `Cobro en efectivo (${line.method.name}) de la venta ${options.saleID}`,
          createdByUserID: options.createdByUserID,
        }),
      );
    }

    return { payments, cashMovements };
  }

  async listSessionPayments(
    cashRegisterID: string,
    sessionID: string,
    query: QuerySessionPaymentsDto,
  ): Promise<Payment[]> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      await findCashRegisterOrFail(manager, cashRegisterID, tenantID);
      await findSessionOrFail(manager, sessionID, cashRegisterID, tenantID);

      const queryBuilder = manager
        .getRepository(Payment)
        .createQueryBuilder('payment')
        .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
        .where('payment.tenantID = :tenantID', { tenantID })
        .andWhere('payment.sessionID = :sessionID', { sessionID });

      if (query.status) {
        queryBuilder.andWhere('payment.status = :status', {
          status: query.status,
        });
      }
      if (query.paymentMethodID) {
        queryBuilder.andWhere('payment.paymentMethodID = :paymentMethodID', {
          paymentMethodID: query.paymentMethodID,
        });
      }

      return queryBuilder
        .orderBy('payment.paidAt', 'DESC')
        .addOrderBy('payment.createdAt', 'DESC')
        .getMany();
    });
  }

  async listSalePayments(
    manager: EntityManager,
    saleID: string,
  ): Promise<Payment[]> {
    return manager.getRepository(Payment).find({
      where: { saleID },
      relations: ['paymentMethod'],
      order: { paidAt: 'ASC' },
    });
  }
}
