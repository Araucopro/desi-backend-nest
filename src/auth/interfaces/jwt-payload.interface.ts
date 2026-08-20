import { UserRole } from '../../users/entities/user.entity';

export interface JwtPayload {
  type: 'tenant' | 'master';
  userId: string;
  tenantId: string;
  timeZone?: string;
  sessionVersion: number;
  id: string;
  email: string;
  role: UserRole;
}

export interface MasterJwtPayload {
  type: 'master';
  masterUserId: string;
  role: string;
  sessionVersion: number;
  impersonatingTenantId?: string;
  impersonatingTimeZone?: string;
  impersonatedBy?: string;
}
