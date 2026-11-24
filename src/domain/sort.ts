import { compareNullableDates } from './dates';
import type { Priority, Task } from './types';

const PRIORITY_RANK: Record<Priority, number> = { high: 0, important: 1, normal: 2 };

function tieBreak(a: Task, b: Task): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Ordenação automática: prioridade, prazo, Fazer em, criação e id. */
export function compareAuto(a: Task, b: Task): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  const byDue = compareNullableDates(a.dueDate, b.dueDate);
  if (byDue !== 0) return byDue;
  const byPlanned = compareNullableDates(a.plannedDate, b.plannedDate);
  if (byPlanned !== 0) return byPlanned;
  return tieBreak(a, b);
}

/** Ordenação manual: position, com desempate estável. */
export function compareManual(a: Task, b: Task): number {
  if (a.position !== b.position) return a.position - b.position;
  return tieBreak(a, b);
}

export function sortAuto(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(compareAuto);
}

export function sortManual(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(compareManual);
}

export type SortMode = 'auto' | 'manual';

export function sortTasks(tasks: readonly Task[], mode: SortMode): Task[] {
  return mode === 'manual' ? sortManual(tasks) : sortAuto(tasks);
}
