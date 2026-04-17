import Anthropic from '@anthropic-ai/sdk';

const API_TIMEOUT_MS = 55000; // 55 second timeout (Vercel max is 60s)

let client: Anthropic | null = null;
let aiAvailable = true;

export function getClaudeClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      aiAvailable = false;
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

export function isAiAvailable(): boolean {
  return aiAvailable && Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function generateWithClaude(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string; cacheSystem?: boolean }
): Promise<string> {
  if (!isAiAvailable()) {
    throw new Error('AI features are temporarily unavailable. Please try again later.');
  }

  const claude = getClaudeClient();

  // Race between the API call and a timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  // Prompt caching — when the system prompt is >=1024 tokens and reused across
  // calls within ~5 min, flagging it ephemeral gets us ~90% off on cache hits.
  // See https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
  const systemParam: string | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
    = options?.cacheSystem
      ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
      : systemPrompt;

  try {
    const response = await claude.messages.create(
      {
        model: options?.model || 'claude-sonnet-4-20250514',
        max_tokens: options?.maxTokens || 4096,
        system: systemParam as unknown as string,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal }
    );

    const block = response.content[0];
    if (block.type === 'text') {
      return block.text;
    }
    throw new Error('Unexpected response type from Claude');
  } catch (error) {
    if (error instanceof Error) {
      // Handle credit exhaustion
      if (error.message.includes('credit') || error.message.includes('billing') || error.message.includes('insufficient')) {
        aiAvailable = false;
        throw new Error('AI features are temporarily unavailable — API credit exhausted. The admin has been notified.');
      }
      // Handle timeout
      if (error.name === 'AbortError' || error.message.includes('abort')) {
        throw new Error(`AI request timed out after ${Math.round(API_TIMEOUT_MS / 1000)} seconds. Try again.`);
      }
      // Handle rate limiting
      if (error.message.includes('rate') || error.message.includes('429')) {
        throw new Error('AI rate limit reached. Please wait a moment and try again.');
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Batch API — for non-urgent cron workloads (briefings, next-day plans).
   Costs 50% of normal. Async: submit, poll, fetch results.
   Only useful when we have ≥1 job; for a single-user dev this falls back
   to synchronous generateWithClaude to avoid the polling tax.
   ────────────────────────────────────────────────────────────────────────── */

export interface BatchRequest {
  custom_id: string;
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  cacheSystem?: boolean;
}

/**
 * Run N AI generations via the Batch API (when N > 1) — 50% discount,
 * useful for cron jobs that don't need low latency.
 * Falls back to sequential generateWithClaude when N <= 1.
 * Returns a map of custom_id → output text (or null on failure).
 */
export async function generateBatchWithClaude(
  requests: BatchRequest[],
  opts?: { pollIntervalMs?: number; maxPollMs?: number }
): Promise<Record<string, string | null>> {
  if (requests.length === 0) return {};

  // Tiny batches: skip the batch API polling overhead, just run in parallel
  if (requests.length === 1) {
    const r = requests[0];
    try {
      const text = await generateWithClaude(r.system, r.user, {
        maxTokens: r.maxTokens, model: r.model, cacheSystem: r.cacheSystem,
      });
      return { [r.custom_id]: text };
    } catch {
      return { [r.custom_id]: null };
    }
  }

  if (!isAiAvailable()) {
    return Object.fromEntries(requests.map(r => [r.custom_id, null]));
  }

  const claude = getClaudeClient();
  const pollMs = opts?.pollIntervalMs ?? 5000;
  const maxMs = opts?.maxPollMs ?? 5 * 60 * 1000; // 5 min

  const batch = await claude.messages.batches.create({
    requests: requests.map(r => ({
      custom_id: r.custom_id,
      params: {
        model: r.model || 'claude-sonnet-4-20250514',
        max_tokens: r.maxTokens || 4096,
        system: r.cacheSystem
          ? ([{ type: 'text', text: r.system, cache_control: { type: 'ephemeral' } }] as unknown as string)
          : r.system,
        messages: [{ role: 'user', content: r.user }],
      },
    })),
  });

  const start = Date.now();
  let current = batch;
  while (current.processing_status !== 'ended') {
    if (Date.now() - start > maxMs) {
      return Object.fromEntries(requests.map(r => [r.custom_id, null]));
    }
    await new Promise(res => setTimeout(res, pollMs));
    current = await claude.messages.batches.retrieve(batch.id);
  }

  const out: Record<string, string | null> = {};
  const stream = await claude.messages.batches.results(batch.id);
  for await (const entry of stream) {
    const e = entry as unknown as {
      custom_id: string;
      result?: { type: string; message?: { content: { type: string; text: string }[] } };
    };
    if (e.result?.type === 'succeeded') {
      const block = e.result.message?.content?.[0];
      out[e.custom_id] = block?.type === 'text' ? block.text : null;
    } else {
      out[e.custom_id] = null;
    }
  }
  return out;
}
