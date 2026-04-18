import { supabaseAdmin } from './supabase';
import { sendPushToUser } from './push';
import { createGcalEvent, updateGcalEvent, deleteGcalEvent } from './google';

const TZ = 'Australia/Melbourne';

function todayISO(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

interface TimelineBlock {
  id: string;
  task_name: string;
  start_time: string;
  end_time: string;
  urgency?: string;
  domain?: string;
  description?: string;
  estimated_minutes?: number;
  google_event_id?: string;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  action?: string;
}

/**
 * Anthropic tool definitions — schemas sent to Claude so it knows what it can do.
 * Must match executeTool() dispatcher below.
 */
export const AGENT_TOOLS = [
  {
    name: 'get_today_plan',
    description: "Return the user's current day plan (timeline blocks) for a given date. Use this to see what's already scheduled before adding/moving blocks.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format. Omit for today.' },
      },
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Fetch Google Calendar events for a date range. Useful for seeing classes, work shifts, and external commitments.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
        to_date: { type: 'string', description: 'End date YYYY-MM-DD' },
      },
      required: ['from_date', 'to_date'],
    },
  },
  {
    name: 'get_canvas_deadlines',
    description: 'Fetch upcoming Canvas/RMIT assignment deadlines. Use before suggesting study blocks.',
    input_schema: {
      type: 'object',
      properties: {
        within_days: { type: 'number', description: 'Look ahead N days. Default 14.' },
      },
    },
  },
  {
    name: 'create_block',
    description: 'Add a new time block to a day. Use after checking with get_today_plan to avoid conflicts.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        start_time: { type: 'string', description: '24h HH:MM' },
        end_time: { type: 'string', description: '24h HH:MM' },
        title: { type: 'string', description: 'Block name' },
        domain: { type: 'string', enum: ['academia', 'dev', 'finance', 'health', 'admin', 'break'], description: "User's life domain this belongs to" },
        description: { type: 'string', description: 'Optional detail' },
      },
      required: ['date', 'start_time', 'end_time', 'title', 'domain'],
    },
  },
  {
    name: 'move_block',
    description: "Move an existing block to a new time and/or date. Use the block's id from get_today_plan.",
    input_schema: {
      type: 'object',
      properties: {
        block_id: { type: 'string' },
        from_date: { type: 'string', description: 'Current date YYYY-MM-DD' },
        new_date: { type: 'string', description: 'New date YYYY-MM-DD (same if just shifting time)' },
        new_start_time: { type: 'string', description: '24h HH:MM' },
        new_end_time: { type: 'string', description: '24h HH:MM' },
      },
      required: ['block_id', 'from_date', 'new_date', 'new_start_time', 'new_end_time'],
    },
  },
  {
    name: 'delete_block',
    description: 'Remove a block from a day.',
    input_schema: {
      type: 'object',
      properties: {
        block_id: { type: 'string' },
        date: { type: 'string' },
      },
      required: ['block_id', 'date'],
    },
  },
  {
    name: 'complete_block',
    description: 'Mark a block complete for today.',
    input_schema: {
      type: 'object',
      properties: {
        block_id: { type: 'string' },
      },
      required: ['block_id'],
    },
  },
  {
    name: 'send_push_nudge',
    description: 'Send a push notification to the user. Use sparingly — only for high-value async nudges (new deadline detected, pattern break, milestone).',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        url: { type: 'string', description: 'Optional deep-link path like /home or /calendar' },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'get_user_profile',
    description: "Fetch user's settings — energy curve, domain weights, work/gym hours. Use to align suggestions with their preferences.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_recent_completions',
    description: 'Return task completion stats for the last N days. Useful to detect skip patterns.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Lookback days. Default 7.' },
      },
    },
  },
] as const;

/* ── Executor ────────────────────────────────────────────────────────────── */

async function getPlan(userId: string, date: string): Promise<{ timeline: TimelineBlock[] } & Record<string, unknown>> {
  const { data } = await supabaseAdmin
    .from('todos').select('todo').eq('user_id', userId).eq('date', date).single();
  const plan = (data?.todo as { timeline?: TimelineBlock[] } & Record<string, unknown>) || { timeline: [] };
  if (!Array.isArray(plan.timeline)) plan.timeline = [];
  return plan as { timeline: TimelineBlock[] } & Record<string, unknown>;
}

async function savePlan(userId: string, date: string, plan: Record<string, unknown>) {
  await supabaseAdmin.from('todos').upsert(
    { user_id: userId, date, todo: plan },
    { onConflict: 'user_id,date' }
  );
}

function urgencyForDomain(d?: string): string {
  if (d === 'academia') return 'class';
  if (d === 'health') return 'gym';
  if (d === 'dev') return 'work';
  if (d === 'break') return 'break';
  if (d === 'finance') return 'amber';
  return 'amber';
}

export async function executeTool(userId: string, name: string, input: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_today_plan': {
        const date = (input.date as string) || todayISO();
        const plan = await getPlan(userId, date);
        return { ok: true, data: { date, timeline: plan.timeline } };
      }
      case 'get_calendar_events': {
        const { data } = await supabaseAdmin
          .from('calendar_cache').select('data').eq('user_id', userId).single();
        const events = (data?.data as { id: string; title: string; start: string; end: string }[]) || [];
        const from = (input.from_date as string) || todayISO();
        const to = (input.to_date as string) || todayISO(14);
        const filtered = events.filter(e => {
          const d = e.start.slice(0, 10);
          return d >= from && d <= to;
        }).slice(0, 40);
        return { ok: true, data: { count: filtered.length, events: filtered } };
      }
      case 'get_canvas_deadlines': {
        const { data } = await supabaseAdmin
          .from('canvas_cache').select('data').eq('user_id', userId).single();
        const assignments = (data?.data as { assignments?: { name: string; course_name: string; due_at: string | null; has_submitted_submissions?: boolean }[] } | null)?.assignments || [];
        const within = (input.within_days as number) || 14;
        const cutoff = Date.now() + within * 86400000;
        const upcoming = assignments
          .filter(a => a.due_at && !a.has_submitted_submissions && new Date(a.due_at).getTime() > Date.now() && new Date(a.due_at).getTime() < cutoff)
          .map(a => ({ name: a.name, course: a.course_name, due_at: a.due_at }))
          .slice(0, 20);
        return { ok: true, data: { count: upcoming.length, deadlines: upcoming } };
      }
      case 'create_block': {
        const date = input.date as string;
        const plan = await getPlan(userId, date);
        const domain = (input.domain as string) || 'admin';
        const title = input.title as string;
        const start_time = input.start_time as string;
        const end_time = input.end_time as string;
        const description = (input.description as string) || '';

        // Mirror to Google Calendar first so we can store the event id on the block
        const gcalId = await createGcalEvent(userId, {
          title, date, start_time, end_time, description, domain,
        });

        const block: TimelineBlock = {
          id: crypto.randomUUID(),
          task_name: title,
          start_time, end_time,
          urgency: urgencyForDomain(domain),
          domain,
          description,
          google_event_id: gcalId || undefined,
        };
        plan.timeline = [...plan.timeline, block].sort((a, b) => a.start_time.localeCompare(b.start_time));

        // Atomicity: if local save fails after GCal insert, roll back the GCal event
        // so we never end up with an event on Google that has no local counterpart.
        try {
          await savePlan(userId, date, plan);
        } catch (e) {
          if (gcalId) {
            try { await deleteGcalEvent(userId, gcalId); } catch { /* best-effort rollback */ }
          }
          throw e;
        }

        return {
          ok: true,
          action: `created block ${block.id}${gcalId ? ' (synced to Google Calendar)' : ' (Google mirror skipped)'}`,
          data: block,
        };
      }
      case 'move_block': {
        const from = input.from_date as string;
        const to = input.new_date as string;
        const id = input.block_id as string;
        const new_start_time = input.new_start_time as string;
        const new_end_time = input.new_end_time as string;
        const planFrom = await getPlan(userId, from);
        const idx = planFrom.timeline.findIndex(b => b.id === id);
        if (idx === -1) return { ok: false, error: `Block ${id} not found on ${from}` };
        const block = planFrom.timeline[idx];
        const updated: TimelineBlock = { ...block, start_time: new_start_time, end_time: new_end_time };

        // Mirror to Google Calendar — patch existing event if we have one, else create fresh
        if (block.google_event_id) {
          const ok = await updateGcalEvent(userId, block.google_event_id, {
            title: block.task_name, date: to, start_time: new_start_time, end_time: new_end_time,
            description: block.description, domain: block.domain,
          });
          if (!ok) {
            // Stale/missing event — recreate
            const fresh = await createGcalEvent(userId, {
              title: block.task_name, date: to, start_time: new_start_time, end_time: new_end_time,
              description: block.description, domain: block.domain,
            });
            if (fresh) updated.google_event_id = fresh;
          }
        } else {
          const fresh = await createGcalEvent(userId, {
            title: block.task_name, date: to, start_time: new_start_time, end_time: new_end_time,
            description: block.description, domain: block.domain,
          });
          if (fresh) updated.google_event_id = fresh;
        }

        if (from === to) {
          planFrom.timeline[idx] = updated;
          planFrom.timeline = planFrom.timeline.sort((a, b) => a.start_time.localeCompare(b.start_time));
          await savePlan(userId, from, planFrom);
        } else {
          planFrom.timeline.splice(idx, 1);
          await savePlan(userId, from, planFrom);
          const planTo = await getPlan(userId, to);
          planTo.timeline = [...planTo.timeline, updated].sort((a, b) => a.start_time.localeCompare(b.start_time));
          await savePlan(userId, to, planTo);
        }
        return { ok: true, action: `moved block ${id} from ${from} to ${to} ${new_start_time} (Google Calendar updated)` };
      }
      case 'delete_block': {
        const date = input.date as string;
        const id = input.block_id as string;
        const plan = await getPlan(userId, date);
        const block = plan.timeline.find(b => b.id === id);
        if (block?.google_event_id) {
          await deleteGcalEvent(userId, block.google_event_id);
        }
        plan.timeline = plan.timeline.filter(b => b.id !== id);
        await savePlan(userId, date, plan);
        return { ok: true, action: `deleted block ${id}${block?.google_event_id ? ' (removed from Google Calendar)' : ''}` };
      }
      case 'complete_block': {
        const id = input.block_id as string;
        const today = todayISO();
        await supabaseAdmin.from('task_completions').upsert(
          { user_id: userId, task_id: id, date: today },
          { onConflict: 'user_id,task_id,date' }
        );
        return { ok: true, action: `completed block ${id}` };
      }
      case 'send_push_nudge': {
        await sendPushToUser(userId, {
          title: (input.title as string) || '◈ Commander',
          body: input.body as string,
          url: (input.url as string) || '/home',
          tag: 'agent-nudge',
        });
        return { ok: true, action: 'push sent' };
      }
      case 'get_user_profile': {
        const { data } = await supabaseAdmin
          .from('user_settings').select('*').eq('user_id', userId).single();
        return { ok: true, data };
      }
      case 'get_recent_completions': {
        const days = (input.days as number) || 7;
        const from = todayISO(-days);
        const { data } = await supabaseAdmin
          .from('task_completions').select('task_id, date').eq('user_id', userId).gte('date', from);
        return { ok: true, data: { count: (data || []).length, rows: data || [] } };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'tool-failed' };
  }
}

/**
 * Log every tool invocation for audit + potential undo.
 */
export async function logToolCall(userId: string, runId: string, tool: string, input: unknown, result: ToolResult) {
  try {
    await supabaseAdmin.from('agent_log').insert({
      user_id: userId,
      run_id: runId,
      tool,
      input: input as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      created_at: new Date().toISOString(),
    });
  } catch {
    // non-fatal
  }
}
