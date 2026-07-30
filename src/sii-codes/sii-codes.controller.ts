import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { GetSiiCodesQueryDto } from './dto/get-sii-codes-query.dto';
import { SiiCodesService } from './sii-codes.service';

@ApiTags('Códigos SII')
@Controller('sii-codes')
export class SiiCodesController {
  constructor(private readonly siiCodesService: SiiCodesService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary:
      'Obtener lista paginada y filtrable de códigos de actividad económica SII',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de códigos SII',
  })
  findAll(@Query() query: GetSiiCodesQueryDto) {
    return this.siiCodesService.findAll(query);
  }
}
