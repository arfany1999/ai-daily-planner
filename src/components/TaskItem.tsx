'use client';

import { useState, useCallback } from 'react';
import { T, DOMAIN_BY_ID } from '@/lib/theme';
import type { Task } from '@/lib/task-types';

const PRIORITY_COLORS = ['transparent', 'var(--blue)', 'var(--orange)', 'var(--red)'];

interface Props {
  task: Task;
  onToggle: (id: string, done: boolean) => void;
  onClick: (task: Task) => void;
  onDragStart?: (e: React.DragEvent, task: Task) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, task: Task) => void;
  draggable?: boolean;
}

export default function TaskItem({ task, onToggle, onClick, onDragStart, onDragOver, onDrop, draggable }: Props) {
  const [hovering, setHovering] = useState(false);
  const done = task.status === 'done';
  const domain = DOMAIN_BY_ID[task.domain];
  const subtaskCount = task.subtasks?.length ?? 0;
  const subtaskDone = task.subtasks?.filter(s => s.completed).length ?? 0;
  const overdue = task.due_date && !done && new Date(task.due_date + 'T23:59:59') < new Date();

  const handleCheck = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(task.id, !done);
  }, [task.id, done, onToggle]);

  return (
    <div
      onClick={() => onClick(task)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      draggable={draggable}
      onDragStart={e => onDragStart?.(e, task)}
      onDragOver={e => { e.preventDefault(); onDragOver?.(e); }}
      onDrop={e => onDrop?.(e, task)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 14px', borderRadius: 12,
        background: hovering ? 'var(--surface-hover)' : 'transparent',
        cursor: 'pointer', transition: 'background 0.15s',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      {/* Drag handle */}
      {draggable && (
        <div style={{
          width: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'grab', opacity: hovering ? 0.5 : 0, transition: 'opacity 0.15s',
          flexShrink: 0, alignSelf: 'center',
        }}>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <circle cx="2" cy="2" r="1.2" fill={T.textMuted} />
            <circle cx="6" cy="2" r="1.2" fill={T.textMuted} />
            <circle cx="2" cy="7" r="1.2" fill={T.textMuted} />
            <circle cx="6" cy="7" r="1.2" fill={T.textMuted} />
            <circle cx="2" cy="12" r="1.2" fill={T.textMuted} />
            <circle cx="6" cy="12" r="1.2" fill={T.textMuted} />
          </svg>
        </div>
      )}

      {/* Checkbox */}
      <button
        onClick={handleCheck}
        style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          border: `2px solid ${done ? 'var(--teal)' : task.priority > 0 ? PRIORITY_COLORS[task.priority] : 'var(--border-strong)'}`,
          background: done ? 'var(--teal)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginTop: 1,
          transition: 'all 0.2s ease',
        }}
      >
        {done && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: done ? T.textMuted : T.text,
          textDecoration: done ? 'line-through' : 'none',
          opacity: done ? 0.6 : 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{task.title}</div>

        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {domain && (
            <span style={{
              fontSize: 9.5, padding: '1px 6px', borderRadius: 4,
              background: `${domain.color}18`, color: domain.color,
              fontWeight: 600,
            }}>{domain.icon} {domain.label}</span>
          )}
          {task.due_date && (
            <span style={{
              fontSize: 9.5, fontWeight: 600, color: overdue ? 'var(--red)' : T.textMuted,
            }}>
              {task.due_time ? `${task.due_date} ${task.due_time}` : task.due_date}
            </span>
          )}
          {task.rrule && (
            <span style={{ fontSize: 9.5, color: 'var(--purple)', fontWeight: 600 }}>↻</span>
          )}
          {subtaskCount > 0 && (
            <span style={{ fontSize: 9.5, color: T.textMuted, fontWeight: 500 }}>
              {subtaskDone}/{subtaskCount}
            </span>
          )}
          {task.tags?.map(tag => (
            <span key={tag} style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 4,
              background: 'var(--surface)', color: T.textFaint,
              fontWeight: 500,
            }}>#{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
