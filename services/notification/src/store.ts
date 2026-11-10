import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface NotificationRecord {
  eventId: string;
  orgId: string;
  invoiceId: string;
  customerId: string;
  customerEmail: string;
  type: string;
  subject: string;
  body: string;
  sentAt: string;
  demo: boolean;
}

export interface NotificationStore {
  /** Reserves the eventId. Returns false when it was already processed (duplicate delivery). */
  claim(record: NotificationRecord): boolean;
  /** Gives the eventId back, used when the e-mail could not be sent so the retry is not ignored. */
  release(eventId: string): void;
  /** History of ONE company, newest first. There is no way to read across companies. */
  listByOrg(orgId: string, limit?: number): NotificationRecord[];
  /** Deletes the history of demo sandboxes older than the given moment. Returns how many rows went away. */
  purgeDemoBefore(isoDate: string): number;
}

export class SqliteStore implements NotificationStore {
  private db: Database.Database;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        event_id       TEXT PRIMARY KEY,
        org_id         TEXT NOT NULL DEFAULT '',
        invoice_id     TEXT NOT NULL,
        customer_id    TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        type           TEXT NOT NULL,
        subject        TEXT NOT NULL,
        body           TEXT NOT NULL DEFAULT '',
        sent_at        TEXT NOT NULL,
        demo           INTEGER NOT NULL DEFAULT 0
      );
    `);
    this.migrate();
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications (org_id, sent_at)');
  }

  /** Databases created before companies existed get the new columns; their old rows belong to no company. */
  private migrate() {
    const columns = (this.db.prepare('PRAGMA table_info(notifications)').all() as { name: string }[]).map((c) => c.name);
    if (!columns.includes('org_id')) this.db.exec("ALTER TABLE notifications ADD COLUMN org_id TEXT NOT NULL DEFAULT ''");
    if (!columns.includes('body')) this.db.exec("ALTER TABLE notifications ADD COLUMN body TEXT NOT NULL DEFAULT ''");
    if (!columns.includes('demo')) this.db.exec('ALTER TABLE notifications ADD COLUMN demo INTEGER NOT NULL DEFAULT 0');
  }

  claim(r: NotificationRecord): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO notifications
           (event_id, org_id, invoice_id, customer_id, customer_email, type, subject, body, sent_at, demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(r.eventId, r.orgId, r.invoiceId, r.customerId, r.customerEmail, r.type, r.subject, r.body, r.sentAt, r.demo ? 1 : 0);
    return result.changes === 1;
  }

  release(eventId: string): void {
    this.db.prepare('DELETE FROM notifications WHERE event_id = ?').run(eventId);
  }

  listByOrg(orgId: string, limit = 100): NotificationRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM notifications WHERE org_id = ? ORDER BY sent_at DESC LIMIT ?')
      .all(orgId, limit) as Record<string, string | number>[];
    return rows.map((row) => ({
      eventId: String(row.event_id),
      orgId: String(row.org_id),
      invoiceId: String(row.invoice_id),
      customerId: String(row.customer_id),
      customerEmail: String(row.customer_email),
      type: String(row.type),
      subject: String(row.subject),
      body: String(row.body),
      sentAt: String(row.sent_at),
      demo: row.demo === 1,
    }));
  }

  purgeDemoBefore(isoDate: string): number {
    return this.db.prepare('DELETE FROM notifications WHERE demo = 1 AND sent_at < ?').run(isoDate).changes;
  }
}
