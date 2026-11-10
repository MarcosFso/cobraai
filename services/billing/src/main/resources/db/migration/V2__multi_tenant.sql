-- Companies (organizations) and their users. Every customer and invoice now belongs to one company.

CREATE TABLE organizations (
    id          UUID PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    demo        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id             UUID PRIMARY KEY,
    org_id         UUID         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    email          VARCHAR(160) NOT NULL,
    password_hash  VARCHAR(100) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
CREATE INDEX users_org_idx ON users (org_id);

-- Rows created by the single-company version (if any) move to a first company that nobody owns yet.
INSERT INTO organizations (id, name)
SELECT '00000000-0000-4000-8000-000000000001', 'Empresa inicial'
WHERE EXISTS (SELECT 1 FROM customers);

ALTER TABLE customers ADD COLUMN org_id UUID REFERENCES organizations (id) ON DELETE CASCADE;
ALTER TABLE customers ADD COLUMN phone VARCHAR(13) CHECK (phone IS NULL OR phone ~ '^55[0-9]{10,11}$');
UPDATE customers SET org_id = '00000000-0000-4000-8000-000000000001';
ALTER TABLE customers ALTER COLUMN org_id SET NOT NULL;
-- the same CPF/CNPJ can be a customer of two different companies
ALTER TABLE customers DROP CONSTRAINT customers_document_key;
ALTER TABLE customers ADD CONSTRAINT customers_org_document_key UNIQUE (org_id, document);
CREATE INDEX customers_org_idx ON customers (org_id);

ALTER TABLE invoices ADD COLUMN org_id UUID REFERENCES organizations (id) ON DELETE CASCADE;
UPDATE invoices SET org_id = (SELECT c.org_id FROM customers c WHERE c.id = invoices.customer_id);
ALTER TABLE invoices ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX invoices_org_status_idx ON invoices (org_id, status);
-- deleting a company removes its customers and invoices
ALTER TABLE invoices DROP CONSTRAINT invoices_customer_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE;

-- A strict, gap-free publish order for the outbox (created_at could tie on a fast machine)
ALTER TABLE outbox_events ADD COLUMN seq BIGSERIAL;
CREATE UNIQUE INDEX outbox_events_seq_idx ON outbox_events (seq);
