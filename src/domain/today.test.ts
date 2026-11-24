import { describe, expect, it } from 'vitest';
import { makeTask } from '../test/factories';
import { addDays } from './dates';
import { classifyToday, countCompletedOn, groupUpcoming, needsReplan, isOverdue, plannedAfterDue } from './today';

const TODAY = '2026-11-24';

function ids(tasks: { id: string }[]) {
  return tasks.map((t) => t.id);
}

describe('classifyToday', () => {
  it('distribui cada tarefa em um único grupo, com a precedência definida', () => {
    const focusOverdue = makeTask({ focusDate: TODAY, plannedDate: TODAY, dueDate: '2026-11-20' });
    const overdue = makeTask({ dueDate: '2026-11-23', plannedDate: TODAY });
    const dueToday = makeTask({ dueDate: TODAY });
    const plannedToday = makeTask({ plannedDate: TODAY, dueDate: '2026-12-10' });
    const replan = makeTask({ plannedDate: '2026-11-22', dueDate: '2026-12-10' });
    const replanNoDue = makeTask({ plannedDate: '2026-11-01' });
    const plannedTodayOverdueNo = makeTask({ plannedDate: '2026-11-20', dueDate: TODAY });
    const future = makeTask({ plannedDate: '2026-11-25' });
    const none = makeTask();

    const g = classifyToday(
      [focusOverdue, overdue, dueToday, plannedToday, replan, replanNoDue, plannedTodayOverdueNo, future, none],
      TODAY,
    );
    expect(ids(g.focus)).toEqual([focusOverdue.id]);
    expect(ids(g.overdue)).toEqual([overdue.id]);
    expect(new Set(ids(g.forToday))).toEqual(new Set([dueToday.id, plannedToday.id, plannedTodayOverdueNo.id]));
    expect(ids(g.replan)).toEqual([replanNoDue.id, replan.id]);

    const all = [...g.focus, ...g.overdue, ...g.forToday, ...g.replan];
    expect(new Set(ids(all)).size).toBe(all.length);
  });

  it('ignora concluídas e excluídas e foco de outros dias', () => {
    const done = makeTask({ status: 'completed', completedAt: '2026-11-24T10:00:00.000Z', completedOn: TODAY, plannedDate: TODAY });
    const trashed = makeTask({ deletedAt: '2026-11-24T10:00:00.000Z', plannedDate: TODAY });
    const staleFocus = makeTask({ focusDate: '2026-11-23' });
    const g = classifyToday([done, trashed, staleFocus], TODAY);
    expect([...g.focus, ...g.overdue, ...g.forToday, ...g.replan]).toHaveLength(0);
  });

  it('distingue replanejamento de prazo vencido', () => {
    const t = makeTask({ plannedDate: '2026-11-20', dueDate: '2026-12-05' });
    expect(needsReplan(t, TODAY)).toBe(true);
    expect(isOverdue(t, TODAY)).toBe(false);
    const g = classifyToday([t], TODAY);
    expect(ids(g.replan)).toEqual([t.id]);
    expect(g.overdue).toHaveLength(0);
  });

  it('funciona na virada de mês e de ano', () => {
    const t = makeTask({ plannedDate: '2026-12-31', dueDate: '2026-12-31' });
    expect(classifyToday([t], '2027-01-01').overdue).toHaveLength(1);
    expect(classifyToday([t], '2026-12-31').forToday).toHaveLength(1);
    const u = makeTask({ plannedDate: '2026-11-30' });
    expect(classifyToday([u], '2026-12-01').replan).toHaveLength(1);
    expect(classifyToday([u], '2026-11-30').forToday).toHaveLength(1);
  });

  it('mantém Fazer em e Prazo independentes ao classificar', () => {
    const t = makeTask({ plannedDate: TODAY, dueDate: '2026-12-01' });
    classifyToday([t], TODAY);
    expect(t.dueDate).toBe('2026-12-01');
  });

  it('sinaliza Fazer em posterior ao Prazo', () => {
    expect(plannedAfterDue({ plannedDate: '2026-12-10', dueDate: '2026-12-01' })).toBe(true);
    expect(plannedAfterDue({ plannedDate: '2026-12-01', dueDate: '2026-12-01' })).toBe(false);
    expect(plannedAfterDue({ plannedDate: null, dueDate: '2026-12-01' })).toBe(false);
  });
});

describe('countCompletedOn', () => {
  it('conta tarefas concluídas hoje, ignorando excluídas e outros dias', () => {
    const done = (completedOn: string, extra = {}) =>
      makeTask({ status: 'completed', completedAt: '2026-11-24T12:00:00.000Z', completedOn, ...extra });
    const tasks = [
      done(TODAY),
      done(TODAY, { subtasks: [{ id: crypto.randomUUID(), title: 'a', completed: true, position: 1 }] }),
      done('2026-11-23'),
      done(TODAY, { deletedAt: '2026-11-24T13:00:00.000Z' }),
      makeTask(),
    ];
    expect(countCompletedOn(tasks, TODAY)).toBe(2);
  });
});

describe('groupUpcoming', () => {
  it('mostra cada tarefa uma vez, pela menor data futura, e mantém ambas as datas', () => {
    const both = makeTask({ plannedDate: '2026-12-10', dueDate: '2026-11-30' });
    const onlyDue = makeTask({ dueDate: '2026-11-30' });
    const pastPlannedFutureDue = makeTask({ plannedDate: '2026-11-20', dueDate: '2026-12-02' });
    const todayOnly = makeTask({ plannedDate: TODAY });
    const groups = groupUpcoming([both, onlyDue, pastPlannedFutureDue, todayOnly], TODAY);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-30', '2026-12-02']);
    expect(ids(groups[0]!.tasks)).toEqual(expect.arrayContaining([both.id, onlyDue.id]));
    expect(ids(groups[1]!.tasks)).toEqual([pastPlannedFutureDue.id]);
    const all = groups.flatMap((g) => ids(g.tasks));
    expect(new Set(all).size).toBe(all.length);
    expect(both.plannedDate).toBe('2026-12-10');
  });

  it('todas as datas futuras ficam alcançáveis (a data posterior aparece na tarefa)', () => {
    const t = makeTask({ plannedDate: addDays(TODAY, 3), dueDate: addDays(TODAY, 9) });
    const groups = groupUpcoming([t], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.tasks[0]!.dueDate).toBe(addDays(TODAY, 9));
  });
});
