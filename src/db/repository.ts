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
import type { ClareiaDB } from './database';
import { AppError, parseOrThrow, toAppError } from './errors';

export type MoveDirection = 'up' | 'down';

export interface UpdateResult {
  task: Task;
  /** A tarefa saiu do foco porque Fazer em deixou de ser a data do foco. */
  unfocused: boolean;
}

/**
 * Operações de domínio e persistência. Toda regra que depende do estado atual
 * (limite de foco, posição, existência de lista) é verificada dentro da transação.
 */
export function createRepository(db: ClareiaDB, clock: () => Date = () => new Date()) {
  const stamp = () => clock().toISOString();
  const today = () => todayLocal(clock());

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toAppError(error);
    }
  }

  async function requireTask(id: string): Promise<Task> {
    const task = await db.tasks.get(id);
    if (!task) throw new AppError('not_found', 'Esta tarefa não existe mais.');
    return task;
  }

  async function requireActiveTask(id: string): Promise<Task> {
    const task = await requireTask(id);
    if (task.deletedAt !== null) {
      throw new AppError('invalid_state', 'Esta tarefa está na Lixeira. Restaure-a para continuar.');
    }
    return task;
  }

  async function assertListExists(listId: string | null): Promise<void> {
    if (listId === null) return;
    const list = await db.lists.get(listId);
    if (!list) throw new AppError('not_found', 'A lista escolhida não existe mais.', { listId: 'Escolha outra lista.' });
  }

  /** Próxima posição ao final da ordem de uma lista (ou da Entrada). */
  async function nextPosition(listId: string | null): Promise<number> {
    let max = 0;
    await db.tasks.each((t) => {
      if (t.listId === listId && t.position > max) max = t.position;
    });
    return max + 1;
  }

  function buildSubtasks(input: { id: string; title: string; completed: boolean }[]): Subtask[] {
    return input.map((s, index) => ({ id: s.id, title: s.title, completed: s.completed, position: index + 1 }));
  }

  return {
    /* ------------------------------- Tarefas ------------------------------- */

    async createTask(input: TaskInput): Promise<Task> {
      const parsed = parseOrThrow(taskInputSchema, input);
      return run(() =>
        db.transaction('rw', db.tasks, db.lists, async () => {
          await assertListExists(parsed.listId);
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
            position: await nextPosition(parsed.listId),
            subtasks: buildSubtasks(parsed.subtasks),
            createdAt: ts,
            updatedAt: ts,
            completedAt: null,
            completedOn: null,
            deletedAt: null,
          };
          await db.tasks.add(task);
          return task;
        }),
      );
    },

    async updateTask(id: string, input: TaskInput): Promise<UpdateResult> {
      const parsed = parseOrThrow(taskInputSchema, input);
      return run(() =>
        db.transaction('rw', db.tasks, db.lists, async () => {
          const current = await requireActiveTask(id);
          await assertListExists(parsed.listId);
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
            position: listChanged ? await nextPosition(parsed.listId) : current.position,
            updatedAt: stamp(),
          };
          await db.tasks.put(task);
          return { task, unfocused };
        }),
      );
    },

    /** Conclui: registra instante e data local, tira do foco e preserva conteúdo e etapas. */
    async completeTask(id: string): Promise<Task> {
      return run(() =>
        db.transaction('rw', db.tasks, async () => {
          const current = await requireActiveTask(id);
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
          await db.tasks.put(task);
          return task;
        }),
      );
    },

    async reopenTask(id: string): Promise<Task> {
      return run(() =>
        db.transaction('rw', db.tasks, async () => {
          const current = await requireActiveTask(id);
          if (current.status === 'pending') return current;
          const task: Task = {
            ...current,
            status: 'pending',
            completedAt: null,
            completedOn: null,
            updatedAt: stamp(),
          };
          await db.tasks.put(task);
          return task;
        }),
      );
    },

    /** Focar hoje: define foco e Fazer em como hoje, respeitando o limite dentro da transação. */
    async focusTask(id: string): Promise<Task> {
      return run(() =>
        db.transaction('rw', db.tasks, async () => {
          const current = await requireActiveTask(id);
          if (current.status !== 'pending') {
            throw new AppError('invalid_state', 'Só tarefas pendentes podem ficar em foco. Reabra a tarefa antes.');
          }
          const day = today();
          if (current.focusDate === day) return current;
          const focused = await db.tasks
            .where('focusDate')
            .equals(day)
            .filter((t) => t.id !== id && isPendingActive(t))
            .count();
          if (focused >= MAX_FOCUS) throw new AppError('focus_limit', FOCUS_LIMIT_MESSAGE);
          const task: Task = { ...current, focusDate: day, plannedDate: day, updatedAt: stamp() };
          await db.tasks.put(task);
          return task;
        }),
      );
    },

    /** Retirar do foco limpa apenas focusDate. */
    async unfocusTask(id: string): Promise<Task> {
      return run(() =>
        db.transaction('rw', db.tasks, async () => {
          const current = await requireTask(id);
          if (current.focusDate === null) return current;
          const task: Task = { ...current, focusDate: null, updatedAt: stamp() };
          await db.tasks.put(task);
          return task;
        }),
      );
    },

    async moveTask(id: string, listId: string | null): Promise<Task> {
      return run(() =>
        db.transaction('rw', db.tasks, db.lists, async () => {
          const current = await requireActiveTask(id);
          if (current.listId === listId) return current;
          await assertListExists(listId);
          const task: Task = {
            ...current,
            listId,
            position: await nextPosition(listId),
            updatedAt: stamp(),
          };
          await db.tasks.put(task);
          return task;
        }),
      );
    },

    /** Ordem manual: troca a tarefa com a vizinha pendente da mesma lista/Entrada. */
    async reorderTask(id: string, direction: MoveDirection): Promise<void> {
      await run(() =>
        db.transaction('rw', db.tasks, async () => {
          const current = await requireActiveTask(id);
          const siblings = (
            await db.tasks.filter((t) => t.listId === current.listId && isPendingActive(t)).toArray()
          ).sort(compareManual);
          const index = siblings.findIndex((t) => t.id === id);
          const target = direction === 'up' ? index - 1 : index + 1;
          if (index < 0 || target < 0 || target >= siblings.length) return;
          const reordered = [...siblings];
          const [moved] = reordered.splice(index, 1);
          reordered.splice(target, 0, moved as Task);
          const ts = stamp();
          for (const [i, task] of reordered.entries()) {
            const position = i + 1;
            if (task.position !== position) {
              await db.tasks.update(task.id, { position, updatedAt: task.id === id ? ts : task.updatedAt });
            }
          }
        }),
      );
    },

    async trashTask(id: string): Promise<Task> {
      return run(() =>
        db.transaction('rw', db.tasks, async () => {
          const current = await requireTask(id);
          if (current.deletedAt !== null) return current;
          const ts = stamp();
          const task: Task = { ...current, deletedAt: ts, focusDate: null, updatedAt: ts };
          await db.tasks.put(task);
          return task;
        }),
      );
    },

    /** Restaurar preserva o conteúdo e volta sem foco. */
    async restoreTask(id: string): Promise<Task> {
      return run(() =>
        db.transaction('rw', db.tasks, db.lists, async () => {
          const current = await requireTask(id);
          if (current.deletedAt === null) return current;
          const listId = current.listId;
          if (listId !== null && !(await db.lists.get(listId))) {
            // Defesa: referência órfã nunca deve existir, mas não perdemos a tarefa.
            const task: Task = { ...current, listId: null, deletedAt: null, focusDate: null, updatedAt: stamp() };
            await db.tasks.put(task);
            return task;
          }
          const task: Task = { ...current, deletedAt: null, focusDate: null, updatedAt: stamp() };
          await db.tasks.put(task);
          return task;
        }),
      );
    },

    async deleteTaskForever(id: string): Promise<void> {
      await run(() =>
        db.transaction('rw', db.tasks, async () => {
          const current = await requireTask(id);
          if (current.deletedAt === null) {
            throw new AppError('invalid_state', 'Só tarefas da Lixeira podem ser excluídas definitivamente.');
          }
          await db.tasks.delete(id);
        }),
      );
    },

    /* -------------------------------- Listas ------------------------------- */

    async createList(input: ListInput): Promise<TaskList> {
      const parsed = parseOrThrow(listInputSchema, input);
      return run(() =>
        db.transaction('rw', db.lists, async () => {
          let max = 0;
          await db.lists.each((l) => {
            if (l.position > max) max = l.position;
          });
          const ts = stamp();
          const list: TaskList = {
            id: crypto.randomUUID(),
            name: parsed.name,
            color: parsed.color,
            position: max + 1,
            createdAt: ts,
            updatedAt: ts,
          };
          await db.lists.add(list);
          return list;
        }),
      );
    },

    async updateList(id: string, input: ListInput): Promise<TaskList> {
      const parsed = parseOrThrow(listInputSchema, input);
      return run(() =>
        db.transaction('rw', db.lists, async () => {
          const current = await db.lists.get(id);
          if (!current) throw new AppError('not_found', 'Esta lista não existe mais.');
          const list: TaskList = { ...current, name: parsed.name, color: parsed.color, updatedAt: stamp() };
          await db.lists.put(list);
          return list;
        }),
      );
    },

    /**
     * Exclui a lista e, na mesma transação, move TODAS as suas tarefas
     * (pendentes, concluídas e da Lixeira) para a Entrada, ao final da ordem.
     */
    async deleteList(id: string): Promise<{ movedTasks: number }> {
      return run(() =>
        db.transaction('rw', db.tasks, db.lists, async () => {
          const list = await db.lists.get(id);
          if (!list) throw new AppError('not_found', 'Esta lista não existe mais.');
          const affected = (await db.tasks.filter((t) => t.listId === id).toArray()).sort(compareManual);
          let position = await nextPosition(null);
          const ts = stamp();
          for (const task of affected) {
            await db.tasks.put({ ...task, listId: null, position, updatedAt: ts });
            position += 1;
          }
          await db.lists.delete(id);
          return { movedTasks: affected.length };
        }),
      );
    },

    /* ------------------------- Configurações e backup ---------------------- */

    async getSettings(): Promise<Settings> {
      return run(async () => (await db.settings.get('app')) ?? { id: 'app', schemaVersion: SCHEMA_VERSION });
    },

    async markExported(exportedAt: string): Promise<Settings> {
      return run(() =>
        db.transaction('rw', db.settings, async () => {
          const current = (await db.settings.get('app')) ?? { id: 'app' as const, schemaVersion: SCHEMA_VERSION };
          const next: Settings = { ...current, lastExportGeneratedAt: exportedAt };
          await db.settings.put(next);
          return next;
        }),
      );
    },

    /** Snapshot consistente de todas as tabelas, numa única transação de leitura. */
    async exportBackup(): Promise<BackupFile> {
      return run(() =>
        db.transaction('r', db.tasks, db.lists, db.settings, async () => {
          const [tasks, lists, settings] = await Promise.all([
            db.tasks.toArray(),
            db.lists.orderBy('position').toArray(),
            db.settings.get('app'),
          ]);
          return {
            app: 'clareia' as const,
            schemaVersion: SCHEMA_VERSION,
            exportedAt: stamp(),
            lists,
            tasks,
            settings: settings ?? { id: 'app' as const, schemaVersion: SCHEMA_VERSION },
          };
        }),
      );
    },

    /**
     * Substitui todos os dados numa única transação. O backup é revalidado aqui;
     * qualquer falha desfaz a transação e a base anterior permanece intacta.
     */
    async restoreBackup(backup: BackupFile): Promise<void> {
      const checked = validateBackup(backup, today());
      if (!checked.ok) {
        throw new AppError('validation', checked.errors[0] ?? 'Backup inválido.');
      }
      const data = checked.backup;
      await run(() =>
        db.transaction('rw', db.tasks, db.lists, db.settings, async () => {
          await db.tasks.clear();
          await db.lists.clear();
          await db.settings.clear();
          await db.lists.bulkAdd(data.lists);
          await db.tasks.bulkAdd(data.tasks);
          await db.settings.put({ ...data.settings, schemaVersion: SCHEMA_VERSION });
        }),
      );
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
