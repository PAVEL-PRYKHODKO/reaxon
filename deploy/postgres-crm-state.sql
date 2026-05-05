-- Снимок CRM в одном JSONB: users, leads, meta (как crm-db.json).
-- Применяется автоматически при старте server.js, если задан DATABASE_URL.
-- Можно выполнить вручную в psql / Cloud SQL.

CREATE TABLE IF NOT EXISTS crm_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO crm_state (id, data)
VALUES (
  1,
  '{"users":[],"leads":[],"meta":{"nextLeadId":1,"nextUserId":1,"assignCursor":0}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
