import { Kafka, logLevel } from 'kafkajs';
import { config } from './config.js';
import type { EventHandler } from './handler.js';
import type { Logger } from './logger.js';

// One topic carries every event of an invoice, keyed by invoice id, so they arrive in order
const TOPICS = ['invoice.events'];

/** Connects to Kafka and keeps retrying until the topics exist (billing-service creates them). */
export async function startConsumer(handler: EventHandler, log: Logger): Promise<void> {
  const kafka = new Kafka({ clientId: 'notification-service', brokers: config.kafkaBrokers, logLevel: logLevel.NOTHING });

  for (;;) {
    const consumer = kafka.consumer({ groupId: config.groupId });
    try {
      await consumer.connect();
      for (const topic of TOPICS) {
        await consumer.subscribe({ topic, fromBeginning: true });
      }
      await consumer.run({
        eachMessage: async ({ message }) => {
          if (message.value) await handler.handle(message.value.toString('utf8'));
        },
      });
      log.info('Kafka consumer running', { topics: TOPICS });
      return;
    } catch (error) {
      log.warn('Kafka not ready, retrying in 5s', { error: String(error) });
      await consumer.disconnect().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
