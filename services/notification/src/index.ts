import { config } from './config.js';
import { startConsumer } from './consumer.js';
import { EventHandler } from './handler.js';
import { logger } from './logger.js';
import { SmtpMailer } from './mailer.js';
import { buildApp } from './server.js';
import { SqliteStore } from './store.js';

const store = new SqliteStore(config.dbPath);
const handler = new EventHandler(store, new SmtpMailer(), logger);
const app = buildApp(store, { jwtSecret: config.jwtSecret, corsOrigins: config.corsOrigins });

await app.listen({ port: config.port, host: '0.0.0.0' });
logger.info('HTTP server listening', { port: config.port });

// Demo sandboxes disappear after a day in billing-service; their history goes away a bit later.
const DEMO_TTL_MS = 48 * 3600 * 1000;
const purge = () => {
  const removed = store.purgeDemoBefore(new Date(Date.now() - DEMO_TTL_MS).toISOString());
  if (removed > 0) logger.info('Removed expired demo notifications', { removed });
};
purge();
setInterval(purge, 3600 * 1000).unref();

// Do not block the HTTP server (and /health) while Kafka is still starting.
void startConsumer(handler, logger);
