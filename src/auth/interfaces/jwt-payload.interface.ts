import { UserRole } from '../../users/entities/user.entity';

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
}
