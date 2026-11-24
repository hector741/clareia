import { compareDates, compareNullableDates, diffDays } from './dates';
import { compareAuto } from './sort';
import type { DateString, Task } from './types';

export function isActive(task: Task): boolean {
  return task.deletedAt === null;
}

export function isPendingActive(task: Task): boolean {
  return task.deletedAt === null && task.status === 'pending';
}

/** Tarefa pendente, não excluída, em foco na data indicada. */
export function isFocusedOn(task: Task, today: DateString): boolean {
  return isPendingActive(task) && task.focusDate === today;
}

export function countFocused(tasks: readonly Task[], today: DateString): number {
  return tasks.filter((t) => isFocusedOn(t, today)).length;
}

export function isOverdue(task: Task, today: DateString): boolean {
  return task.status === 'pending' && task.dueDate !== null && compareDates(task.dueDate, today) < 0;
}

/** Fazer em anterior a hoje (intenção antiga), independente do prazo. */
export function needsReplan(task: Task, today: DateString): boolean {
  return task.status === 'pending' && task.plannedDate !== null && compareDates(task.plannedDate, today) < 0;
}

/** Fazer em posterior ao Prazo: orientação não bloqueante. */
export function plannedAfterDue(task: { plannedDate: DateString | null; dueDate: DateString | null }): boolean {
  return task.plannedDate !== null && task.dueDate !== null && compareDates(task.plannedDate, task.dueDate) > 0;
}

export interface TodayGroups {
  focus: Task[];
  overdue: Task[];
  forToday: Task[];
  replan: Task[];
}

/**
 * Distribui cada tarefa de Hoje em um único grupo, na precedência:
 * Em foco > Prazo passou > Para hoje > Replanejar.
 */
export function classifyToday(tasks: readonly Task[], today: DateString): TodayGroups {
  const groups: TodayGroups = { focus: [], overdue: [], forToday: [], replan: [] };
  for (const task of tasks) {
    if (!isPendingActive(task)) continue;
    if (task.focusDate === today) {
      groups.focus.push(task);
    } else if (task.dueDate !== null && compareDates(task.dueDate, today) < 0) {
      groups.overdue.push(task);
    } else if (task.plannedDate === today || task.dueDate === today) {
      groups.forToday.push(task);
    } else if (task.plannedDate !== null && compareDates(task.plannedDate, today) < 0) {
      groups.replan.push(task);
    }
  }
  groups.focus.sort(compareAuto);
  groups.overdue.sort(
    (a, b) => compareNullableDates(a.dueDate, b.dueDate) || compareAuto(a, b),
  );
  groups.forToday.sort(compareAuto);
  groups.replan.sort(
    (a, b) => compareNullableDates(a.plannedDate, b.plannedDate) || compareAuto(a, b),
  );
  return groups;
}

export function countCompletedOn(tasks: readonly Task[], today: DateString): number {
  return tasks.filter((t) => t.deletedAt === null && t.status === 'completed' && t.completedOn === today).length;
}

export interface UpcomingGroup {
  date: DateString;
  tasks: Task[];
}

/** Menor data futura (Fazer em ou Prazo) de uma tarefa, ou null. */
export function earliestFutureDate(task: Task, today: DateString): DateString | null {
  const future = [task.plannedDate, task.dueDate].filter(
    (d): d is DateString => d !== null && compareDates(d, today) > 0,
  );
  if (future.length === 0) return null;
  return future.reduce((min, d) => (compareDates(d, min) < 0 ? d : min));
}

/** Próximas: cada tarefa aparece uma vez, agrupada pela menor data futura. */
export function groupUpcoming(tasks: readonly Task[], today: DateString): UpcomingGroup[] {
  const byDate = new Map<DateString, Task[]>();
  for (const task of tasks) {
    if (!isPendingActive(task)) continue;
    const date = earliestFutureDate(task, today);
    if (date === null) continue;
    const bucket = byDate.get(date);
    if (bucket) bucket.push(task);
    else byDate.set(date, [task]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => compareDates(a, b))
    .map(([date, list]) => ({ date, tasks: list.sort(compareAuto) }));
}

/** Texto curto para quantos dias um prazo está vencido. */
export function overdueDays(dueDate: DateString, today: DateString): number {
  return diffDays(today, dueDate);
}