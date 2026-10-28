import { config } from './config.js';
import { startConsumer } from './consumer.js';
import { EventHandler } from './handler.js';
import { logger } from './logger.js';
import { SmtpMailer } from './mailer.js';
import { buildApp } from './server.js';
import { SqliteStore } from './store.js';

const store = new SqliteStore(config.dbPath);
const handler = new EventHandler(store, new SmtpMailer(), logger);
const app = buildApp(store);

await app.listen({ port: config.port, host: '0.0.0.0' });
logger.info('HTTP server listening', { port: config.port });

// Do not block the HTTP server (and /health) while Kafka is still starting.
void startConsumer(handler, logger);
