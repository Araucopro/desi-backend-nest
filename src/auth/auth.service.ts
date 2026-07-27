import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import * as bcrypt from 'bcrypt';
import { Tenant, TenantStatus } from '../multitenant/entities/tenant.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

  /**
   * Busca un usuario por email bypasseando RLS.
   * Requerido en login porque aún no tenemos tenant_id (problema chicken-and-egg).
   * Funciona si el DB user es superuser o tiene el atributo BYPASSRLS.
   */
  private async findUserByEmailGlobal(email: string): Promise<User | null> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL row_security = off`);
      return manager.getRepository(User).findOne({ where: { email } });
    });
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    try {
      // Sin x-tenant-id: buscamos al usuario por email globalmente
      const user = await this.findUserByEmailGlobal(email);
      if (!user) throw new UnauthorizedException('Invalid credentials');

      // Validar que el tenant del usuario esté activo
      const tenant = await this.tenantRepo.findOne({
        where: { tenantID: user.tenantID },
      });
      if (!tenant || tenant.status !== TenantStatus.ACTIVE) {
        throw new UnauthorizedException('Tenant is not active');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

      const payload: JwtPayload = {
        type: 'tenant',
        userId: user.userID,
        tenantId: user.tenantID,
        sessionVersion: user.sessionVersion,
        id: user.userID,
        email: user.email,
        role: user.role,
      };

      return {
        user: {
          id: user.userID,
          email: user.email,
          name: user.name,
          role: user.role,
          userImg: user.userImg,
        },
        accessToken: await this.jwtService.signAsync(payload),
      };
    } catch (error) {
      this.logger.error(`Login failed for email ${email}: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  async checkAuthStatus(userId: string) {
    const user = await this.usersService.findOneById(userId);

    const payload: JwtPayload = {
      type: 'tenant',
      userId: user.userID,
      tenantId: user.tenantID,
      sessionVersion: user.sessionVersion,
      id: user.userID,
      email: user.email,
      role: user.role,
    };

    return {
      user: {
        id: user.userID,
        email: user.email,
        name: user.name,
        role: user.role,
        userImg: user.userImg,
      },
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}
