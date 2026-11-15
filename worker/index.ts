import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import express from 'express';
import schemaSql from '../schema.sql?raw';
import { createApiApp } from '../server/app.ts';
import { createD1Database } from './database.ts';

const workerEnv = env as typeof env & {
  APP_ENV: string;
  SESSION_SECRET: string;
};

if (!workerEnv.DB || !workerEnv.ASSETS || !workerEnv.FILES) {
  throw new Error('Cloudflare bindings DB, ASSETS and FILES must be configured.');
}
if (!workerEnv.SESSION_SECRET) {
  throw new Error('Set SESSION_SECRET as a Worker secret before running the app.');
}

process.env.SESSION_SECRET = workerEnv.SESSION_SECRET;
process.env.NODE_ENV = workerEnv.APP_ENV === 'production' ? 'production' : 'development';
const db = createD1Database(workerEnv.DB);

const app = createApiApp(db, schemaSql, workerEnv.FILES);
app.listen(3000);
const handleExpressRequest = httpServerHandler({ port: 3000 });

let initialization: Promise<void> | undefined;
function ensureInitialized(): Promise<void> {
  if (workerEnv.APP_ENV !== 'development') return Promise.resolve();
  initialization ??= db
    .exec(schemaSql)
    .catch((error: unknown) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        await ensureInitialized();
        return await handleExpressRequest(request);
      } catch (error) {
        console.error('API initialization or request failed:', error);
        return Response.json({ error: 'El servidor no pudo procesar la solicitud' }, { status: 500 });
      }
    }

    return workerEnv.ASSETS.fetch(request);
  },
};
