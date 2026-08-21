-- Migration 005: Terms & Conditions / Privacy Policy consent tracking (legal pages feature)
-- Recorded once at registration; terms_version lets a future re-consent flow compare against
-- the current legal copy's "Last Updated" date (see frontend/terms.html, frontend/privacy.html).

ALTER TABLE users ADD COLUMN terms_accepted BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME;
ALTER TABLE users ADD COLUMN terms_version VARCHAR;
