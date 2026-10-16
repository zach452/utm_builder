import { mkdirSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Serves /api/* in `npm run dev` the way Vercel does in production. Without a DATABASE_URL the
 * library lives in an embedded Postgres under .data/, so local dev needs no setup.
 */
function api(): Plugin {
  return {
    name: 'utm-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        if (!path.startsWith('/api/')) return next();
        try {
          if (!process.env.DATABASE_URL && !globalThis.__utmQuery) {
            const { PGlite } = await import('@electric-sql/pglite');
            const dir = resolve(import.meta.dirname, '.data/pglite');
            mkdirSync(dir, { recursive: true });
            const db = new PGlite(dir);
            globalThis.__utmQuery = async (text, params) => (await db.query<Record<string, unknown>>(text, params)).rows;
          }
          const mod = await server.ssrLoadModule(`/api/${path.slice(5)}.ts`);
          const handler = mod[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const response = await handler(await toRequest(req));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  Object.entries(req.headers).forEach(([k, v]) => v !== undefined && headers.set(k, Array.isArray(v) ? v.join(', ') : v));
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
}

export default defineConfig({
  plugins: [react(), api()],
});
