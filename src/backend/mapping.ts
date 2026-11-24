import type { Subtask, Task, TaskList } from '../domain/types';

/** Linhas como o PostgREST devolve (snake_case; timestamptz com fuso; date como YYYY-MM-DD). */
export interface TaskRow {
  id: string;
  list_id: string | null;
  title: string;
  description: string;
  priority: Task['priority'];
  status: Task['status'];
  planned_date: string | null;
  due_date: string | null;
  focus_date: string | null;
  position: number;
  subtasks: Subtask[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  completed_on: string | null;
  deleted_at: string | null;
}

export interface ListRow {
  id: string;
  name: string;
  color: TaskList['color'];
  position: number;
  created_at: string;
  updated_at: string;
}

/** Normaliza instantes para o mesmo formato de `Date#toISOString` usado no app e nos backups. */
const iso = (value: string): string => new Date(value).toISOString();
const isoOrNull = (value: string | null): string | null => (value === null ? null : iso(value));

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    listId: row.list_id,
    priority: row.priority,
    status: row.status,
    plannedDate: row.planned_date,
    dueDate: row.due_date,
    focusDate: row.focus_date,
    position: row.position,
    subtasks: row.subtasks.map((s) => ({ id: s.id, title: s.title, completed: s.completed, position: s.position })),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    completedAt: isoOrNull(row.completed_at),
    completedOn: row.completed_on,
    deletedAt: isoOrNull(row.deleted_at),
  };
}

export function taskToRow(task: Task): TaskRow {
  return {
    id: task.id,
    list_id: task.listId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    planned_date: task.plannedDate,
    due_date: task.dueDate,
    focus_date: task.focusDate,
    position: task.position,
    subtasks: task.subtasks,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    completed_at: task.completedAt,
    completed_on: task.completedOn,
    deleted_at: task.deletedAt,
  };
}

export function listFromRow(row: ListRow): TaskList {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    position: row.position,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function listToRow(list: TaskList): ListRow {
  return {
    id: list.id,
    name: list.name,
    color: list.color,
    position: list.position,
    created_at: list.createdAt,
    updated_at: list.updatedAt,
  };
}
