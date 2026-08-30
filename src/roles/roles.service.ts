import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { Permission } from './entities/permission.entity';
import {
  PermissionScope,
  RolePermission,
} from './entities/role-permission.entity';
import { Role } from './entities/role.entity';
import { User } from '../users/entities/user.entity';
import { AbilityFactory } from '../auth/ability/ability.factory';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly tenantContext: TenantContextService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.tenantContext.transaction((manager) =>
      manager.getRepository(Role).find({
        relations: ['permissions', 'permissions.permission'],
        order: { name: 'ASC' },
      }),
    );
  }

  async findPermissions(): Promise<Permission[]> {
    return this.permissionRepository.find({ order: { key: 'ASC' } });
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    const tenantID = this.tenantContext.getTenantId();
    return this.tenantContext.transaction(async (manager) => {
      const repository = manager.getRepository(Role);
      const existing = await repository.findOne({
        where: { tenantID, name: dto.name },
      });
      if (existing) throw new ConflictException('Role already exists');
      return repository.save(
        repository.create({
          tenantID,
          name: dto.name,
          systemKey: null,
          isSystem: false,
        }),
      );
    });
  }

  async updatePermissions(
    roleID: string,
    dto: UpdateRolePermissionsDto,
  ): Promise<Role> {
    const tenantID = this.tenantContext.getTenantId();
    return this.tenantContext.transaction(async (manager) => {
      const roles = manager.getRepository(Role);
      const role = await roles.findOne({ where: { id: roleID, tenantID } });
      if (!role) throw new NotFoundException('Role not found');
      if (role.isSystem)
        throw new ForbiddenException('System role cannot be modified');

      const permissionRepository = manager.getRepository(Permission);
      const permissionKeys = [
        ...new Set(dto.permissions.map((item) => item.permissionKey)),
      ];
      if (permissionKeys.length !== dto.permissions.length) {
        throw new BadRequestException('Duplicate permissions are not allowed');
      }
      const permissions = await permissionRepository.findBy({
        key: In(permissionKeys),
      });
      if (permissions.length !== permissionKeys.length) {
        throw new BadRequestException('One or more permissions do not exist');
      }
      const permissionByKey = new Map(
        permissions.map((permission) => [permission.key, permission]),
      );
      for (const item of dto.permissions) {
        if (
          item.scope === PermissionScope.OWN &&
          !permissionByKey.get(item.permissionKey)!.supportsOwnScope
        ) {
          throw new BadRequestException(
            `Permission ${item.permissionKey} does not support OWN scope`,
          );
        }
      }

      await manager.getRepository(RolePermission).delete({ roleID, tenantID });
      await manager.getRepository(RolePermission).save(
        dto.permissions.map((item) =>
          manager.getRepository(RolePermission).create({
            tenantID,
            roleID,
            permissionKey: item.permissionKey,
            scope: item.scope,
          }),
        ),
      );
      role.updatedAt = new Date();
      const saved = await roles.save(role);
      this.abilityFactory.invalidate(roleID);
      return saved;
    });
  }

  async update(roleID: string, dto: UpdateRoleDto): Promise<Role> {
    const tenantID = this.tenantContext.getTenantId();
    return this.tenantContext.transaction(async (manager) => {
      const repository = manager.getRepository(Role);
      const role = await repository.findOne({
        where: { id: roleID, tenantID },
      });
      if (!role) throw new NotFoundException('Role not found');
      if (role.isSystem)
        throw new ForbiddenException('System role cannot be renamed');
      role.name = dto.name;
      return repository.save(role);
    });
  }

  async remove(roleID: string): Promise<void> {
    const tenantID = this.tenantContext.getTenantId();
    await this.tenantContext.transaction(async (manager) => {
      const role = await manager
        .getRepository(Role)
        .findOne({ where: { id: roleID, tenantID } });
      if (!role) throw new NotFoundException('Role not found');
      if (role.isSystem)
        throw new ForbiddenException('System role cannot be deleted');
      const users = await manager
        .getRepository(User)
        .count({ where: { tenantID, roleID } });
      if (users > 0) throw new ConflictException('Role is assigned to users');
      await manager.getRepository(Role).delete({ id: roleID, tenantID });
      this.abilityFactory.invalidate(roleID);
    });
  }
}
