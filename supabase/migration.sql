-- AI Planner: Supabase Migration
-- Run this in Supabase SQL Editor

-- ===== USERS =====
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  avatar_url text,
  google_access_token text,
  google_refresh_token text,
  google_token_expiry timestamptz,
  canvas_base_url text DEFAULT 'https://rmit.instructure.com',
  canvas_token text,
  canvas_connected boolean DEFAULT false,
  setup_completed boolean DEFAULT false,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ===== SETTINGS =====
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  work_enabled boolean DEFAULT true,
  work_days text[] DEFAULT '{saturday,sunday}',
  work_start time DEFAULT '09:00',
  work_end time DEFAULT '18:30',
  gym_enabled boolean DEFAULT true,
  gym_days text[] DEFAULT '{monday,wednesday,thursday,sunday}',
  gym_start time DEFAULT '19:00',
  gym_end time DEFAULT '21:00',
  email_briefing boolean DEFAULT true,
  email_todo boolean DEFAULT true,
  email_weekly boolean DEFAULT true,
  email_time time DEFAULT '20:00',
  email_address text,
  push_notifications boolean DEFAULT false,
  timezone text DEFAULT 'Australia/Melbourne',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- ===== CORE CONNECTIONS =====
CREATE TABLE IF NOT EXISTS core_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  service text NOT NULL,
  enabled boolean DEFAULT true,
  last_fetched_at timestamptz,
  last_error text,
  UNIQUE(user_id, service)
);

-- ===== CUSTOM CONNECTIONS =====
CREATE TABLE IF NOT EXISTS custom_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('public', 'rss', 'api_key')),
  url text NOT NULL,
  api_key_encrypted text,
  header_name text DEFAULT 'Authorization',
  color text DEFAULT '#4a8fe7',
  icon text DEFAULT '🌐',
  prompt text NOT NULL,
  frequency text DEFAULT 'daily' CHECK (frequency IN ('daily', '3h', 'manual')),
  in_email boolean DEFAULT true,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connection_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES custom_connections(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  result_text text,
  error text,
  fetched_at timestamptz DEFAULT now()
);

-- ===== AI PROMPTS =====
CREATE TABLE IF NOT EXISTS card_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  card_key text NOT NULL,
  prompt_text text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, card_key)
);

-- ===== CACHED DATA =====
CREATE TABLE IF NOT EXISTS calendar_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  data jsonb NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  sync_token jsonb DEFAULT NULL,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS email_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  data jsonb NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS canvas_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  data jsonb NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS canvas_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  snapshot jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS semester_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  data jsonb NOT NULL DEFAULT '{"cancelled_classes":[],"deadline_changes":[],"warnings":[]}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- ===== GENERATED CONTENT =====
CREATE TABLE IF NOT EXISTS briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  briefing jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  todo jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  course text NOT NULL,
  week integer NOT NULL,
  source_file text,
  source_type text,
  content jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processed_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  canvas_file_id text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, canvas_file_id)
);

-- ===== TASK TRACKING =====
CREATE TABLE IF NOT EXISTS task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  task_id text NOT NULL,
  date date NOT NULL,
  action text DEFAULT 'completed' CHECK (action IN ('completed', 'pushed')),
  completed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, task_id, date)
);

CREATE TABLE IF NOT EXISTS schedule_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  google_event_id text,
  title text NOT NULL,
  date date NOT NULL,
  start_time time,
  end_time time,
  created_at timestamptz DEFAULT now()
);

-- ===== ASK AI =====
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  page_context text,
  messages jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, key)
);

-- ===== PROGRESS =====
CREATE TABLE IF NOT EXISTS progress_weekly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  week_start date NOT NULL,
  data jsonb NOT NULL,
  UNIQUE(user_id, week_start)
);

-- ===== USAGE TRACKING =====
CREATE TABLE IF NOT EXISTS usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  ai_calls integer DEFAULT 0,
  tokens_used integer DEFAULT 0,
  ask_ai_count integer DEFAULT 0,
  materials_generated integer DEFAULT 0,
  connection_fetches integer DEFAULT 0,
  UNIQUE(user_id, date)
);

-- ===== ERROR LOG =====
CREATE TABLE IF NOT EXISTS error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  context text,
  message text NOT NULL,
  stack text,
  created_at timestamptz DEFAULT now()
);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_briefings_user_date ON briefings(user_id, date);
CREATE INDEX IF NOT EXISTS idx_todos_user_date ON todos(user_id, date);
CREATE INDEX IF NOT EXISTS idx_task_completions_user_date ON task_completions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_date ON usage_tracking(user_id, date);
CREATE INDEX IF NOT EXISTS idx_custom_connections_user ON custom_connections(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_connection_results_conn ON connection_results(connection_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_user_course ON materials(user_id, course, week);
CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at);

-- ===== RLS =====
-- Note: Since we use NextAuth (not Supabase Auth), API routes use supabaseAdmin
-- which bypasses RLS. RLS is a safety net for any client-side access.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE semester_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

-- ===== HELPER FUNCTIONS =====
CREATE OR REPLACE FUNCTION increment_usage(p_user_id uuid, p_field text)
RETURNS void AS $$
BEGIN
  INSERT INTO usage_tracking (user_id, date)
  VALUES (p_user_id, CURRENT_DATE)
  ON CONFLICT (user_id, date) DO NOTHING;

  EXECUTE format('UPDATE usage_tracking SET %I = %I + 1 WHERE user_id = $1 AND date = CURRENT_DATE', p_field, p_field)
  USING p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  DELETE FROM connection_results WHERE fetched_at < now() - interval '30 days';
  DELETE FROM error_log WHERE created_at < now() - interval '7 days';
  DELETE FROM ai_conversations WHERE created_at < now() - interval '90 days';
END;
$$ LANGUAGE plpgsql;

-- ===== PUSH NOTIFICATIONS =====
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  endpoint text UNIQUE NOT NULL,
  subscription jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ===== AGENTIC MODE =====
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS agentic_mode boolean DEFAULT false;

-- ===== LIFE DOMAINS =====
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS domains jsonb DEFAULT '[
  {"id":"academia","label":"Academia (RMIT)","icon":"🎓","weight":5,"enabled":true,"color":"#4a6ef5"},
  {"id":"dev","label":"Dev Projects","icon":"💻","weight":4,"enabled":true,"color":"#0d9b8a"},
  {"id":"finance","label":"Finance / Crypto","icon":"📈","weight":3,"enabled":true,"color":"#f5a623"},
  {"id":"gym","label":"Health / Gym","icon":"🏋️","weight":3,"enabled":true,"color":"#27c77a"},
  {"id":"personal","label":"Personal / Admin","icon":"🏠","weight":2,"enabled":true,"color":"#e94f4f"}
]'::jsonb;

-- ===== STANDALONE TASKS (TickTick parity) =====

CREATE TABLE IF NOT EXISTS task_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#C4764A',
  icon text DEFAULT '',
  is_smart boolean DEFAULT false,
  smart_filter jsonb,
  sort_order float DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  notes text DEFAULT '',
  due_date date,
  due_time time,
  start_date date,
  estimated_minutes int,
  priority smallint DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
  domain text DEFAULT 'admin',
  list_id uuid REFERENCES task_lists(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',
  status text DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  completed_at timestamptz,
  rrule text,
  rrule_parent_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  sort_order float DEFAULT 0,
  kanban_column text DEFAULT 'todo',
  google_event_id text,
  source text DEFAULT 'manual' CHECK (source IN ('manual', 'quick_add', 'ai_plan', 'recurring')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  completed boolean DEFAULT false,
  sort_order float DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  remind_at timestamptz NOT NULL,
  offset_minutes int,
  sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_user_list ON tasks(user_id, list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_rrule_parent ON tasks(rrule_parent_id) WHERE rrule_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_task_lists_user ON task_lists(user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_task_reminders_fire ON task_reminders(remind_at) WHERE sent = false;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_reminders ENABLE ROW LEVEL SECURITY;
