import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type SqlParam = string | number | null;

export interface DbStatus {
  mode: 'cloudflare_d1' | 'local_sqlite';
  driverLabel: string;
  databaseName: string;
  d1Configured: boolean;
  connected: boolean;
  lastError: string | null;
}

export interface D1Binding {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<{ count: number; duration: number }>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; meta: { changes?: number; last_row_id?: number } }>;
  run(): Promise<{ success: boolean; meta: { changes?: number; last_row_id?: number } }>;
}

class WorkshopDatabase {
  private sqlite: DatabaseSync | null = null;
  private d1Binding: D1Binding | null = null;
  private lastError: string | null = null;

  public isD1Configured(): boolean {
    return Boolean(this.d1Binding);
  }

  public configureD1Binding(binding: D1Binding): void {
    this.d1Binding = binding;
  }

  private getD1Statement(sql: string, params: SqlParam[]): D1PreparedStatement {
    if (!this.d1Binding) throw new Error('Cloudflare D1 binding is not configured');
    const statement = this.d1Binding.prepare(sql);
    return params.length ? statement.bind(...params) : statement;
  }

  private getLocalSqlite(): DatabaseSync {
    if (!this.sqlite) {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const dbPath = path.join(dataDir, 'workshop.db');
      this.sqlite = new DatabaseSync(dbPath);
      this.sqlite.exec('PRAGMA foreign_keys = ON;');
      this.sqlite.exec('PRAGMA journal_mode = WAL;');
    }
    return this.sqlite;
  }

  public async queryAll<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    if (this.d1Binding) {
      const result = await this.getD1Statement(sql, params).all<T>();
      return result.results;
    }
    const db = this.getLocalSqlite();
    const stmt = db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  public async queryOne<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    const rows = await this.queryAll<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  public async run(sql: string, params: SqlParam[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
    if (this.d1Binding) {
      const result = await this.getD1Statement(sql, params).run();
      return {
        changes: Number(result.meta?.changes || 0),
        lastInsertRowid: Number(result.meta?.last_row_id || 0),
      };
    }
    const db = this.getLocalSqlite();
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: Number(result.changes || 0),
      lastInsertRowid: Number(result.lastInsertRowid || 0),
    };
  }

  public async execScript(sqlScript: string): Promise<void> {
    if (this.d1Binding) {
      await this.d1Binding.exec(sqlScript);
      return;
    }
    const db = this.getLocalSqlite();
    db.exec(sqlScript);
  }

  public async getStatus(): Promise<DbStatus> {
    const d1Configured = this.isD1Configured();
    try {
      await this.queryOne('SELECT 1 AS ok');
      return {
        mode: d1Configured ? 'cloudflare_d1' : 'local_sqlite',
        driverLabel: d1Configured ? 'Cloudflare D1 (Worker binding)' : 'SQLite Local (data/workshop.db)',
        databaseName: d1Configured ? 'maker-labs-db' : 'workshop.db',
        d1Configured,
        connected: true,
        lastError: this.lastError,
      };
    } catch (err) {
      return {
        mode: d1Configured ? 'cloudflare_d1' : 'local_sqlite',
        driverLabel: d1Configured ? 'Cloudflare D1 (Worker binding)' : 'SQLite Local',
        databaseName: d1Configured ? 'maker-labs-db' : 'workshop.db',
        d1Configured,
        connected: false,
        lastError: err instanceof Error ? err.message : 'Error de conexión',
      };
    }
  }

  public async initializeSchema(providedSchemaSql?: string): Promise<void> {
    const schemaPath = path.resolve(process.cwd(), 'schema.sql');
    const schemaSql = providedSchemaSql ?? fs.readFileSync(schemaPath, 'utf-8');
    await this.execScript(schemaSql);
  }
}

export const db = new WorkshopDatabase();
