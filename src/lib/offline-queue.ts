import { idbGet, idbSet } from '@/lib/idb';

const QUEUE_KEY = 'v1:offlineQueue';

export interface QueuedMutation {
  id: string;
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  timestamp: number;
}

const loadQueue = async () => (await idbGet<QueuedMutation[]>(QUEUE_KEY)) ?? [];
const saveQueue = (q: QueuedMutation[]) => idbSet(QUEUE_KEY, q);

export async function mutate(url: string, method: string, body?: unknown): Promise<Response | null> {
  if (navigator.onLine) {
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }
  const entry: QueuedMutation = {
    id: crypto.randomUUID(),
    url,
    method: method as QueuedMutation['method'],
    body,
    timestamp: Date.now(),
  };
  const queue = await loadQueue();
  queue.push(entry);
  await saveQueue(queue);
  return null;
}

export async function flushQueue(): Promise<{ succeeded: number; failed: number }> {
  const queue = await loadQueue();
  const failed: QueuedMutation[] = [];
  let succeeded = 0;
  for (const entry of queue) {
    try {
      const res = await fetch(entry.url, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json' },
        body: entry.body !== undefined ? JSON.stringify(entry.body) : undefined,
      });
      if (res.ok) succeeded++;
      else failed.push(entry);
    } catch {
      failed.push(entry);
    }
  }
  await saveQueue(failed);
  return { succeeded, failed: failed.length };
}

export async function getQueueLength(): Promise<number> {
  return (await loadQueue()).length;
}

export function initOfflineQueue(): void {
  window.addEventListener('online', () => void flushQueue());
}
