-- Additive: existing accounts, sessions and vault keys remain valid.
CREATE TABLE service_quotas (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, scope)
);
ALTER TABLE user ADD COLUMN twoFactorEnabled INTEGER NOT NULL DEFAULT 0;
CREATE TABLE twoFactor (
  id TEXT PRIMARY KEY NOT NULL,
  secret TEXT NOT NULL,
  backupCodes TEXT NOT NULL,
  verified INTEGER DEFAULT 1,
  failedVerificationCount INTEGER DEFAULT 0,
  lockedUntil DATE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX twoFactor_userId_idx ON twoFactor(userId);
CREATE TABLE verified_phones (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  verified_at TEXT NOT NULL
);
