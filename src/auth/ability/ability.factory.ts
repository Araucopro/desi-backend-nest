import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../multitenant/tenant-context.service';
import { User, UserStatus } from '../../users/entities/user.entity';
import {
  PermissionScope,
  RolePermission,
} from '../../roles/entities/role-permission.entity';
import { Role } from '../../roles/entities/role.entity';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../interfaces/jwt-payload.interface';

export type AuthorizationSubject = {
  permission: string;
  scope: PermissionScope;
};

export class TenantAbility {
  constructor(private readonly subjects: AuthorizationSubject[]) {}

  scopeFor(permission: string): PermissionScope | null {
    return (
      this.subjects.find((item) => item.permission === permission)?.scope ??
      null
    );
  }

  can(permission: string, ownerId?: string, currentUserId?: string): boolean {
    const subject = this.subjects.find(
      (item) => item.permission === permission,
    );
    if (!subject) return false;
    return subject.scope === PermissionScope.ALL || ownerId === currentUserId;
  }
}

@Injectable()
export class AbilityFactory {
  private readonly cache = new Map<string, AuthorizationSubject[]>();
  private readonly cacheTtlMs = 30_000;
  private readonly cacheTimes = new Map<string, number>();

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async createFor(
    payload: JwtPayload | MasterJwtPayload,
  ): Promise<TenantAbility> {
    const tenantId = this.getTenantId(payload);
    if (!tenantId) return new TenantAbility([]);

    return this.tenantContext.run(
      {
        tenantId,
        userId: this.getUserId(payload),
        masterUserId: this.getMasterUserId(payload),
        impersonating: this.isMasterImpersonation(payload),
      },
      async () => {
        const roleId = await this.resolveRoleId(payload, tenantId);
        if (!roleId) return new TenantAbility([]);
        const subjects = await this.loadRolePermissions(roleId);
        return new TenantAbility(subjects);
      },
    );
  }

  invalidate(roleId?: string): void {
    if (roleId) {
      this.cache.delete(roleId);
      this.cacheTimes.delete(roleId);
      return;
    }
    this.cache.clear();
    this.cacheTimes.clear();
  }

  async getSystemUserId(): Promise<string> {
    const tenantId = this.tenantContext.getTenantId();
    const user = await this.tenantContext.transaction((manager) =>
      manager.getRepository(User).findOne({
        where: { tenantID: tenantId, isSystem: true },
        select: ['userID'],
      }),
    );
    if (!user) throw new Error(`System user not found for tenant ${tenantId}`);
    return user.userID;
  }

  private async resolveRoleId(
    payload: JwtPayload | MasterJwtPayload,
    tenantId: string,
  ): Promise<string | null> {
    if (this.isMasterImpersonation(payload)) {
      const role = await this.tenantContext.transaction((manager) =>
        manager.getRepository(Role).findOne({
          where: { tenantID: tenantId, systemKey: 'TENANT_ADMIN' },
        }),
      );
      return role?.id ?? null;
    }

    const userId = this.getUserId(payload);
    if (!userId) return null;
    const user = await this.tenantContext.transaction((manager) =>
      manager.getRepository(User).findOne({
        where: {
          userID: userId,
          tenantID: tenantId,
          isSystem: false,
          status: UserStatus.ACTIVE,
        },
      }),
    );
    if (!user?.roleID) return null;
    return user.roleID;
  }

  private async loadRolePermissions(
    roleId: string,
  ): Promise<AuthorizationSubject[]> {
    const cachedAt = this.cacheTimes.get(roleId);
    if (cachedAt && Date.now() - cachedAt < this.cacheTtlMs) {
      return this.cache.get(roleId) ?? [];
    }
    const permissions = await this.tenantContext.transaction((manager) =>
      manager.getRepository(RolePermission).find({ where: { roleID: roleId } }),
    );
    const subjects = permissions.map(({ permissionKey, scope }) => ({
      permission: permissionKey,
      scope,
    }));
    this.cache.set(roleId, subjects);
    this.cacheTimes.set(roleId, Date.now());
    return subjects;
  }

  private getTenantId(
    payload: JwtPayload | MasterJwtPayload,
  ): string | undefined {
    return this.isMasterPayload(payload)
      ? payload.impersonatingTenantId
      : payload.tenantId;
  }

  private getUserId(
    payload: JwtPayload | MasterJwtPayload,
  ): string | undefined {
    return this.isMasterPayload(payload) ? undefined : payload.userId;
  }

  private getMasterUserId(
    payload: JwtPayload | MasterJwtPayload,
  ): string | undefined {
    return this.isMasterPayload(payload) ? payload.masterUserId : undefined;
  }

  private isMasterImpersonation(
    payload: JwtPayload | MasterJwtPayload,
  ): boolean {
    return (
      this.isMasterPayload(payload) && Boolean(payload.impersonatingTenantId)
    );
  }

  private isMasterPayload(
    payload: JwtPayload | MasterJwtPayload,
  ): payload is MasterJwtPayload {
    return 'masterUserId' in payload;
  }
}
