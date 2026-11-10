-- An administrator can reset someone's password; the person must then choose a new one before using anything else.
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
