'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { T, DOMAINS } from '@/lib/theme';
import type { Task, TaskList } from '@/lib/task-types';
import TaskQuickAdd from '@/components/TaskQuickAdd';
import TaskItem from '@/components/TaskItem';
import TaskDetail from '@/components/TaskDetail';
import KanbanBoard from '@/components/KanbanBoard';
import TaskStats from '@/components/TaskStats';

type View = 'list' | 'kanban' | 'stats';
type Filter = 'all' | 'today' | 'upcoming' | 'overdue' | 'done';

const TZ = 'Australia/Melbourne';
function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter === 'done') params.set('status', 'done');
    if (filter === 'today') params.set('due_date', todayISO());
    if (filter === 'overdue') params.set('due_before', todayISO());
    if (filter === 'upcoming') params.set('due_after', todayISO());
    if (selectedList) params.set('list_id', selectedList);
    const r = await fetch(`/api/tasks?${params}`).then(r => r.json()).catch(() => ({ tasks: [] }));
    setTasks(r.tasks || []);
  }, [filter, selectedList]);

  const fetchLists = useCallback(async () => {
    const r = await fetch('/api/lists').then(r => r.json()).catch(() => ({ lists: [] }));
    setLists(r.lists || []);
  }, []);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchLists()]).finally(() => setLoading(false));
  }, [fetchTasks, fetchLists]);

  const refreshTask = useCallback(async (taskId: string) => {
    const r = await fetch(`/api/tasks/${taskId}`).then(r => r.json()).catch(() => null);
    if (r?.task) {
      setTasks(prev => prev.map(t => t.id === taskId ? r.task : t));
      if (selectedTask?.id === taskId) setSelectedTask(r.task);
    }
  }, [selectedTask]);

  const addTask = useCallback(async (parsed: { title: string; due_date?: string; due_time?: string; priority?: number; tags?: string[]; recurrence?: string }) => {
    const body: Record<string, unknown> = {
      title: parsed.title,
      source: 'quick_add',
    };
    if (parsed.due_date) body.due_date = parsed.due_date;
    if (parsed.due_time) body.due_time = parsed.due_time;
    if (parsed.priority) body.priority = parsed.priority;
    if (parsed.tags?.length) body.tags = parsed.tags;
    if (parsed.recurrence) body.rrule = parsed.recurrence;
    if (selectedList) body.list_id = selectedList;

    const r = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());

    if (r.task) setTasks(prev => [r.task, ...prev]);
  }, [selectedList]);

  const toggleTask = useCallback(async (id: string, done: boolean) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: done ? 'done' : 'todo' } as Task : t));
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: done ? 'done' : 'todo' }),
    });
  }, []);

  const updateTask = useCallback(async (id: string, data: Partial<Task>) => {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await refreshTask(id);
  }, [refreshTask]);

  const deleteTask = useCallback(async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  }, []);

  const moveToColumn = useCallback(async (taskId: string, column: string) => {
    const statusMap: Record<string, string> = { todo: 'todo', in_progress: 'in_progress', done: 'done' };
    const newStatus = statusMap[column] || 'todo';
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus, kanban_column: column } as Task : t));
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, kanban_column: column }),
    });
  }, []);

  const addSubtask = useCallback(async (taskId: string, title: string) => {
    await fetch(`/api/tasks/${taskId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    await refreshTask(taskId);
  }, [refreshTask]);

  const toggleSubtask = useCallback(async (subtaskId: string, completed: boolean) => {
    const taskId = selectedTask?.id;
    if (!taskId) return;
    await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    await refreshTask(taskId);
  }, [selectedTask, refreshTask]);

  const deleteSubtask = useCallback(async (subtaskId: string) => {
    const taskId = selectedTask?.id;
    if (!taskId) return;
    await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' });
    await refreshTask(taskId);
  }, [selectedTask, refreshTask]);

  const addReminder = useCallback(async (taskId: string, data: { remind_at: string; offset_minutes?: number }) => {
    await fetch(`/api/tasks/${taskId}/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});
    await refreshTask(taskId);
  }, [refreshTask]);

  const deleteReminder = useCallback(async (reminderId: string) => {
    const taskId = selectedTask?.id;
    if (!taskId) return;
    await fetch(`/api/tasks/${taskId}/reminders/${reminderId}`, { method: 'DELETE' }).catch(() => {});
    await refreshTask(taskId);
  }, [selectedTask, refreshTask]);

  const createList = useCallback(async () => {
    if (!newListName.trim()) return;
    const r = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName.trim() }),
    }).then(r => r.json());
    if (r.list) setLists(prev => [...prev, r.list]);
    setNewListName('');
    setShowNewList(false);
  }, [newListName]);

  const filteredTasks = useMemo(() => {
    if (filter === 'done') return tasks;
    if (filter === 'overdue') return tasks.filter(t => t.status !== 'done');
    return tasks;
  }, [tasks, filter]);

  const activeTasks = filteredTasks.filter(t => t.status !== 'done');
  const doneTasks = filteredTasks.filter(t => t.status === 'done');

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'done', label: 'Done' },
  ];

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <h1 className="title-display" style={{
          fontSize: 24, fontWeight: 800, color: T.text,
          letterSpacing: '-0.04em', margin: 0,
        }}>Tasks</h1>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setView('list')}
            style={{
              padding: '5px 10px', borderRadius: 8,
              background: view === 'list' ? 'var(--teal-glow)' : 'var(--surface)',
              border: `1px solid ${view === 'list' ? 'var(--teal-brd)' : 'var(--border)'}`,
              color: view === 'list' ? T.teal : T.textMuted,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: 'middle', marginRight: 4 }}>
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            List
          </button>
          <button
            onClick={() => setView('kanban')}
            style={{
              padding: '5px 10px', borderRadius: 8,
              background: view === 'kanban' ? 'var(--teal-glow)' : 'var(--surface)',
              border: `1px solid ${view === 'kanban' ? 'var(--teal-brd)' : 'var(--border)'}`,
              color: view === 'kanban' ? T.teal : T.textMuted,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: 'middle', marginRight: 4 }}>
              <rect x="3" y="3" width="5" height="18" rx="1" stroke="currentColor" strokeWidth="2" />
              <rect x="10" y="3" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="2" />
              <rect x="17" y="3" width="5" height="15" rx="1" stroke="currentColor" strokeWidth="2" />
            </svg>
            Board
          </button>
          <button
            onClick={() => setView('stats')}
            style={{
              padding: '5px 10px', borderRadius: 8,
              background: view === 'stats' ? 'var(--teal-glow)' : 'var(--surface)',
              border: `1px solid ${view === 'stats' ? 'var(--teal-brd)' : 'var(--border)'}`,
              color: view === 'stats' ? T.teal : T.textMuted,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: 'middle', marginRight: 4 }}>
              <path d="M4 20h16M7 20V11m4 9V5m4 15v-7m4 7V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Stats
          </button>
        </div>
      </div>

      {/* Quick add */}
      <div style={{ marginBottom: 16 }}>
        <TaskQuickAdd onAdd={addTask} listId={selectedList ?? undefined} />
      </div>

      {/* Filters + Lists */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '4px 12px', borderRadius: 8,
              background: filter === f.id ? 'var(--teal-glow)' : 'transparent',
              border: `1px solid ${filter === f.id ? 'var(--teal-brd)' : 'var(--border)'}`,
              color: filter === f.id ? T.teal : T.textMuted,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >{f.label}</button>
        ))}

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

        <button
          onClick={() => setSelectedList(null)}
          style={{
            padding: '4px 12px', borderRadius: 8,
            background: !selectedList ? 'var(--surface-hover)' : 'transparent',
            border: `1px solid ${!selectedList ? 'var(--border-strong)' : 'var(--border)'}`,
            color: !selectedList ? T.text : T.textMuted,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >All Lists</button>

        {lists.map(l => (
          <button
            key={l.id}
            onClick={() => setSelectedList(l.id)}
            style={{
              padding: '4px 12px', borderRadius: 8,
              background: selectedList === l.id ? `${l.color}18` : 'transparent',
              border: `1px solid ${selectedList === l.id ? `${l.color}60` : 'var(--border)'}`,
              color: selectedList === l.id ? l.color : T.textMuted,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: 2, background: l.color }} />
            {l.name}
          </button>
        ))}

        <button
          onClick={() => setShowNewList(true)}
          style={{
            padding: '4px 8px', borderRadius: 8,
            background: 'transparent', border: '1px solid var(--border)',
            color: T.textFaint, fontSize: 11, cursor: 'pointer',
          }}
        >+ List</button>
      </div>

      {/* New list inline form */}
      {showNewList && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 14,
          padding: '8px 12px', background: 'var(--surface)',
          borderRadius: 10, border: '1px solid var(--border)',
        }}>
          <input
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createList(); if (e.key === 'Escape') setShowNewList(false); }}
            placeholder="List name..."
            autoFocus
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 12.5, color: T.text, outline: 'none',
            }}
          />
          <button onClick={createList} style={{
            padding: '4px 12px', borderRadius: 6,
            background: 'var(--teal)', border: 'none',
            color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>Create</button>
          <button onClick={() => setShowNewList(false)} style={{
            padding: '4px 8px', borderRadius: 6,
            background: 'transparent', border: '1px solid var(--border)',
            color: T.textMuted, fontSize: 11, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
          Loading tasks...
        </div>
      ) : view === 'stats' ? (
        <TaskStats tasks={tasks} />
      ) : view === 'kanban' ? (
        <KanbanBoard tasks={filteredTasks} onToggle={toggleTask} onClick={setSelectedTask} onMove={moveToColumn} />
      ) : (
        <>
          {/* Active tasks */}
          {activeTasks.length === 0 && doneTasks.length === 0 ? (
            <div style={{
              padding: '48px 20px', textAlign: 'center',
              color: T.textMuted,
            }}>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No tasks yet</div>
              <div style={{ fontSize: 12, color: T.textFaint }}>
                Type above to quick-add a task with natural language
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--surface)', borderRadius: 14,
              border: '1px solid var(--border)', overflow: 'hidden',
            }}>
              {activeTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={toggleTask}
                  onClick={setSelectedTask}
                  draggable
                  onDragStart={(e, t) => {
                    e.dataTransfer.setData('text/plain', t.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={(e, targetTask) => {
                    e.preventDefault();
                    const draggedId = e.dataTransfer.getData('text/plain');
                    if (!draggedId || draggedId === targetTask.id) return;
                    setTasks(prev => {
                      const arr = [...prev];
                      const fromIdx = arr.findIndex(t => t.id === draggedId);
                      const toIdx = arr.findIndex(t => t.id === targetTask.id);
                      if (fromIdx < 0 || toIdx < 0) return prev;
                      const [moved] = arr.splice(fromIdx, 1);
                      arr.splice(toIdx, 0, moved);
                      const updates = arr.map((t, i) => ({ id: t.id, sort_order: i }));
                      fetch('/api/tasks/reorder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ updates }),
                      });
                      return arr.map((t, i) => ({ ...t, sort_order: i }));
                    });
                  }}
                />
              ))}

              {/* Done section */}
              {doneTasks.length > 0 && filter !== 'done' && (
                <>
                  <div style={{
                    padding: '8px 14px', fontSize: 10, fontWeight: 700,
                    color: T.textFaint, textTransform: 'uppercase',
                    letterSpacing: '0.06em', background: 'var(--surface-hover)',
                    borderTop: '1px solid var(--border)',
                  }}>Completed ({doneTasks.length})</div>
                  {doneTasks.slice(0, 5).map(task => (
                    <TaskItem key={task.id} task={task} onToggle={toggleTask} onClick={setSelectedTask} />
                  ))}
                  {doneTasks.length > 5 && (
                    <div style={{
                      padding: '8px 14px', fontSize: 11, color: T.textFaint,
                      textAlign: 'center',
                    }}>+{doneTasks.length - 5} more completed</div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Task detail panel */}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onAddSubtask={addSubtask}
          onToggleSubtask={toggleSubtask}
          onDeleteSubtask={deleteSubtask}
          onAddReminder={addReminder}
          onDeleteReminder={deleteReminder}
        />
      )}
    </div>
  );
}
