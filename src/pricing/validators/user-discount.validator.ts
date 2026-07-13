import { Injectable, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User, UserRole } from '../../users/entities/user.entity';
import { UserStore } from '../../relations/userstores/entities/userstore.entity';
import { StoreProduct } from '../../relations/storeproduct/entities/storeproduct.entity';

type UserDiscountValidationInput = {
  userID: string | null | undefined;
  manualDiscount: number;
  storeProduct: StoreProduct;
  baseUnitPrice: number;
  currentUnitPrice: number;
  quantity: number;
};

@Injectable()
export class UserDiscountValidator {
  constructor(private readonly dataSource: DataSource) {}

  async validate({
    userID,
    manualDiscount,
    storeProduct,
    baseUnitPrice,
    currentUnitPrice,
    quantity,
  }: UserDiscountValidationInput) {
    const defaultMax = parseFloat(
      process.env.DEFAULT_MAX_DISCOUNT_PERCENT || '30',
    );
    if (!userID) {
      throw new ForbiddenException(
        'Se requiere un usuario autenticado para aplicar descuento manual',
      );
    }

    const user = await this.dataSource.manager.findOne(User, {
      where: { userID },
    });

    if (!user) {
      throw new ForbiddenException('Usuario no autorizado para descontar');
    }

    const belongsToStore = await this.dataSource.manager.exists(UserStore, {
      where: {
        user: { userID },
        store: { storeID: storeProduct.store?.storeID },
      },
    });

    if (user.role !== UserRole.ADMIN && !belongsToStore) {
      throw new ForbiddenException(
        'El usuario no pertenece a la tienda de este producto',
      );
    }

    const roleMax = this.getRoleMaxDiscount(user.role, defaultMax);
    const dynamicUserMax = (user as User & { maxDiscountPercent?: unknown })
      .maxDiscountPercent;
    const allowedMaxDiscount =
      typeof dynamicUserMax === 'number'
        ? Math.min(roleMax, dynamicUserMax)
        : roleMax;

    if (manualDiscount > allowedMaxDiscount) {
      throw new ForbiddenException(
        'Descuento manual excede el límite permitido para el usuario',
      );
    }

    const minMarginPercent = parseFloat(
      process.env.MIN_MARGIN_PERCENT || '0.1',
    );
    const unitCost = Number(storeProduct.priceCost ?? 0);
    const projectedUnitPrice = currentUnitPrice * (1 - manualDiscount / 100);
    const minimumUnitPrice = unitCost * (1 + minMarginPercent);
    const projectedLineTotal = projectedUnitPrice * quantity;

    if (projectedLineTotal < 0) {
      throw new ForbiddenException(
        'El total proyectado del descuento no es valido',
      );
    }

    if (unitCost > 0 && projectedUnitPrice < minimumUnitPrice) {
      throw new ForbiddenException(
        'Descuento manual deja el precio por debajo del margen permitido',
      );
    }

    if (baseUnitPrice <= 0) {
      throw new ForbiddenException(
        'No se puede aplicar descuento manual sobre un precio base no valido',
      );
    }
  }

  private getRoleMaxDiscount(role: UserRole, defaultMax: number): number {
    const envKey = `MAX_DISCOUNT_PERCENT_${role.toUpperCase()}`;
    const configuredValue = process.env[envKey];
    return configuredValue ? parseFloat(configuredValue) : defaultMax;
  }
}
