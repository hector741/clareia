import { compareDates } from './dates';
import { sortAuto } from './sort';
import type { DateString, Priority, Task } from './types';

export type StatusFilter = 'pending' | 'completed' | 'all';
export type DueFilter = 'all' | 'today' | 'overdue' | 'none';
/** 'all' = qualquer lista; 'inbox' = sem lista; senão, ID da lista. */
export type ListFilter = 'all' | 'inbox' | (string & {});
export type PriorityFilter = 'all' | Priority;

export interface TaskFilters {
  query: string;
  list: ListFilter;
  priority: PriorityFilter;
  status: StatusFilter;
  due: DueFilter;
}

export const DEFAULT_FILTERS: TaskFilters = {
  query: '',
  list: 'all',
  priority: 'all',
  status: 'pending',
  due: 'all',
};

/** Minúsculas e sem acentos, para comparar “reuniao” com “Reunião”. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '').toLocaleLowerCase('pt-BR');
}

export function matchesQuery(task: Task, query: string): boolean {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeText(
    [task.title, task.description, ...task.subtasks.map((s) => s.title)].join('\n'),
  );
  return terms.every((term) => haystack.includes(term));
}

function matchesDue(task: Task, due: DueFilter, today: DateString): boolean {
  switch (due) {
    case 'all':
      return true;
    case 'none':
      return task.dueDate === null;
    case 'today':
      return task.dueDate === today;
    case 'overdue':
      return task.status === 'pending' && task.dueDate !== null && compareDates(task.dueDate, today) < 0;
  }
}

/** Aplica os filtros com AND. Tarefas na Lixeira nunca entram. */
export function applyFilters(tasks: readonly Task[], filters: TaskFilters, today: DateString): Task[] {
  const result = tasks.filter((task) => {
    if (task.deletedAt !== null) return false;
    if (filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.list === 'inbox' && task.listId !== null) return false;
    if (filters.list !== 'all' && filters.list !== 'inbox' && task.listId !== filters.list) return false;
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
    if (!matchesDue(task, filters.due, today)) return false;
    return matchesQuery(task, filters.query);
  });
  return sortAuto(result);
}

export function hasActiveFilters(filters: TaskFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.list !== DEFAULT_FILTERS.list ||
    filters.priority !== DEFAULT_FILTERS.priority ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.due !== DEFAULT_FILTERS.due
  );
}
