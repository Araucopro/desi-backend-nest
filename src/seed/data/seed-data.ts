import { StoreType } from '../../stores/entities/store.entity';

export interface SeedProduct {
  name: string;
  description: string;
  brand: string;
  image: string;
  type: string;
  genre: 'Hombre' | 'Mujer' | 'Unisex';
  variations: {
    sku: string;
    size: string;
    color: string;
    stock: number;
    priceCost: number;
    priceList: number;
  }[];
}

interface SeedStore {
  name: string;
  address: string;
  phone: string;
  email: string;
  isCentralStore: boolean;
  location: string;
  rut: string;
  city: string;
  type: StoreType;
}

export const initialData = {
  stores: [
    {
      name: 'D3SI Avocco',
      address: 'Calle de Purén',
      phone: '+56911111111',
      email: 'contacto@d3si.cl',
      isCentralStore: true,
      location: 'Centro',
      rut: '76.123.456-1',
      city: 'Purén',
      type: StoreType.CENTRAL,
    },
    {
      name: 'Mall Plaza',
      address: 'Av. Américo Vespucio 123',
      phone: '+56922222222',
      email: 'mallplaza@desi.cl',
      isCentralStore: false,
      location: 'Mall Plaza Vespucio',
      rut: '76.123.456-2',
      city: 'La Florida',
      type: StoreType.FRANCHISE,
    },
    {
      name: 'Central Ahumada',
      address: 'Calle Ahumada 456',
      phone: '+56933333333',
      email: 'centro@desi.cl',
      isCentralStore: false,
      location: 'Centro',
      rut: '76.123.456-3',
      city: 'Santiago',
      type: StoreType.FRANCHISE,
    },
  ] as SeedStore[],
  categories: [
    'Poleras',
    'Pantalones',
    'Chaquetas',
    'Zapatillas',
    'Accesorios',
  ],
  products: [
    {
      name: 'Polera Básica Oversize',
      description: 'Polera de algodón premium corte oversize.',
      brand: 'Desi Basic',
      image:
        'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80',
      genre: 'Unisex',
      type: 'Poleras',
      variations: [
        {
          sku: 'TS-OVR-BLK-M',
          size: 'M',
          color: 'Negro',
          stock: 100,
          priceCost: 5000,
          priceList: 14990,
        },
        {
          sku: 'TS-OVR-BLK-L',
          size: 'L',
          color: 'Negro',
          stock: 80,
          priceCost: 5000,
          priceList: 14990,
        },
        {
          sku: 'TS-OVR-WHT-M',
          size: 'M',
          color: 'Blanco',
          stock: 90,
          priceCost: 5000,
          priceList: 14990,
        },
      ],
    },
    {
      name: 'Jeans Slim Fit Dark',
      description: 'Jeans ajustados color oscuro elásticos.',
      brand: 'Denim Co',
      image:
        'https://images.unsplash.com/photo-1542272617-08f086303b96?auto=format&fit=crop&q=80',
      genre: 'Hombre',
      type: 'Pantalones',
      variations: [
        {
          sku: 'JN-SLM-DK-40',
          size: '40',
          color: 'Azul Oscuro',
          stock: 50,
          priceCost: 12000,
          priceList: 29990,
        },
        {
          sku: 'JN-SLM-DK-42',
          size: '42',
          color: 'Azul Oscuro',
          stock: 45,
          priceCost: 12000,
          priceList: 29990,
        },
      ],
    },
    {
      name: 'Chaqueta Bomber Urban',
      description: 'Chaqueta ligera estilo urbano impermeable.',
      brand: 'Urban Wear',
      image:
        'https://images.unsplash.com/photo-1551028919-ac66c5f80166?auto=format&fit=crop&q=80',
      genre: 'Unisex',
      type: 'Chaquetas',
      variations: [
        {
          sku: 'JKT-BMB-GRN-M',
          size: 'M',
          color: 'Verde Militar',
          stock: 30,
          priceCost: 18000,
          priceList: 45990,
        },
        {
          sku: 'JKT-BMB-GRN-L',
          size: 'L',
          color: 'Verde Militar',
          stock: 25,
          priceCost: 18000,
          priceList: 45990,
        },
      ],
    },
    {
      name: 'Fitz Roy Vantablack',
      description: 'Zapatillas de running con tecnología Vantablack.',
      brand: 'D3SI',
      image:
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80',
      genre: 'Unisex',
      type: 'Zapatillas',
      variations: [
        {
          sku: 'SNK-RTR-RED-40',
          size: '40',
          color: 'Rojo/Blanco',
          stock: 40,
          priceCost: 20000,
          priceList: 59990,
        },
        {
          sku: 'SNK-RTR-RED-41',
          size: '41',
          color: 'Rojo/Blanco',
          stock: 35,
          priceCost: 20000,
          priceList: 59990,
        },
      ],
    },
    {
      name: 'Gorra Ajustable Logo',
      description: 'Gorra con visera curva y logo bordado.',
      brand: 'Desi Acc',
      image:
        'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&q=80',
      genre: 'Unisex',
      type: 'Accesorios',
      variations: [
        {
          sku: 'CAP-LOG-BLK-OS',
          size: 'Única',
          color: 'Negro',
          stock: 150,
          priceCost: 3000,
          priceList: 9990,
        },
      ],
    },
  ] as SeedProduct[],
};
