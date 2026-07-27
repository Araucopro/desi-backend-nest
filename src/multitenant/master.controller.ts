import { Body, Controller, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { MasterService } from './master.service';
import { MasterAuthGuard } from '../auth/guards/master-auth.guard';
import { MasterRoute } from '../auth/decorators/master.decorator';
import { TenantStatus } from './entities/tenant.entity';
import { LoginMasterDto } from './dto/login-master.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ImpersonateTenantDto } from './dto/impersonate-tenant.dto';
import { Public } from '../auth/decorators/public.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Master Platform Administration')
@Controller('master')
export class MasterController {
  constructor(private readonly service: MasterService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión como usuario MASTER de plataforma' })
  @ApiResponse({ status: 200, description: 'Token de acceso de plataforma de tipo master' })
  login(@Body() dto: LoginMasterDto) {
    return this.service.loginMaster(dto);
  }

  @Post('tenants')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({ summary: 'Crear un nuevo tenant en la plataforma' })
  @ApiResponse({ status: 201, description: 'Tenant creado exitosamente' })
  create(@Body() dto: CreateTenantDto) {
    return this.service.createTenant(dto);
  }

  @Patch('tenants/:id/status')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  status(@Param('id') id: string, @Body() body: { status: TenantStatus }, @Req() request: any) {
    return this.service.setStatus(id, body.status, request.user.masterUserId);
  }

  @Post('tenants/:id/impersonate')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  impersonate(@Param('id') id: string, @Body() dto: ImpersonateTenantDto, @Req() request: any) {
    return this.service.impersonate(id, request.user.masterUserId, dto?.reason);
  }
}

