import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { GetSiiCodesQueryDto } from './dto/get-sii-codes-query.dto';

export interface SiiCodeItem {
  cod_actual: number;
  glosa_actual: string;
  cod_nuevo: number;
  glosa_nueva: string;
  tipo_traspaso: string;
}

export interface PaginatedSiiCodesResponse {
  items: SiiCodeItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class SiiCodesService implements OnModuleInit {
  private rawCodes: SiiCodeItem[] = [];

  onModuleInit() {
    this.loadData();
  }

  private loadData() {
    const filePath = path.join(
      __dirname,
      '..',
      'common',
      'data',
      'codigos_sii.json',
    );
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      this.rawCodes = JSON.parse(fileContent);
    } else {
      // Fallback para entorno compilado dist si difiere la ruta relativa
      const fallbackPath = path.join(
        process.cwd(),
        'src',
        'common',
        'data',
        'codigos_sii.json',
      );
      if (fs.existsSync(fallbackPath)) {
        const fileContent = fs.readFileSync(fallbackPath, 'utf-8');
        this.rawCodes = JSON.parse(fileContent);
      }
    }
  }

  private normalizeText(text: string): string {
    if (!text) return '';
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  findAll(query: GetSiiCodesQueryDto): PaginatedSiiCodesResponse {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;

    let filtered = this.rawCodes;

    if (query.code) {
      const cleanCodeStr = query.code.trim();
      filtered = filtered.filter(
        (item) =>
          item.cod_actual.toString().includes(cleanCodeStr) ||
          item.cod_nuevo.toString().includes(cleanCodeStr),
      );
    }

    if (query.search) {
      const searchNormalized = this.normalizeText(query.search);
      const searchWords = searchNormalized
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 0);

      if (searchWords.length > 0) {
        filtered = filtered.filter((item) => {
          const glosaActualNorm = this.normalizeText(item.glosa_actual);
          const glosaNuevaNorm = this.normalizeText(item.glosa_nueva);

          // Cada palabra buscada debe estar presente en glosa_actual O en glosa_nueva
          return searchWords.every(
            (word) =>
              glosaActualNorm.includes(word) || glosaNuevaNorm.includes(word),
          );
        });
      }
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const items = filtered.slice(startIndex, startIndex + limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }
}
