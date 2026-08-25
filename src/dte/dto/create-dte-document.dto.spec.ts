import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDteDocumentDto } from './create-dte-document.dto';

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    response: ['FOLIO'],
    dte: {
      Encabezado: {
        IdDoc: {
          TipoDTE: 39,
          FchEmis: '2026-08-03',
        },
        Emisor: {
          RUTEmisor: '76123456-7',
          RznSocEmisor: 'Tienda Demo SpA',
        },
        Receptor: {
          RUTRecep: '66666666-6',
          RznSocRecep: 'Anonimo',
        },
        Totales: {
          MntTotal: 1190,
        },
      },
      Detalle: [
        {
          NroLinDet: 1,
          NmbItem: 'Producto A',
          QtyItem: 1,
          PrcItem: 1000,
          MontoItem: 1000,
        },
      ],
    },
    ...overrides,
  };
}

async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(CreateDteDocumentDto, payload);
  return validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('CreateDteDocumentDto', () => {
  it('accepts a valid boleta (39) without FmaPago', async () => {
    const errors = await validateDto(basePayload());
    expect(errors).toEqual([]);
  });

  it('rejects a boleta that uses factura-only fields', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 39,
              FchEmis: '2026-08-03',
              FmaPago: '1',
              TpoTranVenta: '1',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSoc: 'Tienda Demo SpA',
            },
            Receptor: {
              RUTRecep: '66666666-6',
              RznSocRecep: 'Anonimo',
            },
            Totales: {
              MntNeto: 1000,
              TasaIVA: '19',
              IVA: 190,
              MntTotal: 1190,
              MontoPeriodo: 1190,
            },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto A',
              QtyItem: 1,
              PrcItem: 1000,
              MontoItem: 1000,
            },
          ],
        },
      }),
    );

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a boleta with factura-only totals', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 39,
              FchEmis: '2026-08-03',
              IndServicio: '3',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSocEmisor: 'Tienda Demo SpA',
            },
            Receptor: {
              RUTRecep: '66666666-6',
              RznSocRecep: 'Anonimo',
            },
            Totales: {
              MntNeto: 1000,
              TasaIVA: '19',
              IVA: 190,
              MntTotal: 1190,
              MontoPeriodo: 1190,
            },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto A',
              QtyItem: 1,
              PrcItem: 1000,
              MontoItem: 1000,
            },
          ],
        },
      }),
    );

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a boleta with Acteco or Telefono in Emisor', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 39,
              FchEmis: '2026-08-03',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSocEmisor: 'Tienda Demo SpA',
              Acteco: ['479100'],
              Telefono: '0 0',
            },
            Receptor: {
              RUTRecep: '66666666-6',
              RznSocRecep: 'Anonimo',
            },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto A',
              QtyItem: 1,
              PrcItem: 1000,
              MontoItem: 1000,
            },
          ],
        },
      }),
    );

    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a boleta with allowed optional Emisor fields', async () => {
    const payload = basePayload();
    Object.assign((payload.dte as any).Encabezado.Emisor, {
      GiroEmisor: 'VENTA AL POR MENOR',
      DirOrigen: 'Av. Siempre Viva 123',
      CmnaOrigen: 'Santiago',
      CdgSIISucur: '0',
    });

    const errors = await validateDto(payload);
    expect(errors).toEqual([]);
  });

  it('accepts a boleta with IndServicio and boleta totals', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 39,
              FchEmis: '2026-08-03',
              IndServicio: '3',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSocEmisor: 'Tienda Demo SpA',
            },
            Receptor: {
              RUTRecep: '66666666-6',
              RznSocRecep: 'Anonimo',
            },
            Totales: {
              MntNeto: 1000,
              IVA: 190,
              MntTotal: 1190,
              VlrPagar: 1190,
            },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto A',
              QtyItem: 1,
              PrcItem: 1000,
              MontoItem: 1000,
            },
          ],
        },
      }),
    );

    expect(errors).toEqual([]);
  });

  it('accepts a valid factura (33) with FmaPago', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 33,
              FchEmis: '2026-08-03',
              FmaPago: '2',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSoc: 'Tienda Demo SpA',
            },
            Receptor: {
              RUTRecep: '66666666-6',
              RznSocRecep: 'Cliente SpA',
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
              NmbItem: 'Producto A',
              QtyItem: 1,
              PrcItem: 840,
              MontoItem: 840,
            },
          ],
        },
      }),
    );

    expect(errors).toEqual([]);
  });

  it('accepts a nota de crédito (61) with Referencia', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 61,
              FchEmis: '2026-08-25',
              IndServicio: '3',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSocEmisor: 'Tienda Demo SpA',
            },
            Receptor: {
              RUTRecep: '66666666-6',
              RznSocRecep: 'Anonimo',
            },
            Totales: {
              MntNeto: 1000,
              IVA: 190,
              MntTotal: 1190,
              VlrPagar: 1190,
            },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto A',
              QtyItem: 1,
              PrcItem: 1190,
              MontoItem: 1190,
            },
          ],
          Referencia: {
            NroLinRef: 1,
            TpoDocRef: 39,
            FolioRef: 1024,
            FchRef: '2026-08-18',
            CodRef: '6',
            RazonRef: 'Devolución parcial',
          },
        },
      }),
    );

    expect(errors).toEqual([]);
  });

  it('accepts a guía de despacho (52) with DirDest/CmnaDest', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 52,
              FchEmis: '2026-08-25',
              IndTraslado: '1',
              DirDest: 'ARTURO PRAT 527 CURICO',
              CmnaDest: 'Curicó',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSoc: 'Tienda Demo SpA',
            },
            Receptor: {
              RUTRecep: '76123456-7',
              RznSocRecep: 'Cliente SpA',
            },
            Totales: {
              MntNeto: 2000,
              TasaIVA: '19',
              IVA: 380,
              MntTotal: 2380,
              VlrPagar: 2380,
            },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto A',
              QtyItem: 2,
              PrcItem: 1000,
              MontoItem: 2000,
            },
          ],
        },
      }),
    );

    expect(errors).toEqual([]);
  });

  it('rejects a guía de despacho without DirDest/CmnaDest', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 52,
              FchEmis: '2026-08-25',
              IndTraslado: '1',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSoc: 'Tienda Demo SpA',
            },
            Receptor: {
              RUTRecep: '76123456-7',
              RznSocRecep: 'Cliente SpA',
            },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto A',
              QtyItem: 1,
              PrcItem: 1000,
              MontoItem: 1000,
            },
          ],
        },
      }),
    );

    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts Referencia as an array with TpoDocRef 52', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 33,
              FchEmis: '2026-08-25',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSoc: 'Tienda Demo SpA',
            },
            Receptor: {
              RUTRecep: '76123456-7',
              RznSocRecep: 'Cliente SpA',
            },
            Totales: {
              MntNeto: 1000,
              TasaIVA: '19',
              IVA: 190,
              MntTotal: 1190,
              VlrPagar: 1190,
            },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto A',
              QtyItem: 1,
              PrcItem: 1000,
              MontoItem: 1000,
            },
          ],
          Referencia: [
            {
              NroLinRef: 1,
              TpoDocRef: 52,
              FolioRef: 777,
              FchRef: '2026-08-25',
              RazonRef: 'Guía de despacho',
            },
          ],
        },
      }),
    );

    expect(errors).toEqual([]);
  });

  it('normalizes a single Referencia object into an array', async () => {
    const payload = basePayload({
      dte: {
        Encabezado: {
          IdDoc: {
            TipoDTE: 61,
            FchEmis: '2026-08-25',
            IndServicio: '3',
          },
          Emisor: {
            RUTEmisor: '76123456-7',
            RznSocEmisor: 'Tienda Demo SpA',
          },
          Receptor: {
            RUTRecep: '66666666-6',
            RznSocRecep: 'Anonimo',
          },
        },
        Detalle: [
          {
            NroLinDet: 1,
            NmbItem: 'Producto A',
            QtyItem: 1,
            PrcItem: 1190,
            MontoItem: 1190,
          },
        ],
        Referencia: {
          NroLinRef: 1,
          TpoDocRef: 39,
          FolioRef: 1024,
          FchRef: '2026-08-18',
          CodRef: '6',
        },
      },
    });

    const instance = plainToInstance(CreateDteDocumentDto, payload);
    expect(instance.dte.Referencia).toHaveLength(1);
    expect(instance.dte.Referencia![0].TpoDocRef).toBe(39);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toEqual([]);
  });

  it('rejects a factura without receptor', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 33,
              FchEmis: '2026-08-03',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSoc: 'Tienda Demo SpA',
            },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto A',
              QtyItem: 1,
              PrcItem: 840,
              MontoItem: 840,
            },
          ],
        },
      }),
    );

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a payload without TipoDTE', async () => {
    const errors = await validateDto(
      basePayload({
        dte: {
          Encabezado: {
            IdDoc: {
              FchEmis: '2026-08-03',
            },
            Emisor: {
              RUTEmisor: '76123456-7',
              RznSoc: 'Tienda Demo SpA',
            },
            Receptor: {
              RUTRecep: '66666666-6',
              RznSocRecep: 'Cliente SpA',
            },
          },
          Detalle: [
            {
              NroLinDet: 1,
              NmbItem: 'Producto A',
              QtyItem: 1,
              PrcItem: 840,
              MontoItem: 840,
            },
          ],
        },
      }),
    );

    expect(errors.length).toBeGreaterThan(0);
  });
});
