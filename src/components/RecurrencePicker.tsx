'use client';

import { useState } from 'react';
import { T } from '@/lib/theme';

const PRESETS = [
  { label: 'Daily', value: 'FREQ=DAILY;INTERVAL=1' },
  { label: 'Weekdays', value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Weekly', value: 'FREQ=WEEKLY;INTERVAL=1' },
  { label: 'Biweekly', value: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Monthly', value: 'FREQ=MONTHLY;INTERVAL=1' },
];

interface Props {
  value: string | null;
  onChange: (rrule: string | null) => void;
}

export default function RecurrencePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const activeLabel = PRESETS.find(p => p.value === value)?.label || (value ? 'Custom' : 'None');

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 6,
          background: value ? 'var(--purple)12' : 'transparent',
          border: `1px solid ${value ? 'var(--purple)40' : 'var(--border)'}`,
          color: value ? 'var(--purple)' : T.textMuted,
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <span>↻</span>
        {activeLabel}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 299 }} />
          <div style={{
            position: 'absolute', top: 32, left: 0, zIndex: 300,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: 'var(--shadow-lg)',
            padding: 4, minWidth: 160,
          }}>
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 8,
                background: !value ? 'var(--surface-hover)' : 'transparent',
                border: 'none', textAlign: 'left',
                fontSize: 12, color: T.text, fontWeight: 500, cursor: 'pointer',
              }}
            >None</button>
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => { onChange(p.value); setOpen(false); }}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 8,
                  background: value === p.value ? 'var(--purple)12' : 'transparent',
                  border: 'none', textAlign: 'left',
                  fontSize: 12, color: value === p.value ? 'var(--purple)' : T.text,
                  fontWeight: value === p.value ? 600 : 500, cursor: 'pointer',
                }}
              >{p.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
