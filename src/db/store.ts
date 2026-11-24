import { SCHEMA_VERSION, type Settings, type Task, type TaskList } from '../domain/types';

export interface StoreState {
  tasks: Task[];
  lists: TaskList[];
  settings: Settings;
}

const initial = (): StoreState => ({
  tasks: [],
  lists: [],
  settings: { id: 'app', schemaVersion: SCHEMA_VERSION },
});

const byPosition = (a: TaskList, b: TaskList) => a.position - b.position;

/**
 * Cópia em memória dos dados da conta. As telas leem daqui (instantâneo) e o
 * repositório aplica cada alteração aqui antes de confirmá-la no servidor.
 */
export class DataStore {
  private state: StoreState = initial();
  private readonly listeners = new Set<() => void>();

  getState = (): StoreState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: StoreState): void {
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  replace(next: StoreState): void {
    this.set({ ...next, lists: [...next.lists].sort(byPosition) });
  }

  reset(): void {
    this.set(initial());
  }

  getTask(id: string): Task | undefined {
    return this.state.tasks.find((t) => t.id === id);
  }

  getList(id: string): TaskList | undefined {
    return this.state.lists.find((l) => l.id === id);
  }

  putTasks(tasks: Task[]): void {
    if (tasks.length === 0) return;
    const incoming = new Map(tasks.map((t) => [t.id, t]));
    const kept = this.state.tasks.map((t) => incoming.get(t.id) ?? t);
    const known = new Set(this.state.tasks.map((t) => t.id));
    const added = tasks.filter((t) => !known.has(t.id));
    this.set({ ...this.state, tasks: [...kept, ...added] });
  }

  putTask(task: Task): void {
    this.putTasks([task]);
  }

  removeTask(id: string): void {
    this.set({ ...this.state, tasks: this.state.tasks.filter((t) => t.id !== id) });
  }

  putList(list: TaskList): void {
    const others = this.state.lists.filter((l) => l.id !== list.id);
    this.set({ ...this.state, lists: [...others, list].sort(byPosition) });
  }

  removeList(id: string): void {
    this.set({ ...this.state, lists: this.state.lists.filter((l) => l.id !== id) });
  }

  setSettings(settings: Settings): void {
    this.set({ ...this.state, settings });
  }
}
