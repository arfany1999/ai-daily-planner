'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { T, DOMAINS, DOMAIN_BY_ID } from '@/lib/theme';
import type { Task, Subtask } from '@/lib/task-types';
import RecurrencePicker from './RecurrencePicker';
import ReminderPicker from './ReminderPicker';

const PRIORITY_LABELS = ['None', 'Low', 'Medium', 'High'];
const PRIORITY_COLORS = ['var(--text-muted)', 'var(--blue)', 'var(--orange)', 'var(--red)'];
const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

interface Props {
  task: Task;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddSubtask: (taskId: string, title: string) => Promise<void>;
  onToggleSubtask: (subtaskId: string, completed: boolean) => Promise<void>;
  onDeleteSubtask: (subtaskId: string) => Promise<void>;
  onAddReminder?: (taskId: string, data: { remind_at: string; offset_minutes?: number }) => Promise<void>;
  onDeleteReminder?: (reminderId: string) => Promise<void>;
}

export default function TaskDetail({ task, onClose, onUpdate, onDelete, onAddSubtask, onToggleSubtask, onDeleteSubtask, onAddReminder, onDeleteReminder }: Props) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes || '');
  const [dueDate, setDueDate] = useState(task.due_date || '');
  const [dueTime, setDueTime] = useState(task.due_time || '');
  const [priority, setPriority] = useState(task.priority);
  const [domain, setDomain] = useState(task.domain);
  const [status, setStatus] = useState(task.status);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes || '');
    setDueDate(task.due_date || '');
    setDueTime(task.due_time || '');
    setPriority(task.priority);
    setDomain(task.domain);
    setStatus(task.status);
  }, [task]);

  const save = useCallback((updates: Partial<Task>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate(task.id, updates);
    }, 400);
  }, [task.id, onUpdate]);

  const handleTitleChange = (v: string) => { setTitle(v); save({ title: v }); };
  const handleNotesChange = (v: string) => { setNotes(v); save({ notes: v }); };
  const handleDateChange = (v: string) => { setDueDate(v); save({ due_date: v || null } as Partial<Task>); };
  const handleTimeChange = (v: string) => { setDueTime(v); save({ due_time: v || null } as Partial<Task>); };
  const handlePriorityChange = (v: 0 | 1 | 2 | 3) => { setPriority(v); onUpdate(task.id, { priority: v }); };
  const handleDomainChange = (v: string) => { setDomain(v); onUpdate(task.id, { domain: v }); };
  const handleStatusChange = (v: string) => { setStatus(v as Task['status']); onUpdate(task.id, { status: v as Task['status'] }); };

  const addSubtask = async () => {
    if (!subtaskInput.trim()) return;
    await onAddSubtask(task.id, subtaskInput.trim());
    setSubtaskInput('');
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const fieldStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 0', borderBottom: '1px solid var(--border-soft)',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: T.textMuted,
    width: 70, flexShrink: 0, textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };
  const inputStyle: React.CSSProperties = {
    flex: 1, border: 'none', background: 'transparent',
    fontSize: 12.5, color: T.text, outline: 'none', fontWeight: 500,
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle, cursor: 'pointer', appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 200, backdropFilter: 'blur(4px)',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '100%', maxWidth: 440,
        background: 'var(--bg)', borderLeft: '1px solid var(--border)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: T.textMuted, fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Close
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowDelete(true)}
              style={{
                padding: '5px 10px', borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--red)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >Delete</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            style={{
              width: '100%', border: 'none', background: 'transparent',
              fontSize: 18, fontWeight: 700, color: T.text, outline: 'none',
              marginBottom: 16, letterSpacing: '-0.02em',
            }}
          />

          {/* Status */}
          <div style={fieldStyle}>
            <span style={labelStyle}>Status</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => handleStatusChange(s.value)}
                  style={{
                    padding: '4px 10px', borderRadius: 6,
                    border: status === s.value ? '1px solid var(--teal-brd)' : '1px solid var(--border)',
                    background: status === s.value ? 'var(--teal-glow)' : 'transparent',
                    color: status === s.value ? T.teal : T.textMuted,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >{s.label}</button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div style={fieldStyle}>
            <span style={labelStyle}>Priority</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2, 3].map(p => (
                <button
                  key={p}
                  onClick={() => handlePriorityChange(p as 0 | 1 | 2 | 3)}
                  style={{
                    padding: '4px 10px', borderRadius: 6,
                    border: priority === p ? `1px solid ${PRIORITY_COLORS[p]}60` : '1px solid var(--border)',
                    background: priority === p ? `${PRIORITY_COLORS[p]}15` : 'transparent',
                    color: priority === p ? PRIORITY_COLORS[p] : T.textMuted,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >{PRIORITY_LABELS[p]}</button>
              ))}
            </div>
          </div>

          {/* Due date */}
          <div style={fieldStyle}>
            <span style={labelStyle}>Date</span>
            <input type="date" value={dueDate} onChange={e => handleDateChange(e.target.value)} style={inputStyle} />
          </div>

          {/* Due time */}
          <div style={fieldStyle}>
            <span style={labelStyle}>Time</span>
            <input type="time" value={dueTime} onChange={e => handleTimeChange(e.target.value)} style={inputStyle} />
          </div>

          {/* Domain */}
          <div style={fieldStyle}>
            <span style={labelStyle}>Domain</span>
            <select value={domain} onChange={e => handleDomainChange(e.target.value)} style={selectStyle}>
              {DOMAINS.map(d => (
                <option key={d.id} value={d.id}>{d.icon} {d.label}</option>
              ))}
            </select>
          </div>

          {/* Recurrence */}
          <div style={fieldStyle}>
            <span style={labelStyle}>Repeat</span>
            <RecurrencePicker
              value={task.rrule || null}
              onChange={v => onUpdate(task.id, { rrule: v } as Partial<Task>)}
            />
          </div>

          {/* Reminders */}
          {onAddReminder && onDeleteReminder && (
            <div style={{ ...fieldStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
              <span style={labelStyle}>Reminders</span>
              <ReminderPicker
                taskId={task.id}
                dueDate={task.due_date}
                dueTime={task.due_time}
                reminders={(task.reminders || []).map(r => ({ id: r.id, remind_at: r.remind_at, offset_minutes: r.offset_minutes }))}
                onAdd={onAddReminder}
                onDelete={onDeleteReminder}
              />
            </div>
          )}

          {/* Notes */}
          <div style={{ marginTop: 16 }}>
            <span style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Notes</span>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="Add notes..."
              rows={4}
              style={{
                width: '100%', border: '1px solid var(--border)',
                background: 'var(--surface)', borderRadius: 10,
                padding: '10px 12px', fontSize: 12.5, color: T.text,
                outline: 'none', resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Subtasks */}
          <div style={{ marginTop: 20 }}>
            <span style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>Subtasks</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(task.subtasks || []).map((sub: Subtask) => (
                <div key={sub.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderRadius: 8,
                }}>
                  <button
                    onClick={() => onToggleSubtask(sub.id, !sub.completed)}
                    style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${sub.completed ? 'var(--teal)' : 'var(--border-strong)'}`,
                      background: sub.completed ? 'var(--teal)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    {sub.completed && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <span style={{
                    flex: 1, fontSize: 12.5, color: sub.completed ? T.textMuted : T.text,
                    textDecoration: sub.completed ? 'line-through' : 'none',
                    fontWeight: 500,
                  }}>{sub.title}</span>
                  <button
                    onClick={() => onDeleteSubtask(sub.id)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: T.textFaint, fontSize: 14, padding: '2px 4px',
                    }}
                  >×</button>
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', gap: 8, marginTop: 6,
            }}>
              <input
                value={subtaskInput}
                onChange={e => setSubtaskInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
                placeholder="Add subtask..."
                style={{
                  flex: 1, border: '1px solid var(--border)',
                  background: 'var(--surface)', borderRadius: 8,
                  padding: '6px 10px', fontSize: 12, color: T.text,
                  outline: 'none',
                }}
              />
              <button
                onClick={addSubtask}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: T.textMuted, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >Add</button>
            </div>
          </div>

          {/* Meta */}
          <div style={{
            marginTop: 20, padding: '10px 0',
            borderTop: '1px solid var(--border-soft)',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <span style={{ fontSize: 10, color: T.textFaint }}>
              Created {new Date(task.created_at).toLocaleDateString()}
            </span>
            {task.completed_at && (
              <span style={{ fontSize: 10, color: T.textFaint }}>
                Completed {new Date(task.completed_at).toLocaleDateString()}
              </span>
            )}
            {task.source !== 'manual' && (
              <span style={{ fontSize: 10, color: T.textFaint }}>
                Source: {task.source}
              </span>
            )}
          </div>
        </div>

        {/* Delete confirmation */}
        {showDelete && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, backdropFilter: 'blur(4px)',
          }}>
            <div style={{
              background: 'var(--bg)', borderRadius: 16,
              padding: '24px', maxWidth: 300, width: '90%',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 8 }}>Delete task?</div>
              <div style={{ fontSize: 12.5, color: T.textMuted, marginBottom: 18 }}>
                This will permanently delete &ldquo;{task.title}&rdquo; and its subtasks.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowDelete(false)}
                  style={{
                    padding: '7px 16px', borderRadius: 8,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    color: T.text, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >Cancel</button>
                <button
                  onClick={() => { onDelete(task.id); onClose(); }}
                  style={{
                    padding: '7px 16px', borderRadius: 8,
                    background: 'var(--red)', border: 'none',
                    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
