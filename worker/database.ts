import type { D1Database } from '@cloudflare/workers-types';
import type { AppDatabase } from '../server/app.ts';

export function createD1Database(binding: D1Database): AppDatabase {
  return {
    async queryAll<T = Record<string, unknown>>(sql: string, params: Array<string | number | null> = []) {
      const statement = binding.prepare(sql);
      const result = params.length ? await statement.bind(...params).all<T>() : await statement.all<T>();
      return result.results;
    },
    async queryOne<T = Record<string, unknown>>(sql: string, params: Array<string | number | null> = []) {
      const statement = binding.prepare(sql);
      const result = params.length ? await statement.bind(...params).first<T>() : await statement.first<T>();
      return result ?? null;
    },
    async run(sql: string, params: Array<string | number | null> = []) {
      const statement = binding.prepare(sql);
      const result = params.length ? await statement.bind(...params).run() : await statement.run();
      return {
        changes: Number(result.meta.changes || 0),
        lastInsertRowid: Number(result.meta.last_row_id || 0),
      };
    },
    async getStatus() {
      try {
        await binding.prepare('SELECT 1 AS ok').first();
        return {
          mode: 'cloudflare_d1',
          driverLabel: 'Cloudflare D1 (Worker binding)',
          databaseName: 'maker-labs-db',
          d1Configured: true,
          connected: true,
          lastError: null,
        } as const;
      } catch (error) {
        return {
          mode: 'cloudflare_d1',
          driverLabel: 'Cloudflare D1 (Worker binding)',
          databaseName: 'maker-labs-db',
          d1Configured: true,
          connected: false,
          lastError: error instanceof Error ? error.message : 'Error de conexión',
        } as const;
      }
    },
  };
}
