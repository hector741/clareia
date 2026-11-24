import type { TaskInput } from './schemas';
import type { Task } from './types';

export function emptyTaskInput(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    title: '',
    description: '',
    listId: null,
    priority: 'normal',
    plannedDate: null,
    dueDate: null,
    subtasks: [],
    ...overrides,
  };
}

export function taskToInput(task: Task): TaskInput {
  return {
    title: task.title,
    description: task.description,
    listId: task.listId,
    priority: task.priority,
    plannedDate: task.plannedDate,
    dueDate: task.dueDate,
    subtasks: [...task.subtasks]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, title: s.title, completed: s.completed })),
  };
}

export function openSubtaskCount(task: Task): number {
  return task.subtasks.filter((s) => !s.completed).length;
}
