import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRemote, memoryKeyValue, type KeyValue } from '../backend/memory';
import { parseBackupText } from '../domain/backup';
import { emptyTaskInput, taskToInput } from '../domain/taskInput';
import { FOCUS_LIMIT_MESSAGE, type BackupFile, type FocusSession } from '../domain/types';
import { AppError } from './errors';
import { createRepository } from './repository';
import { DataStore } from './store';

/** Um "aparelho": cópia local + repositório, ligado a um servidor simulado (kv) compartilhável. */
function setup(kv: KeyValue = memoryKeyValue(), clockRef = { now: new Date(2026, 10, 24, 10, 0, 0) }) {
  const controls = { failWrites: false };
  const remote = createMemoryRemote(kv, () => 'user-1', controls);
  const store = new DataStore();
  const repo = createRepository(store, remote, () => clockRef.now);
  const local = () => store.getState().tasks;
  const server = async () => (await remote.fetchAll()).tasks;
  return { kv, clockRef, controls, remote, store, repo, local, server };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const TODAY = '2026-11-24';
const focusedOn = (tasks: { focusDate: string | null }[], day: string) => tasks.filter((t) => t.focusDate === day).length;

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('tarefas: criação e validação', () => {
  it('cria uma tarefa só com o título e recusa título vazio', async () => {
    const { repo, server } = setup();
    const task = await repo.createTask(emptyTaskInput({ title: '  Pagar contas  ' }));
    expect(task.title).toBe('Pagar contas');
    expect(task.listId).toBeNull();
    expect(task.plannedDate).toBeNull();
    expect(task.priority).toBe('normal');
    await expectCode(repo.createTask(emptyTaskInput({ title: '   ' })), 'validation');
    await expectCode(repo.createTask(emptyTaskInput({ title: 'x'.repeat(201) })), 'validation');
    expect(await server()).toHaveLength(1);
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
    const { repo, server } = setup();
    const tasks = await Promise.all([1, 2, 3, 4].map((n) => repo.createTask(emptyTaskInput({ title: `t${n}` }))));
    for (const t of tasks.slice(0, 3)) await repo.focusTask(t.id);
    const err = await repo.focusTask(tasks[3]!.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('focus_limit');
    expect((err as AppError).message).toBe(FOCUS_LIMIT_MESSAGE);
    expect(focusedOn(await server(), TODAY)).toBe(3);
    await repo.unfocusTask(tasks[0]!.id);
    await repo.focusTask(tasks[3]!.id);
    expect(focusedOn(await server(), TODAY)).toBe(3);
  });

  it('chamadas simultâneas nunca passam de três', async () => {
    const { repo, server, local } = setup();
    const tasks = await Promise.all(Array.from({ length: 6 }, (_, n) => repo.createTask(emptyTaskInput({ title: `t${n}` }))));
    const results = await Promise.allSettled(tasks.map((t) => repo.focusTask(t.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(focusedOn(await server(), TODAY)).toBe(3);
    expect(focusedOn(local(), TODAY)).toBe(3);
  });

  it('dois aparelhos na mesma conta: o banco garante o limite e o perdedor é desfeito', async () => {
    const a = setup();
    const b = setup(a.kv, a.clockRef);
    const tasks = await Promise.all(Array.from({ length: 6 }, (_, n) => a.repo.createTask(emptyTaskInput({ title: `t${n}` }))));
    await b.repo.load();
    const results = await Promise.allSettled(tasks.map((t, i) => (i % 2 === 0 ? a.repo : b.repo).focusTask(t.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.every((r) => (r.reason as AppError).code === 'focus_limit')).toBe(true);
    expect(focusedOn(await a.server(), TODAY)).toBe(3);
    await b.repo.refresh();
    expect(focusedOn(b.local(), TODAY)).toBe(3);
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
    const { repo, clockRef, server } = setup();
    const t = await repo.createTask(emptyTaskInput({ title: 'a' }));
    await repo.focusTask(t.id);
    clockRef.now = new Date(2026, 10, 25, 9, 0, 0);
    const others = await Promise.all([1, 2, 3].map((n) => repo.createTask(emptyTaskInput({ title: `n${n}` }))));
    for (const o of others) await repo.focusTask(o.id);
    const old = (await server()).find((x) => x.id === t.id);
    expect(old?.status).toBe('pending');
    expect(old?.focusDate).toBe(TODAY);
    expect(focusedOn(await server(), '2026-11-25')).toBe(3);
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
    const { repo, server } = setup();
    const t = await repo.createTask(emptyTaskInput({ title: 'a', description: 'd' }));
    await repo.trashTask(t.id);
    expect((await server()).find((x) => x.id === t.id)?.deletedAt).not.toBeNull();
    await expectCode(repo.updateTask(t.id, taskToInput(t)), 'invalid_state');
    await expectCode(repo.deleteTaskForever(crypto.randomUUID()), 'not_found');
    const restored = await repo.restoreTask(t.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.description).toBe('d');
    await expectCode(repo.deleteTaskForever(t.id), 'invalid_state');
    await repo.trashTask(t.id);
    await repo.deleteTaskForever(t.id);
    expect(await server()).toHaveLength(0);
  });
});

describe('listas', () => {
  it('excluir lista mantém todas as tarefas (inclusive concluídas e na Lixeira) na Entrada', async () => {
    const { repo, remote, local } = setup();
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
    for (const all of [(await remote.fetchAll()).tasks, local()]) {
      expect(all).toHaveLength(4);
      expect(all.every((t) => t.listId === null)).toBe(true);
      const moved = all.filter((t) => t.id !== inbox.id).map((t) => t.position);
      expect(Math.min(...moved)).toBeGreaterThan(inbox.position);
      expect(new Set(all.map((t) => t.position)).size).toBe(4);
      expect(all.find((t) => t.id === a.id)?.status).toBe('pending');
      expect(all.find((t) => t.id === b.id)?.status).toBe('completed');
      expect(all.find((t) => t.id === c.id)?.deletedAt).not.toBeNull();
    }
    expect((await remote.fetchAll()).lists).toHaveLength(0);
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
  it('mover para cima e para baixo troca apenas vizinhos pendentes, aqui e no servidor', async () => {
    const { repo, local, server } = setup();
    await repo.createTask(emptyTaskInput({ title: 'a' }));
    await repo.createTask(emptyTaskInput({ title: 'b' }));
    const c = await repo.createTask(emptyTaskInput({ title: 'c' }));
    const a = local().find((t) => t.title === 'a')!;
    const b = local().find((t) => t.title === 'b')!;
    const done = await repo.createTask(emptyTaskInput({ title: 'concluida' }));
    await repo.completeTask(done.id);
    const order = (tasks: ReturnType<typeof local>) =>
      tasks
        .filter((t) => t.status === 'pending')
        .sort((x, y) => x.position - y.position)
        .map((t) => t.title);
    expect(order(local())).toEqual(['a', 'b', 'c']);
    await repo.reorderTask(c.id, 'up');
    expect(order(local())).toEqual(['a', 'c', 'b']);
    await repo.reorderTask(a.id, 'down');
    expect(order(local())).toEqual(['c', 'a', 'b']);
    await repo.reorderTask(c.id, 'up');
    await repo.reorderTask(b.id, 'down');
    expect(order(local())).toEqual(['c', 'a', 'b']);
    expect(order(await server())).toEqual(['c', 'a', 'b']);
  });
});

describe('gravação na nuvem', () => {
  it('sem conexão: a alteração aparece, é desfeita e o erro é de rede', async () => {
    const { repo, controls, local, server } = setup();
    const kept = await repo.createTask(emptyTaskInput({ title: 'existente' }));
    controls.failWrites = true;
    const pending = repo.createTask(emptyTaskInput({ title: 'não vai gravar' }));
    expect(local().map((t) => t.title)).toContain('não vai gravar');
    await expectCode(pending, 'network');
    expect(local().map((t) => t.title)).toEqual(['existente']);
    const completing = repo.completeTask(kept.id);
    expect(local()[0]?.status).toBe('completed');
    await expectCode(completing, 'network');
    expect(local()[0]?.status).toBe('pending');
    controls.failWrites = false;
    await repo.createTask(emptyTaskInput({ title: 'agora grava' }));
    expect((await server()).map((t) => t.title).sort()).toEqual(['agora grava', 'existente']);
  });

  it('atualização em segundo plano traz o que outro aparelho gravou', async () => {
    const a = setup();
    const b = setup(a.kv, a.clockRef);
    await b.repo.load();
    await a.repo.createTask(emptyTaskInput({ title: 'do celular' }));
    expect(b.local()).toHaveLength(0);
    await b.repo.refresh();
    expect(b.local().map((t) => t.title)).toEqual(['do celular']);
  });

  it('atualização não apaga uma gravação local em andamento', async () => {
    const { repo, remote, local } = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = remote.saveTask.bind(remote);
    vi.spyOn(remote, 'saveTask').mockImplementationOnce(async (task) => {
      await gate;
      return original(task);
    });
    const creating = repo.createTask(emptyTaskInput({ title: 'lenta' }));
    const refreshing = repo.refresh();
    expect(local().map((t) => t.title)).toEqual(['lenta']);
    release();
    await creating;
    await refreshing;
    expect(local().map((t) => t.title)).toEqual(['lenta']);
  });
});

describe('importar dados salvos só no navegador', () => {
  it('acrescenta sem sobrescrever e não traz o foco antigo', async () => {
    const src = setup();
    const list = await src.repo.createList({ name: 'Antiga', color: 'pink' });
    const t1 = await src.repo.createTask(emptyTaskInput({ title: 'antiga 1', listId: list.id }));
    await src.repo.createTask(emptyTaskInput({ title: 'antiga 2' }));
    await src.repo.focusTask(t1.id);
    const local = { lists: src.store.getState().lists, tasks: src.local() };

    const dst = setup();
    await dst.repo.createTask(emptyTaskInput({ title: 'já na conta' }));
    const result = await dst.repo.importLocal(local);
    expect(result).toEqual({ tasks: 2, lists: 1 });
    const titles = dst.local().map((t) => t.title).sort();
    expect(titles).toEqual(['antiga 1', 'antiga 2', 'já na conta']);
    expect(dst.local().every((t) => t.focusDate === null)).toBe(true);
    expect(dst.local().find((t) => t.title === 'antiga 1')?.listId).toBe(list.id);
    await dst.repo.importLocal(local);
    expect(dst.local()).toHaveLength(3);
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

  const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));

  it('exporta tudo e restaura em outra conta preservando os registros', async () => {
    const src = setup();
    await seed(src.repo);
    const backup = await src.repo.exportBackup();
    expect(backup.app).toBe('clareia');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.tasks).toHaveLength(3);

    const parsed = parseBackupText(JSON.stringify(backup), TODAY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary).toMatchObject({ lists: 1, pending: 1, completed: 1, trashed: 1 });

    const dst = setup();
    await dst.repo.createTask(emptyTaskInput({ title: 'vai ser substituída' }));
    await dst.repo.restoreBackup(parsed.backup);
    const restored = await dst.repo.exportBackup();
    expect(byId(restored.tasks)).toEqual(byId(backup.tasks));
    expect(restored.lists).toEqual(backup.lists);
    expect(byId(await dst.server())).toEqual(byId(backup.tasks));
  });

  it('registra a última exportação gerada na conta', async () => {
    const { repo, remote } = setup();
    expect((await repo.getSettings()).lastExportGeneratedAt).toBeUndefined();
    await repo.markExported('2026-11-24T13:00:00.000Z');
    expect((await repo.getSettings()).lastExportGeneratedAt).toBe('2026-11-24T13:00:00.000Z');
    expect((await remote.fetchAll()).settings.lastExportGeneratedAt).toBe('2026-11-24T13:00:00.000Z');
  });

  it('arquivo inválido não altera a conta', async () => {
    const { repo, remote } = setup();
    const { t1 } = await seed(repo);
    const valid = await repo.exportBackup();
    const before = JSON.stringify(await remote.fetchAll());

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
    expect(JSON.stringify(await remote.fetchAll())).toBe(before);
  });

  it('falha no servidor durante a restauração mantém os dados anteriores', async () => {
    const src = setup();
    await seed(src.repo);
    const backup = await src.repo.exportBackup();

    const dst = setup();
    const keep = await dst.repo.createTask(emptyTaskInput({ title: 'original' }));
    const keepList = await dst.repo.createList({ name: 'Minha', color: 'gray' });
    vi.spyOn(dst.remote, 'importData').mockRejectedValue(new Error('falha simulada'));
    await expect(dst.repo.restoreBackup(backup)).rejects.toBeInstanceOf(AppError);
    vi.restoreAllMocks();

    expect(dst.local().map((t) => t.id)).toEqual([keep.id]);
    expect((await dst.server()).map((t) => t.id)).toEqual([keep.id]);
    expect(dst.store.getState().lists.map((l) => l.id)).toEqual([keepList.id]);
  });

  it('restauração com backup inválido passado diretamente ao repositório é recusada', async () => {
    const { repo, server } = setup();
    await repo.createTask(emptyTaskInput({ title: 'a' }));
    const bad = { app: 'clareia', schemaVersion: 1, exportedAt: 'x', lists: [], tasks: [], settings: {} } as unknown as BackupFile;
    await expectCode(repo.restoreBackup(bad), 'validation');
    expect(await server()).toHaveLength(1);
  });
});

describe('sessões de foco (Pomodoro)', () => {
  const session = (taskId: string, over: Partial<FocusSession> = {}): FocusSession => ({
    id: crypto.randomUUID(),
    taskId,
    kind: 'pomodoro',
    durationSeconds: 1500,
    endedAt: '2026-11-24T13:25:00.000Z',
    ...over,
  });

  it('registra na conta sem concluir a tarefa, e repetir o registro não duplica', async () => {
    const { repo, remote, store, local } = setup();
    const task = await repo.createTask(emptyTaskInput({ title: 'Escrever' }));
    const s = session(task.id);
    await repo.recordFocusSession(s);
    await repo.recordFocusSession(s);
    expect(store.getState().focusSessions).toEqual([s]);
    expect((await remote.fetchAll()).focusSessions).toEqual([s]);
    expect(local()[0]?.status).toBe('pending');
    // Outra aba/aparelho tentando gravar a mesma sessão também não duplica no servidor.
    await remote.saveFocusSession(s);
    expect((await remote.fetchAll()).focusSessions).toHaveLength(1);
  });

  it('falha de conexão desfaz o registro local e devolve erro de rede', async () => {
    const { repo, store, controls } = setup();
    const task = await repo.createTask(emptyTaskInput({ title: 'Escrever' }));
    controls.failWrites = true;
    await expectCode(repo.recordFocusSession(session(task.id)), 'network');
    expect(store.getState().focusSessions).toEqual([]);
  });

  it('recusa sessão de tarefa inexistente ou fora do formato', async () => {
    const { repo } = setup();
    const task = await repo.createTask(emptyTaskInput({ title: 'a' }));
    await expectCode(repo.recordFocusSession(session(crypto.randomUUID())), 'not_found');
    await expectCode(repo.recordFocusSession(session(task.id, { durationSeconds: 10 })), 'validation');
  });

  it('excluir a tarefa definitivamente apaga as sessões dela', async () => {
    const { repo, remote, store } = setup();
    const task = await repo.createTask(emptyTaskInput({ title: 'a' }));
    await repo.recordFocusSession(session(task.id));
    await repo.trashTask(task.id);
    await repo.deleteTaskForever(task.id);
    expect(store.getState().focusSessions).toEqual([]);
    expect((await remote.fetchAll()).focusSessions).toEqual([]);
  });

  it('o backup leva as sessões; backups antigos, sem sessões, continuam válidos', async () => {
    const src = setup();
    const task = await src.repo.createTask(emptyTaskInput({ title: 'a' }));
    const s1 = session(task.id);
    const s2 = session(task.id, { kind: 'extra', durationSeconds: 600 });
    await src.repo.recordFocusSession(s1);
    await src.repo.recordFocusSession(s2);
    const backup = await src.repo.exportBackup();
    expect(backup.focusSessions).toHaveLength(2);

    const dst = setup();
    await dst.repo.restoreBackup(backup);
    expect(dst.store.getState().focusSessions.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());

    const legacy: Partial<BackupFile> = { ...backup };
    delete legacy.focusSessions;
    expect(parseBackupText(JSON.stringify(legacy), TODAY).ok).toBe(true);
    const orphan = { ...backup, focusSessions: [session(crypto.randomUUID())] };
    expect(parseBackupText(JSON.stringify(orphan), TODAY).ok).toBe(false);
  });
});

describe('fluxo integrado (persistência)', () => {
  it('criar lista e tarefa, etapas, planejar, focar, editar, concluir, abrir em outro aparelho, histórico, reabrir, excluir, restaurar e exportar/restaurar', async () => {
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

    // Outro aparelho entra na mesma conta.
    const other = setup(first.kv, first.clockRef);
    await other.repo.load();
    const history = other.local().filter((t) => t.status === 'completed' && t.completedOn === TODAY);
    expect(history.map((t) => t.title)).toEqual(['Ler capítulo 2']);
    expect(history[0]?.subtasks).toHaveLength(2);

    const reopenedTask = await other.repo.reopenTask(task.id);
    expect(reopenedTask.completedOn).toBeNull();
    await other.repo.trashTask(task.id);
    const restored = await other.repo.restoreTask(task.id);
    expect(restored.focusDate).toBeNull();
    expect(restored.priority).toBe('high');

    const backup = await other.repo.exportBackup();
    const parsed = parseBackupText(JSON.stringify(backup), TODAY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const fresh = setup();
    await fresh.repo.restoreBackup(parsed.backup);
    const final = fresh.local().find((t) => t.id === task.id);
    expect(final?.title).toBe('Ler capítulo 2');
    expect(final?.subtasks.map((s) => s.title)).toEqual(['Introdução', 'Exercícios']);
    expect(fresh.store.getState().lists).toHaveLength(1);
  });
});
