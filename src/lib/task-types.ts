export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string;
  notes: string;
  due_date: string | null;
  due_time: string | null;
  start_date: string | null;
  estimated_minutes: number | null;
  priority: 0 | 1 | 2 | 3;
  domain: string;
  list_id: string | null;
  tags: string[];
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  completed_at: string | null;
  rrule: string | null;
  rrule_parent_id: string | null;
  sort_order: number;
  kanban_column: string;
  google_event_id: string | null;
  source: 'manual' | 'quick_add' | 'ai_plan' | 'recurring';
  created_at: string;
  updated_at: string;
  subtasks?: Subtask[];
  reminders?: TaskReminder[];
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
}

export interface TaskList {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  is_smart: boolean;
  smart_filter: SmartFilter | null;
  sort_order: number;
  created_at: string;
}

export interface SmartFilter {
  due?: 'today' | 'tomorrow' | 'week' | 'overdue' | 'no_date';
  status?: string;
  priority_gte?: number;
  tags_any?: string[];
  domain?: string;
}

export interface TaskReminder {
  id: string;
  task_id: string;
  user_id: string;
  remind_at: string;
  offset_minutes: number | null;
  sent: boolean;
  created_at: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  due_date?: string | null;
  due_time?: string | null;
  start_date?: string | null;
  estimated_minutes?: number | null;
  priority?: 0 | 1 | 2 | 3;
  domain?: string;
  list_id?: string | null;
  tags?: string[];
  rrule?: string | null;
  source?: 'manual' | 'quick_add';
}

export interface TaskFilters {
  status?: string;
  due_date?: string;
  due_before?: string;
  due_after?: string;
  list_id?: string;
  priority_gte?: number;
  tags_any?: string[];
  domain?: string;
  search?: string;
}
