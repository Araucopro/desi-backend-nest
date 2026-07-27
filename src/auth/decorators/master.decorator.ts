import { SetMetadata } from '@nestjs/common';
export const MASTER_ROUTE = 'master_route';
export const MasterRoute = () => SetMetadata(MASTER_ROUTE, true);
