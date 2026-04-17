-- Agent infrastructure tables
-- Run once in the Supabase SQL editor.

-- Every tool call the agent makes (audit + potential undo)
CREATE TABLE IF NOT EXISTS agent_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  run_id        UUID NOT NULL,
  tool          TEXT NOT NULL,
  input         JSONB,
  result        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_log_user_run ON agent_log (user_id, run_id);
CREATE INDEX IF NOT EXISTS idx_agent_log_created  ON agent_log (user_id, created_at DESC);

-- One row per agent invocation (foreground or background)
CREATE TABLE IF NOT EXISTS agent_runs (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  finished_at    TIMESTAMPTZ,
  summary        TEXT,
  actions_count  INT DEFAULT 0,
  source         TEXT,                   -- 'user' | 'commandbar' | 'cron' | 'coach'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs (user_id, started_at DESC);

-- Study-coach feedback log (drives the energy curve)
CREATE TABLE IF NOT EXISTS skip_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  task_id     TEXT NOT NULL,
  date        DATE NOT NULL,
  action      TEXT NOT NULL,             -- 'skip' | 'reschedule' | 'drop' | 'done'
  slot        TEXT,                      -- 'morning' | 'midday' | 'afternoon' | 'evening'
  domain      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_skip_log_user_date ON skip_log (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_skip_log_slot      ON skip_log (user_id, slot, action);

-- Proactive nudge log (already used by /api/agent/nudges) — kept for dedup
CREATE TABLE IF NOT EXISTS nudge_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  kind        TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL,
  payload     JSONB
);
CREATE INDEX IF NOT EXISTS idx_nudge_log_user ON nudge_log (user_id, sent_at DESC);
