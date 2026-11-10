import Fastify, { type FastifyInstance } from 'fastify';
import { verifyToken } from './auth.js';
import type { NotificationStore } from './store.js';

export interface ServerOptions {
  jwtSecret: string;
  /** Origins allowed to call the API from a browser (only needed when the site is on another address). */
  corsOrigins?: string[];
}

export function buildApp(store: NotificationStore, options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const origins = new Set(options.corsOrigins ?? []);

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && origins.has(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Headers', 'authorization, content-type, x-correlation-id');
      reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      reply.header('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') return reply.code(204).send();
  });

  app.get('/health', async () => ({ status: 'UP' }));

  // The history of the company in the token, and nothing else.
  app.get('/notifications', async (request, reply) => {
    const header = request.headers.authorization ?? '';
    const claims = header.toLowerCase().startsWith('bearer ') ? verifyToken(header.slice(7).trim(), options.jwtSecret) : null;
    if (!claims) return reply.code(401).send({ detail: 'Faça login para continuar' });

    const { customerId } = request.query as { customerId?: string };
    const rows = store.listByOrg(claims.org, 100).filter((row) => !customerId || row.customerId === customerId);
    return rows.map((row) => ({
      id: row.eventId,
      type: row.type,
      to: row.customerEmail,
      customerId: row.customerId,
      invoiceId: row.invoiceId,
      subject: row.subject,
      body: row.body,
      createdAt: row.sentAt,
    }));
  });

  return app;
}
