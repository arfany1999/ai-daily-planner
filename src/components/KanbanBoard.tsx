'use client';

import { useCallback } from 'react';
import { T } from '@/lib/theme';
import type { Task } from '@/lib/task-types';
import TaskItem from './TaskItem';

const COLUMNS = [
  { id: 'todo', label: 'To Do', color: 'var(--text-muted)' },
  { id: 'in_progress', label: 'In Progress', color: 'var(--orange)' },
  { id: 'done', label: 'Done', color: 'var(--teal)' },
];

interface Props {
  tasks: Task[];
  onToggle: (id: string, done: boolean) => void;
  onClick: (task: Task) => void;
  onMove: (taskId: string, newColumn: string) => void;
}

export default function KanbanBoard({ tasks, onToggle, onClick, onMove }: Props) {
  const handleDrop = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) onMove(taskId, columnId);
  }, [onMove]);

  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 12, height: '100%', minHeight: 400,
    }}>
      {COLUMNS.map(col => {
        const colTasks = tasks.filter(t => {
          if (col.id === 'todo') return t.status === 'todo';
          if (col.id === 'in_progress') return t.status === 'in_progress';
          return t.status === 'done';
        });

        return (
          <div
            key={col.id}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={e => handleDrop(e, col.id)}
            style={{
              display: 'flex', flexDirection: 'column',
              background: 'var(--surface)', borderRadius: 14,
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 14px', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: col.color,
              }} />
              <span style={{
                fontSize: 12, fontWeight: 700, color: T.text,
                letterSpacing: '-0.01em', flex: 1,
              }}>{col.label}</span>
              <span style={{
                fontSize: 10, fontWeight: 600, color: T.textFaint,
                background: 'var(--surface-hover)', borderRadius: 6,
                padding: '2px 6px',
              }}>{colTasks.length}</span>
            </div>

            <div style={{
              flex: 1, overflowY: 'auto', padding: 4,
              minHeight: 100,
            }}>
              {colTasks.length === 0 ? (
                <div style={{
                  padding: '20px 14px', textAlign: 'center',
                  fontSize: 11, color: T.textFaint,
                }}>No tasks</div>
              ) : colTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onClick={onClick}
                  draggable
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
