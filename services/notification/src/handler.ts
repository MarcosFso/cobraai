import { NOTIFIED_TYPES, parseEvent } from './events.js';
import type { Logger } from './logger.js';
import type { Mailer } from './mailer.js';
import { buildMessage } from './messages.js';
import type { NotificationStore } from './store.js';

export type Outcome = 'sent' | 'recorded' | 'duplicate' | 'ignored' | 'invalid';

export class EventHandler {
  constructor(
    private store: NotificationStore,
    private mailer: Mailer,
    private log: Logger,
  ) {}

  /**
   * Idempotent: the same eventId never sends two e-mails, even if Kafka delivers it twice.
   * Throws when the e-mail cannot be sent, so the consumer retries the message.
   */
  async handle(raw: string): Promise<Outcome> {
    const event = parseEvent(raw);
    if (!event) {
      this.log.warn('Discarding invalid event payload');
      return 'invalid';
    }
    const ctx = {
      eventId: event.eventId,
      correlationId: event.correlationId,
      orgId: event.orgId,
      invoiceId: event.invoiceId,
      type: event.type,
    };

    const message = NOTIFIED_TYPES.includes(event.type) ? buildMessage(event) : null;
    if (!message) {
      this.log.info('Event does not notify the customer', ctx);
      return 'ignored';
    }

    const claimed = this.store.claim({
      eventId: event.eventId,
      orgId: event.orgId,
      invoiceId: event.invoiceId,
      customerId: event.customerId,
      customerEmail: event.customerEmail,
      type: event.type,
      subject: message.subject,
      body: message.text,
      sentAt: event.occurredAt || new Date().toISOString(),
      demo: event.demo,
    });
    if (!claimed) {
      this.log.info('Duplicate event ignored', ctx);
      return 'duplicate';
    }

    if (event.seed) {
      // Sample data of a demo sandbox: it shows up in the history, but nobody receives an e-mail.
      this.log.info('Sample notification recorded', ctx);
      return 'recorded';
    }

    try {
      await this.mailer.send(event.customerEmail, message.subject, message.text);
    } catch (error) {
      this.store.release(event.eventId);
      this.log.error('E-mail failed, will retry', { ...ctx, error: String(error) });
      throw error;
    }
    this.log.info('Notification sent', ctx);
    return 'sent';
  }
}
