'use client';

import { useState, useRef, useCallback } from 'react';
import { T } from '@/lib/theme';
import { parseQuickAdd } from '@/lib/quick-add-parser';

const PRIORITY_COLORS = ['transparent', 'var(--blue)', 'var(--orange)', 'var(--red)'];
const PRIORITY_LABELS = ['None', 'Low', 'Medium', 'High'];

interface Props {
  onAdd: (parsed: ReturnType<typeof parseQuickAdd>) => Promise<void>;
  listId?: string;
}

export default function TaskQuickAdd({ onAdd }: Props) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = value.trim() ? parseQuickAdd(value) : null;

  const submit = useCallback(async () => {
    if (!parsed?.title || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(parsed);
      setValue('');
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }, [parsed, submitting, onAdd]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
        <div style={{
          width: 18, height: 18, borderRadius: 5,
          border: '2px solid var(--border-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, opacity: 0.4,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke={T.textMuted} strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Add task... e.g. 'Study AT3 tomorrow 2pm !!'"
          style={{
            flex: 1, border: 'none', background: 'transparent',
            fontSize: 13, color: T.text, outline: 'none',
            fontWeight: 500,
          }}
        />
        {parsed?.title && (
          <button
            onClick={submit}
            disabled={submitting}
            style={{
              padding: '4px 12px', borderRadius: 8,
              background: 'var(--teal)', border: 'none',
              color: '#fff', fontSize: 11, fontWeight: 700,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >Add</button>
        )}
      </div>

      {parsed && (parsed.due_date || parsed.due_time || parsed.priority || parsed.tags?.length || parsed.recurrence) && (
        <div style={{
          display: 'flex', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap',
        }}>
          {parsed.due_date && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 6,
              background: 'var(--teal-glow)', color: T.teal,
              fontWeight: 600, border: '1px solid var(--teal-brd)',
            }}>{parsed.due_date}</span>
          )}
          {parsed.due_time && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 6,
              background: 'var(--surface-hover)', color: T.textSoft,
              fontWeight: 600, border: '1px solid var(--border)',
            }}>{parsed.due_time}</span>
          )}
          {parsed.priority !== undefined && parsed.priority > 0 && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 6,
              background: `${PRIORITY_COLORS[parsed.priority]}18`,
              color: PRIORITY_COLORS[parsed.priority],
              fontWeight: 600, border: `1px solid ${PRIORITY_COLORS[parsed.priority]}40`,
            }}>P{parsed.priority} {PRIORITY_LABELS[parsed.priority]}</span>
          )}
          {parsed.tags?.map(tag => (
            <span key={tag} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 6,
              background: 'var(--surface-hover)', color: T.textMuted,
              fontWeight: 600,
            }}>#{tag}</span>
          ))}
          {parsed.recurrence && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 6,
              background: 'var(--purple)18', color: 'var(--purple)',
              fontWeight: 600, border: '1px solid var(--purple)40',
            }}>↻ recurring</span>
          )}
        </div>
      )}
    </div>
  );
}
