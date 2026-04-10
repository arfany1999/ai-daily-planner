import { supabaseAdmin } from './supabase';
import { logError } from './db';
import { decrypt } from './encryption';
import { generateWithClaude } from './claude';

interface Connection {
  id: string;
  type: string;
  name: string;
  url: string | null;
  api_key_encrypted: string | null;
  header_name: string;
  prompt: string | null;
  frequency: string;
  enabled: boolean;
}

const BLOCKED_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/0\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^file:/i,
  /^ftp:/i,
];

// Rate limiting: max 50 fetches per hour
let fetchCount = 0;
let fetchResetAt = Date.now() + 60 * 60 * 1000;

function checkFetchLimit(): boolean {
  if (Date.now() > fetchResetAt) {
    fetchCount = 0;
    fetchResetAt = Date.now() + 60 * 60 * 1000;
  }
  if (fetchCount >= 50) return false;
  fetchCount++;
  return true;
}

export function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP/HTTPS URLs are allowed' };
    }
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(url)) {
        return { valid: false, error: 'Internal/private URLs are not allowed' };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export async function fetchConnection(connectionId: string): Promise<{ result: string; error?: string }> {
  if (!checkFetchLimit()) {
    return { result: '', error: 'Rate limit: max 50 fetches per hour' };
  }

  const { data: conn } = await supabaseAdmin
    .from('custom_connections')
    .select('*')
    .eq('id', connectionId)
    .single();

  if (!conn) return { result: '', error: 'Connection not found' };
  if (!conn.enabled) return { result: '', error: 'Connection is disabled' };
  if (!conn.url) return { result: '', error: 'No URL configured' };

  const urlCheck = validateUrl(conn.url);
  if (!urlCheck.valid) return { result: '', error: urlCheck.error };

  try {
    let rawContent: string;

    switch (conn.type) {
      case 'public':
        rawContent = await fetchPublicWebsite(conn.url);
        break;
      case 'rss':
        rawContent = await fetchRssFeed(conn.url);
        break;
      case 'api_key':
        rawContent = await fetchApiWithKey(conn.url, conn.api_key_encrypted, conn.header_name);
        break;
      default:
        return { result: '', error: `Unsupported type: ${conn.type}` };
    }

    if (!rawContent || rawContent.trim().length < 10) {
      return { result: '', error: 'No content returned from source' };
    }

    // Send to Claude with user's custom prompt
    const prompt = conn.prompt || 'Summarize the key information from this data.';
    const aiResult = await generateWithClaude(
      `You are a data interpreter for a personal planner app. Process the following data and respond according to the user's instructions. Be concise and actionable.`,
      `USER INSTRUCTION: ${prompt}\n\nDATA FROM "${conn.name}" (${conn.type}):\n${rawContent.slice(0, 10000)}`,
      { maxTokens: 1024 }
    );

    // Store result
    await supabaseAdmin.from('connection_results').insert({
      connection_id: conn.id,
      user_id: conn.user_id,
      result_text: aiResult,
    });

    return { result: aiResult };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError(`connections/fetch/${conn.name}`, msg);

    // Keep the last successful result
    const { data: lastResult } = await supabaseAdmin
      .from('connection_results')
      .select('result_text')
      .eq('connection_id', conn.id)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();

    if (lastResult) {
      // Add error note to a new entry
      await supabaseAdmin.from('connection_results').insert({
        connection_id: conn.id,
        user_id: conn.user_id,
        result_text: `[Fetch error: ${msg}] Previous result: ${lastResult.result_text}`,
      });
    }

    return { result: lastResult?.result_text || '', error: msg };
  }
}

async function fetchPublicWebsite(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AIPlannerBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();

  // Strip HTML tags, scripts, styles -- extract text content
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

async function fetchRssFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const xml = await res.text();

  // Parse RSS/Atom entries -- extract titles, links, descriptions
  const entries: string[] = [];

  // RSS items
  const rssItems = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const item of rssItems.slice(0, 10)) {
    const title = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || '';
    const link = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '';
    const desc = item.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] || '';
    const pubDate = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || '';
    const cleanDesc = desc.replace(/<[^>]*>/g, '').trim().slice(0, 200);
    entries.push(`Title: ${title.trim()}\nLink: ${link.trim()}\nDate: ${pubDate.trim()}\nSummary: ${cleanDesc}`);
  }

  // Atom entries
  if (entries.length === 0) {
    const atomEntries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
    for (const entry of atomEntries.slice(0, 10)) {
      const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
      const link = entry.match(/<link[^>]*href="([^"]*)"[^>]*\/>/i)?.[1] || '';
      const summary = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || '';
      const published = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] || '';
      entries.push(`Title: ${title.trim()}\nLink: ${link}\nDate: ${published.trim()}\nSummary: ${summary.replace(/<[^>]*>/g, '').trim().slice(0, 200)}`);
    }
  }

  return entries.join('\n\n') || 'No entries found in feed.';
}

async function fetchApiWithKey(url: string, encryptedKey: string | null, headerName: string): Promise<string> {
  if (!encryptedKey) throw new Error('No API key configured');

  const apiKey = decrypt(encryptedKey);
  const headers: Record<string, string> = {
    [headerName || 'Authorization']: apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
    'Accept': 'application/json',
  };

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);

  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('json')) {
    const json = await res.json();
    return JSON.stringify(json, null, 2);
  }

  return await res.text();
}
