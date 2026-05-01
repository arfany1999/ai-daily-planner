'use client';

import { useState } from 'react';
import { T } from '@/lib/theme';

interface Props {
  taskId: string;
  dueDate: string | null;
  dueTime: string | null;
  reminders: { id: string; remind_at: string; offset_minutes: number | null }[];
  onAdd: (taskId: string, data: { remind_at: string; offset_minutes?: number }) => Promise<void>;
  onDelete: (reminderId: string) => Promise<void>;
}

const PRESETS = [
  { label: 'At time', offset: 0 },
  { label: '15 min before', offset: 15 },
  { label: '1 hour before', offset: 60 },
  { label: '1 day before', offset: 1440 },
];

function formatReminder(r: { remind_at: string; offset_minutes: number | null }): string {
  if (r.offset_minutes === 0 || r.offset_minutes === null) {
    return new Date(r.remind_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (r.offset_minutes < 60) return `${r.offset_minutes}m before`;
  if (r.offset_minutes < 1440) return `${r.offset_minutes / 60}h before`;
  return `${r.offset_minutes / 1440}d before`;
}

export default function ReminderPicker({ taskId, dueDate, dueTime, reminders, onAdd, onDelete }: Props) {
  const [loading, setLoading] = useState<number | null>(null);

  const hasDue = !!dueDate && !!dueTime;

  const handlePreset = async (offset: number, idx: number) => {
    if (!dueDate || !dueTime) return;
    setLoading(idx);
    try {
      const due = new Date(`${dueDate}T${dueTime}`);
      const remindAt = new Date(due.getTime() - offset * 60_000);
      await onAdd(taskId, { remind_at: remindAt.toISOString(), offset_minutes: offset });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {reminders.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {reminders.map(r => (
            <span key={r.id} style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 6,
              background: `${T.teal}18`, color: T.teal,
              fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {formatReminder(r)}
              <button
                onClick={() => onDelete(r.id)}
                style={{
                  background: 'none', border: 'none', color: T.teal,
                  cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1,
                  opacity: 0.7,
                }}
              >&times;</button>
            </span>
          ))}
        </div>
      )}
      {!hasDue ? (
        <span style={{ fontSize: 11, color: T.textFaint, fontStyle: 'italic' }}>
          Set a due date first
        </span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.offset, i)}
              disabled={loading !== null}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 6,
                background: T.surface, color: T.textSoft,
                border: `1px solid ${T.border}`, cursor: 'pointer',
                fontWeight: 500, opacity: loading === i ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >{loading === i ? '...' : p.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
