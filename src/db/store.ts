import { SCHEMA_VERSION, type FocusSession, type Settings, type Task, type TaskList } from '../domain/types';
import { EMPTY_SHOPPING, type ShoppingData, type ShoppingItem, type ShoppingList, type ShoppingProduct, type ShoppingPurchase, type ShoppingStore, type ShoppingVariant } from '../domain/shopping/types';

export interface StoreState {
  tasks: Task[];
  lists: TaskList[];
  focusSessions: FocusSession[];
  settings: Settings;
  shopping: ShoppingData;
}

const initial = (): StoreState => ({
  tasks: [],
  lists: [],
  focusSessions: [],
  settings: { id: 'app', schemaVersion: SCHEMA_VERSION },
  shopping: EMPTY_SHOPPING,
});

const byPosition = (a: TaskList, b: TaskList) => a.position - b.position;

/** Chaves das coleções do módulo Compras. */
export type ShoppingKey = keyof ShoppingData;

type ShoppingRow = ShoppingStore | ShoppingProduct | ShoppingVariant | ShoppingList | ShoppingItem | ShoppingPurchase;

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

  /** Remove a tarefa e, como no banco, as sessões de foco dela. */
  removeTask(id: string): void {
    this.set({
      ...this.state,
      tasks: this.state.tasks.filter((t) => t.id !== id),
      focusSessions: this.state.focusSessions.filter((s) => s.taskId !== id),
    });
  }

  putList(list: TaskList): void {
    const others = this.state.lists.filter((l) => l.id !== list.id);
    this.set({ ...this.state, lists: [...others, list].sort(byPosition) });
  }

  removeList(id: string): void {
    this.set({ ...this.state, lists: this.state.lists.filter((l) => l.id !== id) });
  }

  getFocusSessions(taskId: string): FocusSession[] {
    return this.state.focusSessions.filter((s) => s.taskId === taskId);
  }

  /** Acrescenta sessões ainda desconhecidas (registrar a mesma sessão duas vezes não duplica). */
  putFocusSessions(sessions: FocusSession[]): void {
    const known = new Set(this.state.focusSessions.map((s) => s.id));
    const added = sessions.filter((s) => !known.has(s.id));
    if (added.length === 0) return;
    this.set({ ...this.state, focusSessions: [...this.state.focusSessions, ...added] });
  }

  removeFocusSession(id: string): void {
    this.set({ ...this.state, focusSessions: this.state.focusSessions.filter((s) => s.id !== id) });
  }

  setSettings(settings: Settings): void {
    this.set({ ...this.state, settings });
  }

  /* ------------------------------ Compras ------------------------------ */

  /** Substitui ou acrescenta linhas de uma coleção do módulo (por id). */
  putShoppingRows<K extends ShoppingKey>(key: K, rows: ShoppingData[K]): void {
    if (rows.length === 0) return;
    const incoming = new Map((rows as ShoppingRow[]).map((r) => [r.id, r]));
    const current = this.state.shopping[key] as ShoppingRow[];
    const known = new Set(current.map((r) => r.id));
    const kept = current.map((r) => incoming.get(r.id) ?? r);
    const added = (rows as ShoppingRow[]).filter((r) => !known.has(r.id));
    this.set({ ...this.state, shopping: { ...this.state.shopping, [key]: [...kept, ...added] } });
  }

  removeShoppingRow(key: ShoppingKey, id: string): void {
    const current = this.state.shopping[key] as ShoppingRow[];
    this.set({ ...this.state, shopping: { ...this.state.shopping, [key]: current.filter((r) => r.id !== id) } });
  }

  /** Remove uma lista e seus itens da cópia local (como o banco faz em cascata). */
  removeShoppingList(id: string): void {
    this.set({
      ...this.state,
      shopping: {
        ...this.state.shopping,
        lists: this.state.shopping.lists.filter((l) => l.id !== id),
        items: this.state.shopping.items.filter((i) => i.listId !== id),
      },
    });
  }

  /** Substitui todo o módulo (após gravar, ou ao recarregar). */
  setShopping(shopping: ShoppingData): void {
    this.set({ ...this.state, shopping });
  }
}
