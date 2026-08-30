import { Test, TestingModule } from '@nestjs/testing';
import { SiiCodesService } from './sii-codes.service';

describe('SiiCodesService', () => {
  let service: SiiCodesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SiiCodesService],
    }).compile();

    service = module.get<SiiCodesService>(SiiCodesService);
    service.onModuleInit();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe retornar resultados paginados por defecto', () => {
    const res = service.findAll({});
    expect(res.items.length).toBe(10);
    expect(res.meta.page).toBe(1);
    expect(res.meta.limit).toBe(10);
    expect(res.meta.total).toBeGreaterThan(0);
  });

  it('debe filtrar por código (cod_actual o cod_nuevo)', () => {
    const res = service.findAll({ code: '11101' });
    expect(res.items.some((item) => item.cod_nuevo === 11101)).toBe(true);
  });

  it('debe filtrar por glosa desordenada e insensible a mayúsculas y acentos', () => {
    // Ejemplo pedido: "administración de condominios" -> "Consejo de administración de edificios y condominios"
    const res = service.findAll({ search: 'administración de condominios' });
    expect(res.meta.total).toBeGreaterThan(0);
    const found = res.items.some(
      (item) =>
        item.glosa_actual.toLowerCase().includes('condominios') ||
        item.glosa_nueva.toLowerCase().includes('condominios'),
    );
    expect(found).toBe(true);
  });
});
