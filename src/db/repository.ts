import type { Remote } from '../backend/types';
import { validateBackup } from '../domain/backup';
import { todayLocal } from '../domain/dates';
import {
  listInputSchema,
  taskInputSchema,
  type ListInput,
  type TaskInput,
} from '../domain/schemas';
import { compareManual } from '../domain/sort';
import { isPendingActive } from '../domain/today';
import {
  FOCUS_LIMIT_MESSAGE,
  MAX_FOCUS,
  SCHEMA_VERSION,
  type BackupFile,
  type Settings,
  type Subtask,
  type Task,
  type TaskList,
} from '../domain/types';
import { AppError, parseOrThrow, toAppError } from './errors';
import type { DataStore } from './store';

export type MoveDirection = 'up' | 'down';

export interface UpdateResult {
  task: Task;
  /** A tarefa saiu do foco porque Fazer em deixou de ser a data do foco. */
  unfocused: boolean;
}

export interface LocalData {
  lists: TaskList[];
  tasks: Task[];
}

/**
 * Operações de domínio. Cada uma valida contra o estado atual, aplica o resultado
 * na cópia local (a tela atualiza na hora) e grava no servidor, em fila e em ordem.
 * Se a gravação falhar, a cópia local volta ao estado anterior e o erro é devolvido.
 * Regras que dependem de outros aparelhos (limite de foco, lista existente) também
 * são verificadas no próprio banco.
 */
export function createRepository(store: DataStore, remote: Remote, clock: () => Date = () => new Date()) {
  const stamp = () => clock().toISOString();
  const today = () => todayLocal(clock());

  let chain: Promise<unknown> = Promise.resolve();
  let pending = 0;
  let version = 0;

  function enqueue<T>(persist: () => Promise<T>): Promise<T> {
    pending += 1;
    version += 1;
    const run = chain.then(persist);
    chain = run.catch(() => undefined);
    return run.finally(() => {
      pending -= 1;
    });
  }

  const idle = async () => {
    while (pending > 0) await chain;
  };

  /** Aplica tarefas novas/alteradas na cópia local e grava; desfaz se falhar. */
  async function commitTasks(next: Task[], persist: () => Promise<unknown>): Promise<void> {
    const previous = next.map((t) => store.getTask(t.id));
    store.putTasks(next);
    try {
      await enqueue(persist);
    } catch (error) {
      next.forEach((t, i) => {
        const before = previous[i];
        if (before) store.putTask(before);
        else store.removeTask(t.id);
      });
      void refresh();
      throw toAppError(error);
    }
  }

  function requireTask(id: string): Task {
    const task = store.getTask(id);
    if (!task) throw new AppError('not_found', 'Esta tarefa não existe mais.');
    return task;
  }

  function requireActiveTask(id: string): Task {
    const task = requireTask(id);
    if (task.deletedAt !== null) {
      throw new AppError('invalid_state', 'Esta tarefa está na Lixeira. Restaure-a para continuar.');
    }
    return task;
  }

  function assertListExists(listId: string | null): void {
    if (listId === null) return;
    if (!store.getList(listId)) {
      throw new AppError('not_found', 'A lista escolhida não existe mais.', { listId: 'Escolha outra lista.' });
    }
  }

  /** Próxima posição ao final da ordem de uma lista (ou da Entrada). */
  function nextPosition(listId: string | null): number {
    let max = 0;
    for (const t of store.getState().tasks) if (t.listId === listId && t.position > max) max = t.position;
    return max + 1;
  }

  function buildSubtasks(input: { id: string; title: string; completed: boolean }[]): Subtask[] {
    return input.map((s, index) => ({ id: s.id, title: s.title, completed: s.completed, position: index + 1 }));
  }

  const saveTask = (task: Task) => commitTasks([task], () => remote.saveTask(task));

  /** Busca o estado do servidor; ignora o resultado se houve gravação local nesse meio-tempo. */
  async function refresh(): Promise<void> {
    await idle();
    const startedAt = version;
    const snapshot = await remote.fetchAll();
    if (version === startedAt && pending === 0) store.replace(snapshot);
  }

  async function wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toAppError(error);
    }
  }

  return {
    /** Carrega a conta inteira (ao entrar). */
    async load(): Promise<void> {
      await wrap(async () => {
        await idle();
        store.replace(await remote.fetchAll());
      });
    },

    /** Atualiza com o que outros aparelhos gravaram. Falhas de rede são silenciosas. */
    refresh,

    /* ------------------------------- Tarefas ------------------------------- */

    async createTask(input: TaskInput): Promise<Task> {
      const parsed = parseOrThrow(taskInputSchema, input);
      assertListExists(parsed.listId);
      const ts = stamp();
      const task: Task = {
        id: crypto.randomUUID(),
        title: parsed.title,
        description: parsed.description,
        listId: parsed.listId,
        priority: parsed.priority,
        status: 'pending',
        plannedDate: parsed.plannedDate,
        dueDate: parsed.dueDate,
        focusDate: null,
        position: nextPosition(parsed.listId),
        subtasks: buildSubtasks(parsed.subtasks),
        createdAt: ts,
        updatedAt: ts,
        completedAt: null,
        completedOn: null,
        deletedAt: null,
      };
      await saveTask(task);
      return task;
    },

    async updateTask(id: string, input: TaskInput): Promise<UpdateResult> {
      const parsed = parseOrThrow(taskInputSchema, input);
      const current = requireActiveTask(id);
      assertListExists(parsed.listId);
      const listChanged = current.listId !== parsed.listId;
      let focusDate = current.focusDate;
      let unfocused = false;
      if (focusDate !== null && parsed.plannedDate !== focusDate) {
        focusDate = null;
        unfocused = true;
      }
      const task: Task = {
        ...current,
        title: parsed.title,
        description: parsed.description,
        listId: parsed.listId,
        priority: parsed.priority,
        plannedDate: parsed.plannedDate,
        dueDate: parsed.dueDate,
        focusDate,
        subtasks: buildSubtasks(parsed.subtasks),
        position: listChanged ? nextPosition(parsed.listId) : current.position,
        updatedAt: stamp(),
      };
      await saveTask(task);
      return { task, unfocused };
    },

    /** Conclui: registra instante e data local, tira do foco e preserva conteúdo e etapas. */
    async completeTask(id: string): Promise<Task> {
      const current = requireActiveTask(id);
      if (current.status === 'completed') return current;
      const at = clock();
      const task: Task = {
        ...current,
        status: 'completed',
        completedAt: at.toISOString(),
        completedOn: todayLocal(at),
        focusDate: null,
        updatedAt: at.toISOString(),
      };
      await saveTask(task);
      return task;
    },

    async reopenTask(id: string): Promise<Task> {
      const current = requireActiveTask(id);
      if (current.status === 'pending') return current;
      const task: Task = { ...current, status: 'pending', completedAt: null, completedOn: null, updatedAt: stamp() };
      await saveTask(task);
      return task;
    },

    /** Focar hoje: define foco e Fazer em como hoje, respeitando o limite (aqui e no banco). */
    async focusTask(id: string): Promise<Task> {
      const current = requireActiveTask(id);
      if (current.status !== 'pending') {
        throw new AppError('invalid_state', 'Só tarefas pendentes podem ficar em foco. Reabra a tarefa antes.');
      }
      const day = today();
      if (current.focusDate === day) return current;
      const focused = store
        .getState()
        .tasks.filter((t) => t.id !== id && t.focusDate === day && isPendingActive(t)).length;
      if (focused >= MAX_FOCUS) throw new AppError('focus_limit', FOCUS_LIMIT_MESSAGE);
      const task: Task = { ...current, focusDate: day, plannedDate: day, updatedAt: stamp() };
      await saveTask(task);
      return task;
    },

    /** Retirar do foco limpa apenas focusDate. */
    async unfocusTask(id: string): Promise<Task> {
      const current = requireTask(id);
      if (current.focusDate === null) return current;
      const task: Task = { ...current, focusDate: null, updatedAt: stamp() };
      await saveTask(task);
      return task;
    },

    async moveTask(id: string, listId: string | null): Promise<Task> {
      const current = requireActiveTask(id);
      if (current.listId === listId) return current;
      assertListExists(listId);
      const task: Task = { ...current, listId, position: nextPosition(listId), updatedAt: stamp() };
      await saveTask(task);
      return task;
    },

    /** Ordem manual: troca a tarefa com a vizinha pendente da mesma lista/Entrada. */
    async reorderTask(id: string, direction: MoveDirection): Promise<void> {
      const current = requireActiveTask(id);
      const siblings = store
        .getState()
        .tasks.filter((t) => t.listId === current.listId && isPendingActive(t))
        .sort(compareManual);
      const index = siblings.findIndex((t) => t.id === id);
      const target = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= siblings.length) return;
      const reordered = [...siblings];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(target, 0, moved as Task);
      const ts = stamp();
      const changed = reordered
        .map((task, i) => ({ task, position: i + 1 }))
        .filter(({ task, position }) => task.position !== position)
        .map(({ task, position }) => ({ ...task, position, updatedAt: task.id === id ? ts : task.updatedAt }));
      const ids = reordered.map((t) => t.id);
      await commitTasks(changed, () => remote.setPositions(ids));
    },

    async trashTask(id: string): Promise<Task> {
      const current = requireTask(id);
      if (current.deletedAt !== null) return current;
      const ts = stamp();
      const task: Task = { ...current, deletedAt: ts, focusDate: null, updatedAt: ts };
      await saveTask(task);
      return task;
    },

    /** Restaurar preserva o conteúdo e volta sem foco. */
    async restoreTask(id: string): Promise<Task> {
      const current = requireTask(id);
      if (current.deletedAt === null) return current;
      const orphan = current.listId !== null && !store.getList(current.listId);
      const task: Task = {
        ...current,
        ...(orphan ? { listId: null } : {}),
        deletedAt: null,
        focusDate: null,
        updatedAt: stamp(),
      };
      await saveTask(task);
      return task;
    },

    async deleteTaskForever(id: string): Promise<void> {
      const current = requireTask(id);
      if (current.deletedAt === null) {
        throw new AppError('invalid_state', 'Só tarefas da Lixeira podem ser excluídas definitivamente.');
      }
      store.removeTask(id);
      try {
        await enqueue(() => remote.deleteTask(id));
      } catch (error) {
        store.putTask(current);
        throw toAppError(error);
      }
    },

    /* -------------------------------- Listas ------------------------------- */

    async createList(input: ListInput): Promise<TaskList> {
      const parsed = parseOrThrow(listInputSchema, input);
      const max = store.getState().lists.reduce((m, l) => Math.max(m, l.position), 0);
      const ts = stamp();
      const list: TaskList = {
        id: crypto.randomUUID(),
        name: parsed.name,
        color: parsed.color,
        position: max + 1,
        createdAt: ts,
        updatedAt: ts,
      };
      store.putList(list);
      try {
        await enqueue(() => remote.saveList(list));
      } catch (error) {
        store.removeList(list.id);
        throw toAppError(error);
      }
      return list;
    },

    async updateList(id: string, input: ListInput): Promise<TaskList> {
      const parsed = parseOrThrow(listInputSchema, input);
      const current = store.getList(id);
      if (!current) throw new AppError('not_found', 'Esta lista não existe mais.');
      const list: TaskList = { ...current, name: parsed.name, color: parsed.color, updatedAt: stamp() };
      store.putList(list);
      try {
        await enqueue(() => remote.saveList(list));
      } catch (error) {
        store.putList(current);
        throw toAppError(error);
      }
      return list;
    },

    /**
     * Exclui a lista e move TODAS as suas tarefas (pendentes, concluídas e da Lixeira)
     * para a Entrada, ao final da ordem. No servidor, isso acontece numa única transação.
     */
    async deleteList(id: string): Promise<{ movedTasks: number }> {
      const list = store.getList(id);
      if (!list) throw new AppError('not_found', 'Esta lista não existe mais.');
      const affected = store
        .getState()
        .tasks.filter((t) => t.listId === id)
        .sort(compareManual);
      let position = nextPosition(null) - 1;
      const ts = stamp();
      const moved = affected.map((t) => ({ ...t, listId: null, position: (position += 1), updatedAt: ts }));
      store.putTasks(moved);
      store.removeList(id);
      try {
        await enqueue(() => remote.deleteList(id));
      } catch (error) {
        store.putList(list);
        store.putTasks(affected);
        throw toAppError(error);
      }
      return { movedTasks: affected.length };
    },

    /* ------------------------- Configurações e backup ---------------------- */

    async getSettings(): Promise<Settings> {
      return store.getState().settings;
    },

    async markExported(exportedAt: string): Promise<Settings> {
      const current = store.getState().settings;
      const next: Settings = { ...current, lastExportGeneratedAt: exportedAt };
      store.setSettings(next);
      try {
        await enqueue(() => remote.saveSettings(next));
      } catch (error) {
        store.setSettings(current);
        throw toAppError(error);
      }
      return next;
    },

    /** Retrato consistente da conta, depois de concluir as gravações em andamento. */
    async exportBackup(): Promise<BackupFile> {
      return wrap(async () => {
        await idle();
        const { tasks, lists, settings } = store.getState();
        return {
          app: 'clareia' as const,
          schemaVersion: SCHEMA_VERSION,
          exportedAt: stamp(),
          lists: [...lists].sort((a, b) => a.position - b.position),
          tasks: [...tasks],
          settings,
        };
      });
    },

    /**
     * Substitui todos os dados da conta numa única transação no servidor. O backup é
     * revalidado aqui; qualquer falha mantém os dados anteriores intactos.
     */
    async restoreBackup(backup: BackupFile): Promise<void> {
      const checked = validateBackup(backup, today());
      if (!checked.ok) throw new AppError('validation', checked.errors[0] ?? 'Backup inválido.');
      const data = checked.backup;
      await wrap(async () => {
        await idle();
        await enqueue(() => remote.importData(data.lists, data.tasks, true));
        store.replace(await remote.fetchAll());
      });
    },

    /**
     * Envia para a conta os dados que existiam só neste navegador (antes do login).
     * Acrescenta sem sobrescrever o que já está na conta e não traz o foco antigo.
     */
    async importLocal(local: LocalData): Promise<{ tasks: number; lists: number }> {
      const checked = validateBackup(
        {
          app: 'clareia',
          schemaVersion: SCHEMA_VERSION,
          exportedAt: stamp(),
          lists: local.lists,
          tasks: local.tasks.map((t) => ({ ...t, focusDate: null })),
          settings: { id: 'app', schemaVersion: SCHEMA_VERSION },
        },
        today(),
      );
      if (!checked.ok) throw new AppError('validation', checked.errors[0] ?? 'Dados locais inválidos.');
      const data = checked.backup;
      await wrap(async () => {
        await idle();
        await enqueue(() => remote.importData(data.lists, data.tasks, false));
        store.replace(await remote.fetchAll());
      });
      return { tasks: data.tasks.length, lists: data.lists.length };
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
