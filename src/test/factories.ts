import type { Task, TaskList } from '../domain/types';

let counter = 0;

export function makeTask(overrides: Partial<Task> = {}): Task {
  counter += 1;
  const stamp = `2026-11-01T10:00:${String(counter % 60).padStart(2, '0')}.000Z`;
  return {
    id: crypto.randomUUID(),
    title: `Tarefa ${counter}`,
    description: '',
    listId: null,
    priority: 'normal',
    status: 'pending',
    plannedDate: null,
    dueDate: null,
    focusDate: null,
    position: counter,
    subtasks: [],
    createdAt: stamp,
    updatedAt: stamp,
    completedAt: null,
    completedOn: null,
    deletedAt: null,
    ...overrides,
  };
}

export function makeList(overrides: Partial<TaskList> = {}): TaskList {
  counter += 1;
  return {
    id: crypto.randomUUID(),
    name: `Lista ${counter}`,
    color: 'green',
    position: counter,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}
