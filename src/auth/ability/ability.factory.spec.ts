import { PermissionScope } from '../../roles/entities/role-permission.entity';
import { TenantAbility } from './ability.factory';

describe('TenantAbility', () => {
  it.each([PermissionScope.OWN, PermissionScope.ALL])(
    'applies %s scope consistently',
    (scope) => {
      const ability = new TenantAbility([{ permission: 'sales:read', scope }]);

      expect(ability.scopeFor('sales:read')).toBe(scope);
      expect(ability.can('sales:read', 'owner-1', 'owner-1')).toBe(true);
      expect(ability.can('sales:read', 'owner-2', 'owner-1')).toBe(
        scope === PermissionScope.ALL,
      );
      expect(ability.can('sales:write', 'owner-1', 'owner-1')).toBe(false);
    },
  );
});
