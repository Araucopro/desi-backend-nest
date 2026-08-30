import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Store } from '../stores/entities/store.entity';
import {
  CreateDteDocumentDto,
  DteResponseValue,
} from './dto/create-dte-document.dto';
import { mapToDocumentPayload } from './dte-item-resolver';

const store = {
  storeID: 'store-1',
  tenantID: 'tenant-1',
  rut: '76123456-7',
  name: 'Tienda Demo',
  businessName: 'Tienda Demo SpA',
  address: 'Av. Siempre Viva 123',
  city: 'Santiago',
  phone: '+56 2 1234 5678',
  giro: 'VENTA AL POR MENOR',
  acteco: '479100',
  cdgSIISucur: '0',
} as Store;

function nceDto(
  overrides: Partial<CreateDteDocumentDto> = {},
): CreateDteDocumentDto {
  return {
    response: [DteResponseValue.FOLIO, DteResponseValue.STATUS],
    dte: {
      Encabezado: {
        IdDoc: {
          TipoDTE: 61,
          Folio: 0,
          FchEmis: '2026-08-30',
          IndServicio: '3',
        },
        Emisor: {
          RUTEmisor: '76123456-7',
          RznSocEmisor: 'Tienda Demo SpA',
          GiroEmisor: 'VENTA AL POR MENOR',
        },
        Receptor: {
          RUTRecep: '66666666-6',
          RznSocRecep: 'Público General',
        },
        Totales: {
          MntNeto: 1000,
          TasaIVA: '19',
          IVA: 190,
          MntTotal: 1190,
          MontoPeriodo: 1190,
          VlrPagar: 1190,
        },
      },
      Detalle: [
        {
          NroLinDet: 1,
          NmbItem: 'Producto devuelto',
          QtyItem: 1,
          PrcItem: 1190,
          MontoItem: 1190,
        },
      ],
      Referencia: [
        {
          NroLinRef: 1,
          TpoDocRef: 39,
          FolioRef: 1024,
          FchRef: '2026-08-18',
          CodRef: 1,
          RazonRef: 'Anulación por devolución',
        },
      ],
    },
    ...overrides,
  } as CreateDteDocumentDto;
}

function createManager(): EntityManager {
  return {
    findOne: jest.fn(async (entity: unknown) => {
      if (entity === Store) return store;
      return null;
    }),
  } as unknown as EntityManager;
}

describe('mapToDocumentPayload (Nota de Crédito)', () => {
  it('normaliza el Emisor de una NCE 61 al esquema de factura aunque llegue estilo boleta', async () => {
    const dto = nceDto();

    await mapToDocumentPayload(createManager(), dto, store.storeID);

    expect(dto.dte.Encabezado.Emisor).toMatchObject({
      RUTEmisor: '76123456-7',
      RznSoc: 'Tienda Demo SpA',
      GiroEmis: 'VENTA AL POR MENOR',
      Acteco: ['479100'],
      DirOrigen: 'Av. Siempre Viva 123',
      CmnaOrigen: 'Santiago',
      Telefono: '+56 2 1234 5678',
      CdgSIISucur: '0',
    });
    expect(dto.dte.Encabezado.Emisor).not.toHaveProperty('RznSocEmisor');
    expect(dto.dte.Encabezado.Emisor).not.toHaveProperty('GiroEmisor');

    expect(dto.dte.Encabezado.Totales).toMatchObject({
      MntNeto: 1000,
      TasaIVA: '19',
      IVA: 190,
      MntTotal: 1190,
      MontoPeriodo: 1190,
      VlrPagar: 1190,
    });

    expect(dto.dte.Referencia).toMatchObject([
      {
        TpoDocRef: 39,
        FolioRef: 1024,
        CodRef: 1,
        RazonRef: 'Anulación por devolución',
      },
    ]);
  });

  it('rechaza una NCE 61 sin Referencia al documento original', async () => {
    const dto = nceDto();
    delete dto.dte.Referencia;

    await expect(
      mapToDocumentPayload(createManager(), dto, store.storeID),
    ).rejects.toThrow(
      new BadRequestException(
        'La Nota de Crédito (61) debe incluir al menos una Referencia al documento original',
      ),
    );
  });
});
