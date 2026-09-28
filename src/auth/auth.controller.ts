import { Controller, Post, Body, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiExtraModels,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GetUser } from './decorators/get-user.decorator';
import { AuthGuard } from './guards/auth.guard';
import { Public } from './decorators/public.decorator';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Autenticar usuario y devolver JWT' })
  @ApiResponse({ status: 200, description: 'Inicio de sesión exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('check-status')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Verificar estado de la autenticación y devolver un nuevo JWT',
  })
  @ApiResponse({ status: 200, description: 'Token válido' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  checkAuthStatus(@GetUser('id') userId: string) {
    return this.authService.checkAuthStatus(userId);
  }

  @Patch('change-password')
  @ApiExtraModels(ChangePasswordDto)
  @ApiOperation({
    summary: 'Cambiar la contraseña del usuario autenticado',
    description: [
      'Cambio de contraseña **autoservicio**: el usuario solo puede modificar su propia contraseña.',
      '',
      '**Identificación del usuario**',
      '- El usuario afectado se obtiene exclusivamente del JWT (`userId` del token).',
      '- No se acepta `userId` ni `email` en el body: el `ValidationPipe` global rechaza con `400` cualquier campo no declarado en el DTO (`forbidNonWhitelisted: true`).',
      '- La operación no requiere la contraseña actual, solo la nueva.',
      '',
      '**Efectos de la operación**',
      '- Hashea la nueva contraseña con bcrypt (10 rondas) y la persiste.',
      '- Incrementa `sessionVersion`, por lo que **todos los tokens emitidos antes dejan de ser válidos inmediatamente**, incluido el usado en esta petición.',
      '- El cliente debe descartar el token actual y volver a llamar a `POST /auth/login` para continuar operando.',
      '',
      '**Reglas y restricciones**',
      '- `newPassword` es obligatorio y debe tener al menos 6 caracteres.',
      '- Los usuarios de sistema (`isSystem: true`) no pueden cambiar su contraseña (`403`).',
      '- Un usuario solo puede cambiar su propia contraseña: no existe cambio para terceros en este endpoint.',
      '',
      '**Respuesta**',
      '- Devuelve `data.changed: true`. La respuesta HTTP viaja envuelta por el interceptor global con la forma `{ statusCode, message, error, data }`.',
    ].join('\n'),
  })
  @ApiBody({
    type: ChangePasswordDto,
    required: true,
    description:
      'Nueva contraseña del usuario autenticado. Solo se acepta el campo `newPassword`.',
    schema: {
      type: 'object',
      description:
        'La contraseña actual no se solicita. Enviar cualquier campo adicional produce `400`.',
      required: ['newPassword'],
      properties: {
        newPassword: {
          type: 'string',
          format: 'password',
          minLength: 6,
          example: 'NuevaClave123',
          description:
            'Nueva contraseña, mínimo 6 caracteres. Se hashea con bcrypt en el backend.',
        },
      },
    },
    examples: {
      cambioExitoso: {
        summary: 'Cambio de contraseña válido',
        description: 'Cumple la longitud mínima de 6 caracteres.',
        value: { newPassword: 'NuevaClave123' },
      },
      contrasenaCorta: {
        summary: 'Contraseña demasiado corta (400)',
        description:
          '`newPassword` no alcanza el mínimo de 6 caracteres exigido por `@MinLength(6)`.',
        value: { newPassword: '123' },
      },
      campoNoPermitido: {
        summary: 'Campo no permitido (400)',
        description:
          'Se envía `userId` en el body. El `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`) rechaza la petición porque el DTO solo declara `newPassword`.',
        value: { newPassword: 'NuevaClave123', userId: '3f1a2c4e-...' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Contraseña actualizada exitosamente. El `sessionVersion` fue incrementado, por lo que el token usado queda invalidado.',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Operación exitosa' },
        error: { type: 'string', nullable: true, example: null },
        data: {
          type: 'object',
          properties: {
            changed: { type: 'boolean', example: true },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Body inválido: campo faltante o no permitido, o `newPassword` con menos de 6 caracteres.',
    schema: {
      type: 'object',
      description:
        'El filtro global de excepciones devuelve `{ statusCode, message, error }`; `data` no se incluye en el JSON.',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: {
          type: 'array',
          items: { type: 'string' },
          example: ['newPassword must be longer than or equal to 6 characters'],
        },
        error: { type: 'string', example: 'BadRequest' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'No autorizado: token ausente, inválido o expirado, o `sessionVersion` desactualizado.',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: {
          type: 'string',
          example: 'Invalid or expired token',
        },
        error: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description:
      'Prohibido: token sin contexto tenant o intento de cambiar la contraseña de un usuario de sistema (`isSystem: true`).',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: {
          type: 'string',
          example: 'System user password cannot be changed',
        },
        error: { type: 'string', example: 'Forbidden' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description:
      'El usuario del token ya no existe en el tenant (por ejemplo, fue eliminado después de emitirse el JWT).',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: {
          type: 'string',
          example: 'User with ID 3f1a2c4e-... not found',
        },
        error: { type: 'string', example: 'NotFound' },
      },
    },
  })
  changePassword(
    @GetUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }
}
