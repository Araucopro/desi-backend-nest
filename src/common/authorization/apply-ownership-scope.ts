import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { PermissionScope } from '../../roles/entities/role-permission.entity';

export function applyOwnershipScope<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  alias: string,
  scope: PermissionScope,
  ownerId: string,
): SelectQueryBuilder<T> {
  if (scope === PermissionScope.OWN) {
    queryBuilder.andWhere(`${alias}.userID = :ownerId`, { ownerId });
  }
  return queryBuilder;
}
