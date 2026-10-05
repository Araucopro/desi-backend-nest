import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { MasterRoute } from '../auth/decorators/master.decorator';
import { MasterAuthGuard } from '../auth/guards/master-auth.guard';
import { MasterRole } from '../multitenant/entities/master-user.entity';
import {
  CreateCommerceChannelDto,
  UpdateCommerceChannelDto,
} from './dto/create-commerce-channel.dto';
import { MasterCommerceService } from './master-commerce.service';

type MasterRequest = FastifyRequest & {
  user: { masterUserId: string; role: MasterRole };
};

@ApiTags('Master ecommerce channels')
@ApiBearerAuth()
@MasterRoute()
@UseGuards(MasterAuthGuard)
@Controller('master/tenants/:tenantID/commerce-channels')
export class MasterCommerceController {
  constructor(private readonly channels: MasterCommerceService) {}

  @Get()
  @ApiOperation({ summary: 'Listar canales ecommerce de un tenant' })
  list(@Param('tenantID', ParseUUIDPipe) tenantID: string) {
    return this.channels.list(tenantID);
  }

  @Post()
  @ApiOperation({
    summary: 'Asignar un ecommerce al tenant y emitir token una sola vez',
  })
  create(
    @Param('tenantID', ParseUUIDPipe) tenantID: string,
    @Body() dto: CreateCommerceChannelDto,
    @Req() request: MasterRequest,
  ) {
    return this.channels.create(
      tenantID,
      dto,
      request.user.masterUserId,
      request.user.role,
    );
  }

  @Patch(':channelID')
  @ApiOperation({
    summary: 'Cambiar tienda, nombre, dominio o estado del canal',
  })
  update(
    @Param('tenantID', ParseUUIDPipe) tenantID: string,
    @Param('channelID', ParseUUIDPipe) channelID: string,
    @Body() dto: UpdateCommerceChannelDto,
    @Req() request: MasterRequest,
  ) {
    return this.channels.update(
      tenantID,
      channelID,
      dto,
      request.user.masterUserId,
      request.user.role,
    );
  }

  @Post(':channelID/rotate-token')
  @ApiOperation({
    summary: 'Invalidar token anterior y emitir uno nuevo una sola vez',
  })
  rotate(
    @Param('tenantID', ParseUUIDPipe) tenantID: string,
    @Param('channelID', ParseUUIDPipe) channelID: string,
    @Req() request: MasterRequest,
  ) {
    return this.channels.rotate(
      tenantID,
      channelID,
      request.user.masterUserId,
      request.user.role,
    );
  }
}
