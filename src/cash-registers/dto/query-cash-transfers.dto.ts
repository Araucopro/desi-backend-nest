import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CashTransferDestinationType,
  CashTransferStatus,
} from '../entities/cash-transfer.entity';

export enum CashTransferDirection {
  /** Transferencias solicitadas desde la sesión de la ruta. */
  SENT = 'SENT',
  /** Transferencias recibidas en la sesión de la ruta. */
  RECEIVED = 'RECEIVED',
  /** Transferencias que tocan la sesión, en cualquier sentido. */
  ALL = 'ALL',
}

export class QueryCashTransfersDto {
  @ApiPropertyOptional({
    description:
      'Sentido de la consulta respecto de la sesión de la ruta (por defecto SENT)',
    enum: CashTransferDirection,
    example: CashTransferDirection.SENT,
  })
  @IsOptional()
  @IsEnum(CashTransferDirection)
  direction?: CashTransferDirection;

  @ApiPropertyOptional({
    description: 'Filtrar por estado de la transferencia',
    enum: CashTransferStatus,
  })
  @IsOptional()
  @IsEnum(CashTransferStatus)
  status?: CashTransferStatus;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de destino',
    enum: CashTransferDestinationType,
  })
  @IsOptional()
  @IsEnum(CashTransferDestinationType)
  destinationType?: CashTransferDestinationType;

  @ApiPropertyOptional({
    description: 'Fecha/hora inicial de solicitud (ISO 8601)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fecha/hora final de solicitud (ISO 8601)',
    example: '2026-09-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
