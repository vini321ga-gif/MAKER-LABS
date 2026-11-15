import { env } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import express from 'express';
import schemaSql from '../schema.sql?raw';
import { createApiApp } from '../server/app.ts';
import { createD1Database } from './database.ts';

const workerEnv = env as typeof env & {
  APP_ENV: string;
  SESSION_SECRET: string;
};

const db = createD1Database(workerEnv.DB);
const app = createApiApp(db, schemaSql, workerEnv.FILES);
app.listen(3000);

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
      if (!workerEnv.DB || !workerEnv.ASSETS || !workerEnv.FILES) {
        return Response.json(
          { error: 'Cloudflare bindings DB, ASSETS and FILES must be configured.' },
          { status: 503 }
        );
      }
      if (!workerEnv.SESSION_SECRET) {
        return Response.json(
          { error: 'Set SESSION_SECRET as a Worker secret before using the app.' },
          { status: 503 }
        );
      }
      process.env.SESSION_SECRET = workerEnv.SESSION_SECRET;
      process.env.NODE_ENV = workerEnv.APP_ENV === 'production' ? 'production' : 'development';
      try {
        await ensureInitialized();
        return await handleAsNodeRequest(3000, request);
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error(`API initialization or request failed: ${detail}`);
        return Response.json({ error: 'El servidor no pudo procesar la solicitud' }, { status: 500 });
      }
    }

    if (!workerEnv.ASSETS) {
      return new Response('Assets binding is not configured.', { status: 503 });
    }
    return workerEnv.ASSETS.fetch(request);
  },
};
