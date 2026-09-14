import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { CustomMessage } from '../common/decorators/response-message';
import { CashRegisterSessionUsersService } from './cash-register-session-users.service';
import { AssignCashSessionUserDto } from './dto/assign-cash-session-user.dto';
import { QueryCashSessionUsersDto } from './dto/query-cash-session-users.dto';
import { RegisterCashSessionUserExitDto } from './dto/register-cash-session-user-exit.dto';
import { CashRegisterSessionUser } from './entities/cash-register-session-user.entity';

@ApiTags('Cajas')
@Controller('cash-registers/:cashRegisterID/sessions/:sessionId/operators')
export class CashRegisterSessionUsersController {
  constructor(
    private readonly sessionUsersService: CashRegisterSessionUsersService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Asignar un cajero a la sesión de caja',
    description:
      'Registra la entrada de un operador al turno. El usuario debe estar asignado a la tienda de la caja y la sesión debe estar abierta.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 201,
    description: 'Operador asignado a la sesión exitosamente.',
    type: CashRegisterSessionUser,
  })
  @ApiResponse({
    status: 409,
    description: 'El usuario ya está en turno en esta sesión.',
  })
  @CustomMessage('Operador asignado a la sesión exitosamente')
  assign(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: AssignCashSessionUserDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.sessionUsersService.assign(
      cashRegisterID,
      sessionId,
      dto,
      user,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Listar los operadores de una sesión de caja',
    description:
      'Devuelve la bitácora de cajeros del turno con sus horas de entrada y salida. Permite filtrar por operadores aún en turno y por rol.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiResponse({
    status: 200,
    description: 'Operadores de la sesión obtenidos exitosamente.',
    type: [CashRegisterSessionUser],
  })
  @CustomMessage('Operadores de la sesión obtenidos exitosamente')
  findSessionUsers(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: QueryCashSessionUsersDto,
  ) {
    return this.sessionUsersService.findSessionUsers(
      cashRegisterID,
      sessionId,
      query,
    );
  }

  @Patch(':sessionUserID/exit')
  @ApiOperation({
    summary: 'Registrar la salida de un operador de la sesión',
    description:
      'Sella la hora de salida del cajero. La sesión debe seguir abierta: al cerrarse, el sistema cierra los turnos automáticamente.',
  })
  @ApiParam({ name: 'cashRegisterID', description: 'ID UUID de la caja' })
  @ApiParam({ name: 'sessionId', description: 'ID UUID de la sesión de caja' })
  @ApiParam({
    name: 'sessionUserID',
    description: 'ID UUID del registro de operador en la sesión',
  })
  @ApiResponse({
    status: 200,
    description: 'Salida del operador registrada exitosamente.',
    type: CashRegisterSessionUser,
  })
  @ApiResponse({
    status: 409,
    description: 'El operador ya registró su salida.',
  })
  @CustomMessage('Salida del operador registrada exitosamente')
  registerExit(
    @Param('cashRegisterID', ParseUUIDPipe) cashRegisterID: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('sessionUserID', ParseUUIDPipe) sessionUserID: string,
    @Body() dto: RegisterCashSessionUserExitDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.sessionUsersService.registerExit(
      cashRegisterID,
      sessionId,
      sessionUserID,
      dto,
      user,
    );
  }
}
