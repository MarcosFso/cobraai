-- Several users per company, and invoices that repeat every month.

-- A user can exist without a company ("waiting for release") until an administrator of a company adds them.
ALTER TABLE users ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE users ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'MEMBER'));

CREATE TABLE recurring_invoices (
    id               UUID PRIMARY KEY,
    org_id           UUID         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    customer_id      UUID         NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    description      VARCHAR(200) NOT NULL,
    amount_cents     BIGINT       NOT NULL CHECK (amount_cents > 0),
    anchor_day       INT          NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
    next_due_date    DATE         NOT NULL,
    active           BOOLEAN      NOT NULL DEFAULT TRUE,
    version          BIGINT       NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX recurring_org_idx ON recurring_invoices (org_id);
CREATE INDEX recurring_due_idx ON recurring_invoices (next_due_date) WHERE active;

ALTER TABLE invoices ADD COLUMN recurring_id UUID REFERENCES recurring_invoices (id) ON DELETE SET NULL;
