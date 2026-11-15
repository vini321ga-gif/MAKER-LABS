import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.ts';
import { createApiApp } from './server/app.ts';

const schemaPath = path.resolve(process.cwd(), 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.SESSION_SECRET) {
  throw new Error('Set SESSION_SECRET before starting the production server.');
}
await db.initializeSchema(schemaSql);

const app = createApiApp(db, schemaSql);
if (!isProd) {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distDir = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`PrecisionHub server listening on http://0.0.0.0:${port}`);
});
