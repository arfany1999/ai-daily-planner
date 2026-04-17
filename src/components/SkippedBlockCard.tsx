'use client';

import { useState } from 'react';
import { T, DOMAINS } from '@/lib/theme';

interface Block {
  id: string;
  task_name: string;
  start_time: string;
  end_time: string;
  urgency?: string;
  domain?: string;
}

interface Props {
  block: Block;
  date: string;
  onResolved?: (action: 'skip' | 'reschedule' | 'drop' | 'done') => void;
}

function slotFromTime(hm: string): 'morning' | 'midday' | 'afternoon' | 'evening' {
  const h = parseInt(hm.split(':')[0], 10);
  if (h < 11) return 'morning';
  if (h < 14) return 'midday';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function fmt12(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function SkippedBlockCard({ block, date, onResolved }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const domain = DOMAINS.find(d => d.id === block.domain) || DOMAINS[4];
  const slot = slotFromTime(block.start_time);

  const record = async (action: 'reschedule' | 'drop' | 'done' | 'skip') => {
    setBusy(action);
    try {
      await fetch('/api/coach/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: block.id,
          date,
          action,
          slot,
          domain: block.domain,
        }),
      });

      if (action === 'reschedule') {
        // Delegate to agent to pick a new slot
        await fetch('/api/agent/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Reschedule "${block.task_name}" (${block.start_time}-${block.end_time}) today to a later slot that fits my energy curve.`,
            source: 'coach',
          }),
        });
        window.dispatchEvent(new CustomEvent('cmd-data-changed'));
      }

      setDismissed(true);
      onResolved?.(action);
    } catch {
      // fall through
    }
    setBusy(null);
  };

  if (dismissed) return null;

  return (
    <div className="anim-slide" style={{
      padding: '12px 14px',
      borderRadius: 12,
      background: 'var(--surface)',
      border: `1px solid ${domain.color}35`,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 10,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: domain.color }} />
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: domain.color + '22', color: domain.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, flexShrink: 0,
      }}>⟳</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textFaint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Skipped · {fmt12(block.start_time)}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {block.task_name}
        </div>
        <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 3 }}>
          What now?
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={() => record('done')} disabled={!!busy}
          title="Mark done anyway"
          style={{
            padding: '7px 11px', borderRadius: 8,
            background: 'var(--green)', color: '#fff', border: 'none',
            fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
            opacity: busy === 'done' ? 0.6 : 1,
          }}>Done</button>
        <button onClick={() => record('reschedule')} disabled={!!busy}
          title="AI picks a new slot"
          style={{
            padding: '7px 11px', borderRadius: 8,
            background: 'var(--teal-glow)', color: T.teal, border: '1px solid var(--teal-brd)',
            fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
            opacity: busy === 'reschedule' ? 0.6 : 1,
          }}>{busy === 'reschedule' ? '…' : 'Reschedule'}</button>
        <button onClick={() => record('drop')} disabled={!!busy}
          title="Remove from today"
          style={{
            padding: '7px 11px', borderRadius: 8,
            background: 'transparent', color: T.textMuted, border: '1px solid var(--border)',
            fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
            opacity: busy === 'drop' ? 0.6 : 1,
          }}>Drop</button>
      </div>
    </div>
  );
}
