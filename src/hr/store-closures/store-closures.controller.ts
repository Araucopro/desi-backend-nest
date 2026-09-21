import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { GetStoreId } from '../../common/decorators/get-store-id.decorator';
import { StoreContextGuard } from '../../common/guards/store-context.guard';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { StoreClosure } from './entities/store-closure.entity';
import { StoreClosuresService } from './store-closures.service';
import { CreateStoreClosureDto } from './dto/create-store-closure.dto';
import { CreateStoreClosureBulkDto } from './dto/create-store-closure-bulk.dto';
import { StoreClosureQueryDto } from './dto/store-closure-query.dto';
import { CancelStoreClosureDto } from './dto/cancel-store-closure.dto';

@ApiTags('Recursos Humanos')
@ApiBearerAuth('access-token')
@Controller('hr/store-closures')
@UseGuards(StoreContextGuard)
export class StoreClosuresController {
  constructor(private readonly service: StoreClosuresService) {}

  @Get()
  @RequirePermission('hr-attendance:read')
  @ApiOperation({
    summary: 'Listar cierres activos de una tienda',
    description:
      'Devuelve cierres no cancelados que se intersectan con el rango from/to. Si no se envía rango, devuelve todos los cierres activos de la tienda.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Identificador UUID de la tienda activa.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiResponse({
    status: 200,
    description: 'Cierres activos encontrados.',
    type: [StoreClosure],
  })
  @ApiQuery({
    name: 'from',
    required: false,
    format: 'date',
    description: 'Fecha inicial del filtro de intersección.',
    example: '2026-09-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    format: 'date',
    description: 'Fecha final del filtro de intersección.',
    example: '2026-09-30',
  })
  @ApiBadRequestResponse({ description: 'El rango de consulta no es válido.' })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiForbiddenResponse({
    description: 'No tiene acceso a la tienda o permiso de lectura.',
  })
  findAll(@GetStoreId() storeID: string, @Query() query: StoreClosureQueryDto) {
    return this.service.findAll(storeID, query.from, query.to);
  }

  @Post()
  @RequirePermission('hr-attendance:manage')
  @ApiOperation({
    summary: 'Crear un cierre de tienda',
    description:
      'Registra un rango inclusivo en que la tienda no opera. No se permiten rangos solapados con otro cierre activo de la misma tienda.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description:
      'La tienda se toma del contexto y no debe enviarse en el body.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiBody({ type: CreateStoreClosureDto })
  @ApiResponse({
    status: 201,
    description: 'Cierre creado.',
    type: StoreClosure,
  })
  @ApiBadRequestResponse({ description: 'Fechas inválidas o rango invertido.' })
  @ApiConflictResponse({
    description: 'El rango se solapa con un cierre existente.',
  })
  @ApiForbiddenResponse({
    description: 'Falta hr-attendance:manage o acceso a la tienda.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiNotFoundResponse({ description: 'La tienda no existe en el tenant.' })
  create(
    @GetStoreId() storeID: string,
    @Body() dto: CreateStoreClosureDto,
    @GetUser() user: { userId?: string; masterUserId?: string },
  ) {
    return this.service.create(storeID, dto, {
      userID: user.userId,
      masterUserID: user.masterUserId,
    });
  }

  @Post('bulk')
  @RequirePermission('hr-attendance:manage')
  @ApiOperation({
    summary: 'Crear cierres masivos por fechas o días de semana',
    description:
      'Acepta una lista explícita de fechas o un rango from/to, opcionalmente filtrado por weekdays. Para cerrar todos los domingos de un rango use weekdays: [0]. Cada fecha se persiste como un cierre independiente.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Identificador UUID de la tienda activa.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiBody({ type: CreateStoreClosureBulkDto })
  @ApiResponse({
    status: 201,
    description: 'Cierres masivos creados.',
    type: [StoreClosure],
  })
  @ApiBadRequestResponse({
    description: 'Payload sin dates ni rango from/to, o fechas inválidas.',
  })
  @ApiConflictResponse({
    description: 'Una de las fechas se solapa con un cierre existente.',
  })
  @ApiForbiddenResponse({
    description: 'Falta hr-attendance:manage o acceso a la tienda.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  createBulk(
    @GetStoreId() storeID: string,
    @Body() dto: CreateStoreClosureBulkDto,
    @GetUser() user: { userId?: string; masterUserId?: string },
  ) {
    return this.service.createBulk(storeID, dto, {
      userID: user.userId,
      masterUserID: user.masterUserId,
    });
  }

  @Delete(':id')
  @RequirePermission('hr-attendance:manage')
  @ApiOperation({
    summary: 'Cancelar un cierre de tienda',
    description:
      'Realiza una cancelación lógica. El registro permanece disponible para auditoría, pero deja de afectar el calendario.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Identificador UUID de la tienda activa.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador UUID del cierre activo.',
    format: 'uuid',
    example: 'f3a8c0d1-7f20-4c1f-a1f2-9892d63e10a0',
  })
  @ApiBody({ type: CancelStoreClosureDto, required: false })
  @ApiResponse({ status: 200, description: 'Cierre cancelado correctamente.' })
  @ApiNotFoundResponse({
    description: 'El cierre no existe o ya fue cancelado.',
  })
  @ApiForbiddenResponse({
    description: 'Falta hr-attendance:manage o acceso a la tienda.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  cancel(
    @GetStoreId() storeID: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelStoreClosureDto = {},
    @GetUser() user: { userId?: string; masterUserId?: string },
  ) {
    return this.service.cancel(
      storeID,
      id,
      { userID: user.userId, masterUserID: user.masterUserId },
      dto.reason,
    );
  }
}
