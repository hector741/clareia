import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBackupText } from '../domain/backup';
import { emptyTaskInput, taskToInput } from '../domain/taskInput';
import { FOCUS_LIMIT_MESSAGE, type BackupFile } from '../domain/types';
import { ClareiaDB } from './database';
import { AppError } from './errors';
import { createRepository } from './repository';

const opened: ClareiaDB[] = [];

function setup(name = `test-${crypto.randomUUID()}`, clockRef = { now: new Date(2026, 10, 24, 10, 0, 0) }) {
  const db = new ClareiaDB(name);
  opened.push(db);
  const repo = createRepository(db, () => clockRef.now);
  return { db, repo, clockRef, name };
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (opened.length) {
    const db = opened.pop()!;
    db.close();
  }
});

const TODAY = '2026-11-24';

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('tarefas: criação e validação', () => {
  it('cria uma tarefa só com o título e recusa título vazio', async () => {
    const { repo, db } = setup();
    const task = await repo.createTask(emptyTaskInput({ title: '  Pagar contas  ' }));
    expect(task.title).toBe('Pagar contas');
    expect(task.listId).toBeNull();
    expect(task.plannedDate).toBeNull();
    expect(task.priority).toBe('normal');
    await expectCode(repo.createTask(emptyTaskInput({ title: '   ' })), 'validation');
    await expectCode(repo.createTask(emptyTaskInput({ title: 'x'.repeat(201) })), 'validation');
    expect(await db.tasks.count()).toBe(1);
  });

  it('recusa datas impossíveis e lista inexistente', async () => {
    const { repo } = setup();
    await expectCode(repo.createTask(emptyTaskInput({ title: 'a', dueDate: '2026-02-30' })), 'validation');
    await expectCode(repo.createTask(emptyTaskInput({ title: 'a', listId: crypto.randomUUID() })), 'not_found');
  });

  it('Fazer em e Prazo permanecem independentes na edição', async () => {
    const { repo } = setup();
    const task = await repo.createTask(emptyTaskInput({ title: 'a', dueDate: '2026-12-05' }));
    const { task: edited } = await repo.updateTask(task.id, { ...taskToInput(task), plannedDate: '2026-11-30' });
    expect(edited.plannedDate).toBe('2026-11-30');
    expect(edited.dueDate).toBe('2026-12-05');
    const { task: cleared } = await repo.updateTask(task.id, { ...taskToInput(edited), plannedDate: null });
    expect(cleared.plannedDate).toBeNull();
    expect(cleared.dueDate).toBe('2026-12-05');
  });
});

describe('foco', () => {
  it('define foco e Fazer em hoje sem alterar o prazo', async () => {
    const { repo } = setup();
    const t = await repo.createTask(emptyTaskInput({ title: 'a', dueDate: '2026-12-05' }));
    const focused = await repo.focusTask(t.id);
    expect(focused.focusDate).toBe(TODAY);
    expect(focused.plannedDate).toBe(TODAY);
    expect(focused.dueDate).toBe('2026-12-05');
    const back = await repo.unfocusTask(t.id);
    expect(back.focusDate).toBeNull();
    expect(back.plannedDate).toBe(TODAY);
  });

  it('respeita o limite de três, sem substituir silenciosamente', async () => {
    const { repo, db } = setup();
    const tasks = await Promise.all([1, 2, 3, 4].map((n) => repo.createTask(emptyTaskInput({ title: `t${n}` }))));
    for (const t of tasks.slice(0, 3)) await repo.focusTask(t.id);
    const err = await repo.focusTask(tasks[3]!.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('focus_limit');
    expect((err as AppError).message).toBe(FOCUS_LIMIT_MESSAGE);
    expect(await db.tasks.where('focusDate').equals(TODAY).count()).toBe(3);
    // Retirar uma libera a vaga.
    await repo.unfocusTask(tasks[0]!.id);
    await repo.focusTask(tasks[3]!.id);
    expect(await db.tasks.where('focusDate').equals(TODAY).count()).toBe(3);
  });

  it('chamadas simultâneas nunca passam de três', async () => {
    const { repo, db } = setup();
    const tasks = await Promise.all(Array.from({ length: 6 }, (_, n) => repo.createTask(emptyTaskInput({ title: `t${n}` }))));
    const results = await Promise.allSettled(tasks.map((t) => repo.focusTask(t.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(await db.tasks.where('focusDate').equals(TODAY).count()).toBe(3);
  });

  it('duas abas (duas conexões ao mesmo banco) respeitam o limite', async () => {
    const a = setup();
    const b = setup(a.name, a.clockRef);
    const tasks = await Promise.all(Array.from({ length: 6 }, (_, n) => a.repo.createTask(emptyTaskInput({ title: `t${n}` }))));
    const results = await Promise.allSettled(
      tasks.map((t, i) => (i % 2 === 0 ? a.repo : b.repo).focusTask(t.id)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(await a.db.tasks.where('focusDate').equals(TODAY).count()).toBe(3);
  });

  it('concluir e excluir liberam vaga; focar em concluída é recusado', async () => {
    const { repo } = setup();
    const t = await Promise.all([1, 2, 3, 4].map((n) => repo.createTask(emptyTaskInput({ title: `t${n}` }))));
    await repo.focusTask(t[0]!.id);
    await repo.focusTask(t[1]!.id);
    await repo.focusTask(t[2]!.id);
    const done = await repo.completeTask(t[0]!.id);
    expect(done.focusDate).toBeNull();
    await repo.focusTask(t[3]!.id);
    const trashed = await repo.trashTask(t[1]!.id);
    expect(trashed.focusDate).toBeNull();
    await expectCode(repo.focusTask(t[0]!.id), 'invalid_state');
    const restored = await repo.restoreTask(t[1]!.id);
    expect(restored.focusDate).toBeNull();
  });

  it('ao virar o dia o foco antigo deixa de valer sem apagar nada', async () => {
    const { repo, clockRef, db } = setup();
    const t = await repo.createTask(emptyTaskInput({ title: 'a' }));
    await repo.focusTask(t.id);
    clockRef.now = new Date(2026, 10, 25, 9, 0, 0);
    const others = await Promise.all([1, 2, 3].map((n) => repo.createTask(emptyTaskInput({ title: `n${n}` }))));
    for (const o of others) await repo.focusTask(o.id);
    const old = await db.tasks.get(t.id);
    expect(old?.status).toBe('pending');
    expect(old?.focusDate).toBe(TODAY);
    expect(await db.tasks.where('focusDate').equals('2026-11-25').count()).toBe(3);
  });

  it('mudar Fazer em de uma tarefa em foco tira do foco e avisa', async () => {
    const { repo } = setup();
    const t = await repo.createTask(emptyTaskInput({ title: 'a' }));
    const focused = await repo.focusTask(t.id);
    const result = await repo.updateTask(t.id, { ...taskToInput(focused), plannedDate: '2026-11-30' });
    expect(result.unfocused).toBe(true);
    expect(result.task.focusDate).toBeNull();
  });
});

describe('concluir e reabrir', () => {
  it('registra instante e data local, preserva etapas e reabre limpando conclusão', async () => {
    const { repo, clockRef } = setup();
    clockRef.now = new Date(2026, 10, 24, 23, 30, 0); // data local 24; em UTC já seria dia 25
    const stepId = crypto.randomUUID();
    const t = await repo.createTask(
      emptyTaskInput({
        title: 'a',
        description: 'desc',
        plannedDate: '2026-11-24',
        dueDate: '2026-11-30',
        subtasks: [
          { id: stepId, title: 'um', completed: true },
          { id: crypto.randomUUID(), title: 'dois', completed: false },
        ],
      }),
    );
    const done = await repo.completeTask(t.id);
    expect(done.status).toBe('completed');
    expect(done.completedOn).toBe('2026-11-24');
    expect(done.completedAt).toBe(clockRef.now.toISOString());
    expect(done.subtasks.map((s) => s.completed)).toEqual([true, false]);
    expect(done.description).toBe('desc');

    const reopened = await repo.reopenTask(t.id);
    expect(reopened.status).toBe('pending');
    expect(reopened.completedAt).toBeNull();
    expect(reopened.completedOn).toBeNull();
    expect(reopened.description).toBe('desc');
    expect(reopened.plannedDate).toBe('2026-11-24');
    expect(reopened.dueDate).toBe('2026-11-30');
    expect(reopened.subtasks.map((s) => s.completed)).toEqual([true, false]);
  });

  it('marcar todas as etapas não conclui a tarefa', async () => {
    const { repo } = setup();
    const t = await repo.createTask(
      emptyTaskInput({ title: 'a', subtasks: [{ id: crypto.randomUUID(), title: 'x', completed: false }] }),
    );
    const { task } = await repo.updateTask(t.id, {
      ...taskToInput(t),
      subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, completed: true })),
    });
    expect(task.status).toBe('pending');
  });
});

describe('exclusão e Lixeira', () => {
  it('exclusão lógica, restauração e exclusão definitiva', async () => {
    const { repo, db } = setup();
    const t = await repo.createTask(emptyTaskInput({ title: 'a', description: 'd' }));
    await repo.trashTask(t.id);
    expect((await db.tasks.get(t.id))?.deletedAt).not.toBeNull();
    await expectCode(repo.updateTask(t.id, taskToInput(t)), 'invalid_state');
    await expectCode(repo.deleteTaskForever(crypto.randomUUID()), 'not_found');
    const restored = await repo.restoreTask(t.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.description).toBe('d');
    await expectCode(repo.deleteTaskForever(t.id), 'invalid_state');
    await repo.trashTask(t.id);
    await repo.deleteTaskForever(t.id);
    expect(await db.tasks.get(t.id)).toBeUndefined();
  });
});

describe('listas', () => {
  it('excluir lista mantém todas as tarefas (inclusive concluídas e na Lixeira) na Entrada', async () => {
    const { repo, db } = setup();
    const list = await repo.createList({ name: ' Casa ', color: 'blue' });
    expect(list.name).toBe('Casa');
    const a = await repo.createTask(emptyTaskInput({ title: 'a', listId: list.id }));
    const b = await repo.createTask(emptyTaskInput({ title: 'b', listId: list.id }));
    const c = await repo.createTask(emptyTaskInput({ title: 'c', listId: list.id }));
    const inbox = await repo.createTask(emptyTaskInput({ title: 'inbox' }));
    await repo.completeTask(b.id);
    await repo.trashTask(c.id);
    const result = await repo.deleteList(list.id);
    expect(result.movedTasks).toBe(3);
    expect(await db.lists.count()).toBe(0);
    const all = await db.tasks.toArray();
    expect(all).toHaveLength(4);
    expect(all.every((t) => t.listId === null)).toBe(true);
    const moved = all.filter((t) => t.id !== inbox.id).map((t) => t.position);
    expect(Math.min(...moved)).toBeGreaterThan(inbox.position);
    expect(new Set(all.map((t) => t.position)).size).toBe(4);
    expect(all.find((t) => t.id === a.id)?.status).toBe('pending');
    expect(all.find((t) => t.id === b.id)?.status).toBe('completed');
    expect(all.find((t) => t.id === c.id)?.deletedAt).not.toBeNull();
  });

  it('valida nome e cor da lista', async () => {
    const { repo } = setup();
    await expectCode(repo.createList({ name: '  ', color: 'green' }), 'validation');
    await expectCode(repo.createList({ name: 'x'.repeat(81), color: 'green' }), 'validation');
    await expectCode(repo.createList({ name: 'ok', color: 'roxo' as never }), 'validation');
  });

  it('mover para outra lista coloca a tarefa ao final da ordem de destino', async () => {
    const { repo } = setup();
    const list = await repo.createList({ name: 'L', color: 'green' });
    const a = await repo.createTask(emptyTaskInput({ title: 'a', listId: list.id }));
    const b = await repo.createTask(emptyTaskInput({ title: 'b' }));
    const moved = await repo.moveTask(b.id, list.id);
    expect(moved.listId).toBe(list.id);
    expect(moved.position).toBeGreaterThan(a.position);
    const back = await repo.moveTask(b.id, null);
    expect(back.listId).toBeNull();
    await expectCode(repo.moveTask(b.id, crypto.randomUUID()), 'not_found');
  });
});

describe('ordem manual', () => {
  it('mover para cima e para baixo troca apenas vizinhos pendentes', async () => {
    const { repo, db } = setup();
    const a = await repo.createTask(emptyTaskInput({ title: 'a' }));
    const b = await repo.createTask(emptyTaskInput({ title: 'b' }));
    const c = await repo.createTask(emptyTaskInput({ title: 'c' }));
    const done = await repo.createTask(emptyTaskInput({ title: 'concluida' }));
    await repo.completeTask(done.id);
    const order = async () =>
      (await db.tasks.toArray())
        .filter((t) => t.status === 'pending')
        .sort((x, y) => x.position - y.position)
        .map((t) => t.title);
    expect(await order()).toEqual(['a', 'b', 'c']);
    await repo.reorderTask(c.id, 'up');
    expect(await order()).toEqual(['a', 'c', 'b']);
    await repo.reorderTask(a.id, 'down');
    expect(await order()).toEqual(['c', 'a', 'b']);
    await repo.reorderTask(c.id, 'up'); // já é o primeiro
    expect(await order()).toEqual(['c', 'a', 'b']);
    await repo.reorderTask(b.id, 'down'); // já é o último
    expect(await order()).toEqual(['c', 'a', 'b']);
  });
});
describe('backup: exportar e restaurar', () => {
  async function seed(repo: ReturnType<typeof setup>['repo']) {
    const list = await repo.createList({ name: 'Trabalho', color: 'violet' });
    const t1 = await repo.createTask(
      emptyTaskInput({
        title: 'Reunião <b>x</b>',
        description: '<script>alert(1)</script>',
        listId: list.id,
        plannedDate: TODAY,
        subtasks: [{ id: crypto.randomUUID(), title: 'etapa', completed: false }],
      }),
    );
    const t2 = await repo.createTask(emptyTaskInput({ title: 'Concluída' }));
    const t3 = await repo.createTask(emptyTaskInput({ title: 'Excluída' }));
    await repo.focusTask(t1.id);
    await repo.completeTask(t2.id);
    await repo.trashTask(t3.id);
    return { list, t1, t2, t3 };
  }

  it('exporta tudo e restaura em outra base preservando os registros', async () => {
    const src = setup();
    await seed(src.repo);
    const backup = await src.repo.exportBackup();
    expect(backup.app).toBe('clareia');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.tasks).toHaveLength(3);
    const text = JSON.stringify(backup);

    const parsed = parseBackupText(text, TODAY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary).toMatchObject({ lists: 1, pending: 1, completed: 1, trashed: 1 });

    const dst = setup();
    await dst.repo.createTask(emptyTaskInput({ title: 'vai ser substituída' }));
    await dst.repo.restoreBackup(parsed.backup);
    const restored = await dst.repo.exportBackup();
    expect(restored.tasks.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      backup.tasks.sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(restored.lists).toEqual(backup.lists);
  });

  it('registra a última exportação gerada', async () => {
    const { repo } = setup();
    expect((await repo.getSettings()).lastExportGeneratedAt).toBeUndefined();
    await repo.markExported('2026-11-24T13:00:00.000Z');
    expect((await repo.getSettings()).lastExportGeneratedAt).toBe('2026-11-24T13:00:00.000Z');
  });

  it('arquivo inválido não altera a base', async () => {
    const { repo, db } = setup();
    const { t1 } = await seed(repo);
    const valid = await repo.exportBackup();
    const before = JSON.stringify([await db.tasks.orderBy('id').toArray(), await db.lists.toArray()]);

    const cases: Record<string, (b: BackupFile) => unknown> = {
      appErrado: (b) => ({ ...b, app: 'outro' }),
      versaoFutura: (b) => ({ ...b, schemaVersion: 2 }),
      campoExtra: (b) => ({ ...b, extra: true }),
      dataImpossivel: (b) => ({ ...b, tasks: b.tasks.map((t) => ({ ...t, dueDate: '2026-02-30' })) }),
      idDuplicado: (b) => ({ ...b, tasks: [...b.tasks, b.tasks[0]] }),
      listaInexistente: (b) => ({ ...b, tasks: b.tasks.map((t) => ({ ...t, listId: crypto.randomUUID() })) }),
      pendenteComConclusao: (b) => ({
        ...b,
        tasks: b.tasks.map((t) => (t.status === 'pending' ? { ...t, completedOn: '2026-11-24' } : t)),
      }),
      concluidaSemConclusao: (b) => ({
        ...b,
        tasks: b.tasks.map((t) => (t.status === 'completed' ? { ...t, completedAt: null } : t)),
      }),
      tituloLongo: (b) => ({ ...b, tasks: b.tasks.map((t) => ({ ...t, title: 'x'.repeat(201) })) }),
      focoAcimaDoLimite: (b) => ({
        ...b,
        tasks: [
          ...b.tasks,
          ...[1, 2, 3].map((n) => ({
            ...b.tasks.find((t) => t.id === t1.id)!,
            id: crypto.randomUUID(),
            title: `f${n}`,
            focusDate: TODAY,
          })),
        ],
      }),
      semTasks: (b) => ({ ...b, tasks: undefined }),
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const result = parseBackupText(JSON.stringify(mutate(structuredClone(valid))), TODAY);
      expect(result.ok, name).toBe(false);
    }
    expect(parseBackupText('{não é json', TODAY).ok).toBe(false);
    expect(parseBackupText('[]', TODAY).ok).toBe(false);
    const after = JSON.stringify([await db.tasks.orderBy('id').toArray(), await db.lists.toArray()]);
    expect(after).toBe(before);
  });

  it('falha no meio da transação não deixa restauração parcial', async () => {
    const src = setup();
    await seed(src.repo);
    const backup = await src.repo.exportBackup();

    const dst = setup();
    const keep = await dst.repo.createTask(emptyTaskInput({ title: 'original' }));
    const keepList = await dst.repo.createList({ name: 'Minha', color: 'gray' });
    vi.spyOn(dst.db.tasks, 'bulkAdd').mockRejectedValue(new Error('falha simulada'));
    await expect(dst.repo.restoreBackup(backup)).rejects.toBeInstanceOf(AppError);
    vi.restoreAllMocks();

    const tasks = await dst.db.tasks.toArray();
    expect(tasks.map((t) => t.id)).toEqual([keep.id]);
    expect((await dst.db.lists.toArray()).map((l) => l.id)).toEqual([keepList.id]);
  });

  it('restauração com backup inválido passado diretamente ao repositório é recusada', async () => {
    const { repo, db } = setup();
    await repo.createTask(emptyTaskInput({ title: 'a' }));
    const bad = { app: 'clareia', schemaVersion: 1, exportedAt: 'x', lists: [], tasks: [], settings: {} } as unknown as BackupFile;
    await expectCode(repo.restoreBackup(bad), 'validation');
    expect(await db.tasks.count()).toBe(1);
  });
});

describe('fluxo integrado (persistência)', () => {
  it('criar lista e tarefa, etapas, planejar, focar, editar, concluir, recarregar, histórico, reabrir, excluir, restaurar e exportar/restaurar', async () => {
    const first = setup();
    const { repo } = first;
    const list = await repo.createList({ name: 'Estudos', color: 'amber' });
    const task = await repo.createTask(emptyTaskInput({ title: 'Ler capítulo', listId: list.id }));
    const stepA = crypto.randomUUID();
    const stepB = crypto.randomUUID();
    const planned = await repo.updateTask(task.id, {
      ...taskToInput(task),
      plannedDate: TODAY,
      dueDate: '2026-12-03',
      subtasks: [
        { id: stepA, title: 'Introdução', completed: true },
        { id: stepB, title: 'Exercícios', completed: false },
      ],
    });
    await repo.focusTask(task.id);
    const edited = await repo.updateTask(task.id, { ...taskToInput(planned.task), plannedDate: TODAY, title: 'Ler capítulo 2', priority: 'high' });
    expect(edited.unfocused).toBe(false);
    await repo.completeTask(task.id);

    // "Recarregar": nova conexão ao mesmo banco.
    first.db.close();
    const reopened = setup(first.name, first.clockRef);
    const history = (await reopened.db.tasks.toArray()).filter((t) => t.status === 'completed' && t.completedOn === TODAY);
    expect(history.map((t) => t.title)).toEqual(['Ler capítulo 2']);
    expect(history[0]?.subtasks).toHaveLength(2);

    const reopenedTask = await reopened.repo.reopenTask(task.id);
    expect(reopenedTask.completedOn).toBeNull();
    await reopened.repo.trashTask(task.id);
    const restored = await reopened.repo.restoreTask(task.id);
    expect(restored.focusDate).toBeNull();
    expect(restored.priority).toBe('high');

    const backup = await reopened.repo.exportBackup();
    const parsed = parseBackupText(JSON.stringify(backup), TODAY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const other = setup();
    await other.repo.restoreBackup(parsed.backup);
    const final = await other.db.tasks.get(task.id);
    expect(final?.title).toBe('Ler capítulo 2');
    expect(final?.subtasks.map((s) => s.title)).toEqual(['Introdução', 'Exercícios']);
    expect(await other.db.lists.count()).toBe(1);
  });
});
