import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CreateDteDocumentDto } from './dto/create-dte-document.dto';
import { DteDocumentResponseDto } from './dto/dte-document-response.dto';
import { DteDocumentValue } from './dto/get-dte-document-query.dto';
import {
  DteDocument,
  DteDocumentPaymentType,
  DteDocumentStatus,
} from './entities/dte-document.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { FinancialMovementsService } from '../financial-movements/financial-movements.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { InventoryService } from '../inventory/inventory.service';
import {
  OpenfacturaCallResult,
  OpenfacturaClientService,
  OPENFACTURA_DOWNLOAD_TIMEOUT_MS,
  OpenfacturaDocumentResponse,
} from './openfactura-client.service';
import {
  applyFinalStatusToNormalized,
  buildResponse,
  NormalizedDteItem,
} from './dte-response.mapper';
import { mapToDocumentPayload } from './dte-item-resolver';
import {
  buildDteFinalizePlan,
  buildDtePreparationValues,
  buildLocalToken,
  costSnapshotChanged,
  LOCAL_TOKEN_PREFIX,
  readNormalizedItems,
  resolveFolio,
} from './dte-engine';
import { findExistingDteDocument } from './dte-repository.helpers';
import {
  DteCreateOptions,
  DteFinalizePlan,
  DtePreparationValues,
} from './dte.types';

import { StoresService } from '../stores/stores.service';

export type { DteCreateOptions } from './dte.types';

export type DteFinalizedListener = (
  manager: EntityManager,
  document: DteDocument,
) => Promise<void> | void;

export type DteFailedListener = (
  manager: EntityManager,
  document: DteDocument,
) => Promise<void> | void;

type DtePreparation = {
  document: DteDocument;
  idempotencyKeyToUse: string | null;
  checkExistingToken: string | null;
};

type DteCreateOutcome =
  | { kind: 'existing'; response: DteDocumentResponseDto }
  | { kind: 'prepared'; preparation: DtePreparation };

type DteFinalizeOutcome =
  | { kind: 'success'; response: DteDocumentResponseDto }
  | { kind: 'error'; message: string; response: DteDocumentResponseDto };

@Injectable()
export class DteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DteService.name);
  private reconcileTimer?: ReturnType<typeof setInterval>;
  private readonly openfacturaClient: OpenfacturaClientService;
  private readonly finalizedListeners: DteFinalizedListener[] = [];
  private readonly failedListeners: DteFailedListener[] = [];

  constructor(
    @InjectRepository(DteDocument)
    private readonly dteDocumentRepository: Repository<DteDocument>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly financialMovementsService: FinancialMovementsService,
    private readonly inventoryService: InventoryService,
    private readonly storesService: StoresService,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
    @Optional() openfacturaClient?: OpenfacturaClientService,
  ) {
    this.openfacturaClient =
      openfacturaClient ?? new OpenfacturaClientService(this.configService);
  }

  onModuleInit(): void {
    const enabled =
      this.configService.get<string>('DTE_RECONCILE_ENABLED') === 'true';
    if (!enabled || !this.tenantContext) return;

    const configuredInterval = Number(
      this.configService.get<string>('DTE_RECONCILE_INTERVAL_MS', '300000'),
    );
    const intervalMs =
      Number.isFinite(configuredInterval) && configuredInterval > 0
        ? configuredInterval
        : 300_000;

    this.logger.log(
      `Poller de reconciliación DTE habilitado | intervalMs=${intervalMs}`,
    );
    this.reconcileTimer = setInterval(() => {
      void this.reconcilePendingDocuments();
    }, intervalMs);
    this.reconcileTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = undefined;
    }
  }

  registerFinalizedListener(listener: DteFinalizedListener): void {
    this.finalizedListeners.push(listener);
  }

  registerFailedListener(listener: DteFailedListener): void {
    this.failedListeners.push(listener);
  }

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.transactionRunner) {
      return this.transactionRunner.run(callback);
    }

    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.dataSource.transaction(callback);
  }

  private mapPaymentType(fmaPago?: string): DteDocumentPaymentType {
    const value = fmaPago?.trim();
    if (value === '1') return DteDocumentPaymentType.CASH;
    if (value === '2') return DteDocumentPaymentType.CREDIT;
    this.logger.warn(
      `FmaPago ausente o no reconocido ('${value ?? ''}'); se usará Efectivo`,
    );
    return DteDocumentPaymentType.CASH;
  }

  private async prepare(
    manager: EntityManager,
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateDteDocumentDto,
    apikey: string,
    options?: DteCreateOptions,
  ): Promise<DteCreateOutcome> {
    const reserveStock = options?.reserveStock !== false;
    const existing = await findExistingDteDocument(
      manager,
      idempotencyKey,
      dto.purchaseOrderID,
    );

    if (existing && existing.status !== DteDocumentStatus.ERROR) {
      this.logger.log(
        `Documento existente reutilizado | dteDocumentID=${existing.dteDocumentID} | status=${existing.status}`,
      );
      return { kind: 'existing', response: buildResponse(existing) };
    }

    const { normalizedItems, store, totals } = await mapToDocumentPayload(
      manager,
      dto,
      storeID,
      options?.cogsTotalOverride,
    );

    if (existing && existing.storeID && existing.storeID !== store.storeID) {
      throw new BadRequestException(
        'La Idempotency-Key / orden de compra ya fue utilizada en otra tienda',
      );
    }

    const idempotencyKeyToUse =
      existing?.idempotencyKey ?? idempotencyKey ?? null;
    const checkExistingToken =
      existing?.token && !existing.token.startsWith(LOCAL_TOKEN_PREFIX)
        ? existing.token
        : null;
    const token =
      existing?.token && !existing.token.startsWith(LOCAL_TOKEN_PREFIX)
        ? existing.token
        : buildLocalToken();
    const folio =
      existing?.folio ?? resolveFolio(dto.dte.Encabezado.IdDoc.Folio);
    const paymentType =
      options?.paymentType ??
      this.mapPaymentType(
        'FmaPago' in dto.dte.Encabezado.IdDoc
          ? dto.dte.Encabezado.IdDoc.FmaPago
          : undefined,
      );

    const tenantID = this.tenantContext?.getTenantId() ?? store.tenantID;

    const values: DtePreparationValues = buildDtePreparationValues({
      dto,
      store,
      normalizedItems,
      totals,
      tenantID,
      apikey: this.openfacturaClient.maskApikey(apikey),
      idempotencyKey: idempotencyKeyToUse,
      purchaseOrderID: dto.purchaseOrderID,
      saleID: options?.saleID,
      reserveStock,
      token,
      folio,
      paymentType,
    });

    let document: DteDocument | null = null;

    if (existing) {
      document = await manager.save(
        manager.create(DteDocument, { ...existing, ...values }),
      );
    } else {
      const candidate = manager.create(DteDocument, values);
      await manager.query('SAVEPOINT dte_document_insert');
      try {
        document = await manager.save(candidate);
      } catch (error) {
        await manager.query('ROLLBACK TO SAVEPOINT dte_document_insert');
        if (isUniqueViolation(error)) {
          const concurrent = await findExistingDteDocument(
            manager,
            idempotencyKey,
            dto.purchaseOrderID,
          );
          if (concurrent) {
            if (concurrent.status !== DteDocumentStatus.ERROR) {
              this.logger.log(
                `Documento concurrente reutilizado tras 23505 | dteDocumentID=${concurrent.dteDocumentID} | status=${concurrent.status}`,
              );
              return {
                kind: 'existing',
                response: buildResponse(concurrent),
              };
            }
            document = await manager.save(
              manager.create(DteDocument, { ...concurrent, ...values }),
            );
          }
        }
        if (!document) throw error;
      } finally {
        await manager.query('RELEASE SAVEPOINT dte_document_insert');
      }
    }

    if (!document) {
      throw new InternalServerErrorException(
        'No se pudo preparar el documento DTE',
      );
    }

    if (reserveStock) {
      const reservedCogsTotal = await this.inventoryService.reserveStock(
        manager,
        store.storeID,
        normalizedItems.filter(
          (item): item is NormalizedDteItem & { variationID: string } =>
            item.variationID !== null,
        ),
        document.dteDocumentID,
        this.tenantContext?.getTenantId(),
        options?.reserveReason,
      );
      const costsChanged = costSnapshotChanged(
        document,
        normalizedItems,
        reservedCogsTotal,
      );

      if (costsChanged) {
        document.cogsTotal = reservedCogsTotal;
        document.payloadNormalized = {
          ...document.payloadNormalized,
          items: normalizedItems,
          cogsTotal: reservedCogsTotal,
          totals: {
            ...(document.payloadNormalized as { totals?: object })?.totals,
            cogsTotal: reservedCogsTotal,
          },
        };
        document = await manager.save(document);
      }
    }

    this.logger.log(
      `Documento DTE en PENDIENTE | dteDocumentID=${document.dteDocumentID} | folio=${document.folio} | storeID=${document.storeID}`,
    );
    return {
      kind: 'prepared',
      preparation: {
        document,
        idempotencyKeyToUse,
        checkExistingToken,
      },
    };
  }

  private async finalizeInTransaction(
    manager: EntityManager,
    dteDocumentID: string,
    result: OpenfacturaCallResult,
  ): Promise<DteFinalizeOutcome> {
    const document = await manager.findOne(DteDocument, {
      where: { dteDocumentID },
      lock: { mode: 'pessimistic_write' },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento DTE ${dteDocumentID} no encontrado`,
      );
    }

    if (
      document.status === DteDocumentStatus.EMITIDO ||
      document.status === DteDocumentStatus.ERROR
    ) {
      return { kind: 'success', response: buildResponse(document) };
    }

    if (document.status !== DteDocumentStatus.PENDIENTE) {
      throw new BadRequestException(
        `Documento ${dteDocumentID} no está en estado PENDIENTE`,
      );
    }

    const plan: DteFinalizePlan = buildDteFinalizePlan(document, result);

    document.status = plan.status;
    document.token = plan.token;
    document.folio = plan.folio;
    document.errorDetail = plan.errorDetail;

    if (plan.kind === 'success') {
      document.payloadNormalized = applyFinalStatusToNormalized(document);

      const saved = await manager.save(document);
      if (saved.status === DteDocumentStatus.EMITIDO) {
        await this.financialMovementsService.recordDte(manager, saved);
        for (const listener of this.finalizedListeners) {
          await listener(manager, saved);
        }
      }

      this.logger.log(
        `Documento DTE finalizado | dteDocumentID=${saved.dteDocumentID} | status=${saved.status} | folio=${saved.folio}`,
      );
      return {
        kind: 'success',
        response: buildResponse(saved, plan.extraPayload),
      };
    }

    document.payloadNormalized = applyFinalStatusToNormalized(
      document,
      document.errorDetail,
    );

    const saved = await manager.save(document);
    if (saved.stockReserved !== false) {
      await this.inventoryService.revertReservedStock(
        manager,
        saved.storeID,
        readNormalizedItems(saved).filter(
          (item): item is NormalizedDteItem & { variationID: string } =>
            item.variationID !== null,
        ),
        saved.dteDocumentID,
        this.tenantContext?.getTenantId() ?? saved.tenantID,
        (variationID) => {
          this.logger.error(
            `No se pudo revertir stock del DTE ${saved.dteDocumentID}: StoreProduct no encontrado para variationID=${variationID}`,
          );
        },
      );
    }

    this.logger.error(
      `Documento DTE en ERROR | dteDocumentID=${saved.dteDocumentID} | detail=${document.errorDetail}`,
    );
    for (const listener of this.failedListeners) {
      await listener(manager, saved);
    }
    return {
      kind: 'error',
      message: plan.message,
      response: buildResponse(saved),
    };
  }

  private async resolveApikey(storeID: string): Promise<string> {
    return this.storesService.resolveOpenfacturaKey(storeID);
  }

  private resolveDownloadTimeout(): number {
    const configured = Number(
      this.configService.get<string>(
        'OPENFACTURA_DOWNLOAD_TIMEOUT_MS',
        String(OPENFACTURA_DOWNLOAD_TIMEOUT_MS),
      ),
    );
    return Number.isFinite(configured) && configured > 0
      ? configured
      : OPENFACTURA_DOWNLOAD_TIMEOUT_MS;
  }

  async getDocument(
    dteDocumentID: string,
    storeID: string,
    value: DteDocumentValue = DteDocumentValue.JSON,
  ): Promise<OpenfacturaDocumentResponse> {
    const document = await this.runInTransaction((manager) =>
      manager.findOne(DteDocument, {
        where: { dteDocumentID, storeID },
      }),
    );

    if (!document) {
      throw new NotFoundException(
        `Documento DTE ${dteDocumentID} no encontrado`,
      );
    }

    if (!document.token || document.token.startsWith(LOCAL_TOKEN_PREFIX)) {
      throw new BadRequestException(
        'El documento no tiene un TOKEN de Openfactura para consultar',
      );
    }

    const apikey = await this.resolveApikey(storeID);
    const result = await this.openfacturaClient.getOpenfacturaDocument(
      apikey,
      document.token,
      value,
      this.resolveDownloadTimeout(),
    );

    if (!result.ok) {
      throw new BadGatewayException(result.errorDetail);
    }

    return result.payload;
  }

  async create(
    storeID: string,
    idempotencyKey: string | undefined,
    dto: CreateDteDocumentDto,
    options?: DteCreateOptions,
  ): Promise<DteDocumentResponseDto> {
    const apikey = await this.resolveApikey(storeID);
    this.logger.log(
      `create() iniciado | storeID=${storeID} | idempotencyKey=${
        idempotencyKey ?? 'none'
      } | folio=${dto.dte?.Encabezado?.IdDoc?.Folio ?? 'none'} | tipoDTE=${
        dto.dte?.Encabezado?.IdDoc?.TipoDTE ?? 'none'
      }`,
    );

    const outcome = await this.runInTransaction((manager) =>
      this.prepare(manager, storeID, idempotencyKey, dto, apikey, options),
    );

    if (outcome.kind === 'existing') return outcome.response;

    const { document, idempotencyKeyToUse, checkExistingToken } =
      outcome.preparation;
    const callResult = checkExistingToken
      ? await this.openfacturaClient.getOpenfacturaDocument(
          apikey,
          checkExistingToken,
        )
      : await this.openfacturaClient.createOpenfacturaDocument(
          apikey,
          idempotencyKeyToUse,
          dto,
        );

    const finalOutcome = await this.runInTransaction((manager) =>
      this.finalizeInTransaction(manager, document.dteDocumentID, callResult),
    );

    if (finalOutcome.kind === 'error') {
      throw new BadGatewayException(finalOutcome.message);
    }
    return finalOutcome.response;
  }

  async reconcile(
    dteDocumentID: string,
    storeID: string,
  ): Promise<DteDocumentResponseDto> {
    const apikey = await this.resolveApikey(storeID);

    const document = await this.runInTransaction((manager) =>
      manager.findOne(DteDocument, {
        where: { dteDocumentID, storeID },
      }),
    );

    if (!document) {
      throw new NotFoundException(
        `Documento DTE ${dteDocumentID} no encontrado`,
      );
    }

    if (document.status !== DteDocumentStatus.PENDIENTE) {
      return buildResponse(document);
    }

    if (!document.token || document.token.startsWith(LOCAL_TOKEN_PREFIX)) {
      throw new BadRequestException(
        'El documento no tiene un TOKEN de Openfactura para reconciliar',
      );
    }

    const result = await this.openfacturaClient.getOpenfacturaDocument(
      apikey,
      document.token,
    );
    const finalOutcome = await this.runInTransaction((manager) =>
      this.finalizeInTransaction(manager, dteDocumentID, result),
    );

    if (finalOutcome.kind === 'error') {
      throw new BadGatewayException(finalOutcome.message);
    }
    return finalOutcome.response;
  }

  private async reconcilePendingDocuments(): Promise<void> {
    const tenantContext = this.tenantContext;
    if (!tenantContext) return;

    try {
      const tenants = await this.dataSource.query(
        `SELECT "tenantID" FROM "tenants" WHERE "status" = 'ACTIVE'`,
      );

      for (const tenant of tenants) {
        await tenantContext.run(
          { tenantId: tenant.tenantID, impersonating: false },
          async () => {
            const pending = await this.runInTransaction((manager) =>
              manager.find(DteDocument, {
                where: { status: DteDocumentStatus.PENDIENTE },
                take: 50,
              }),
            );

            for (const document of pending) {
              try {
                await this.reconcile(document.dteDocumentID, document.storeID);
              } catch (error) {
                this.logger.warn(
                  `Reconciliación DTE falló | dteDocumentID=${document.dteDocumentID} | error=${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Ciclo de reconciliación DTE falló | error=${error instanceof Error ? error.stack : String(error)}`,
      );
    }
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return this.runInTransaction((manager) =>
      manager.getRepository(DteDocument).findOne({
        where: { idempotencyKey },
        relations: ['store'],
      }),
    );
  }
}
