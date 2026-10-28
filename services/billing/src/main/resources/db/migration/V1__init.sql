CREATE TABLE customers (
    id          UUID PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    document    VARCHAR(14)  NOT NULL UNIQUE,
    email       VARCHAR(160) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
    id            UUID PRIMARY KEY,
    customer_id   UUID         NOT NULL REFERENCES customers (id),
    description   VARCHAR(200) NOT NULL,
    amount_cents  BIGINT       NOT NULL CHECK (amount_cents > 0),
    due_date      DATE         NOT NULL,
    status        VARCHAR(10)  NOT NULL CHECK (status IN ('OPEN', 'PAID', 'OVERDUE', 'CANCELED')),
    paid_at       TIMESTAMPTZ,
    version       BIGINT       NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_status ON invoices (status);
CREATE INDEX idx_invoices_due_date ON invoices (due_date);

CREATE TABLE outbox_events (
    id            UUID PRIMARY KEY,
    type          VARCHAR(40)  NOT NULL,
    aggregate_id  VARCHAR(64)  NOT NULL,
    payload       JSONB        NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    published_at  TIMESTAMPTZ
);

CREATE INDEX idx_outbox_unpublished ON outbox_events (created_at) WHERE published_at IS NULL;
