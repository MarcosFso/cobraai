import Fastify, { type FastifyInstance } from 'fastify';
import type { NotificationStore } from './store.js';

export function buildApp(store: NotificationStore): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'UP' }));

  app.get('/notifications', async (request, reply) => {
    const { customerId } = request.query as { customerId?: string };
    if (!customerId) {
      return reply.code(400).send({ detail: 'customerId is required' });
    }
    return store.listByCustomer(customerId);
  });

  return app;
}
