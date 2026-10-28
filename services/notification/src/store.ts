import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface NotificationRecord {
  eventId: string;
  invoiceId: string;
  customerId: string;
  customerEmail: string;
  type: string;
  subject: string;
  sentAt: string;
}

export interface NotificationStore {
  /** Reserves the eventId. Returns false when it was already processed (duplicate delivery). */
  claim(record: NotificationRecord): boolean;
  /** Gives the eventId back, used when the e-mail could not be sent so the retry is not ignored. */
  release(eventId: string): void;
  listByCustomer(customerId: string): NotificationRecord[];
}

export class SqliteStore implements NotificationStore {
  private db: Database.Database;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        event_id       TEXT PRIMARY KEY,
        invoice_id     TEXT NOT NULL,
        customer_id    TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        type           TEXT NOT NULL,
        subject        TEXT NOT NULL,
        sent_at        TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications (customer_id, sent_at);
    `);
  }

  claim(r: NotificationRecord): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO notifications (event_id, invoice_id, customer_id, customer_email, type, subject, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(r.eventId, r.invoiceId, r.customerId, r.customerEmail, r.type, r.subject, r.sentAt);
    return result.changes === 1;
  }

  release(eventId: string): void {
    this.db.prepare('DELETE FROM notifications WHERE event_id = ?').run(eventId);
  }

  listByCustomer(customerId: string): NotificationRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM notifications WHERE customer_id = ? ORDER BY sent_at DESC')
      .all(customerId) as Record<string, string>[];
    return rows.map((row) => ({
      eventId: row.event_id,
      invoiceId: row.invoice_id,
      customerId: row.customer_id,
      customerEmail: row.customer_email,
      type: row.type,
      subject: row.subject,
      sentAt: row.sent_at,
    }));
  }
}
