import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class UpdateStoreMonthlyTargetDto {
  @ApiPropertyOptional({
    description: 'Monto meta de ventas para ese mes',
    example: 26000000,
  })
  @IsNumber()
  @IsPositive()
  targetAmount?: number;
}
