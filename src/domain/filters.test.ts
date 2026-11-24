import { describe, expect, it } from 'vitest';
import { makeTask } from '../test/factories';
import { applyFilters, DEFAULT_FILTERS, hasActiveFilters, matchesQuery, normalizeText } from './filters';
import { sortAuto, sortManual } from './sort';

const TODAY = '2026-11-24';

describe('busca e filtros', () => {
  it('ignora maiúsculas e acentos', () => {
    expect(normalizeText('Reunião Ação')).toBe('reuniao acao');
    expect(matchesQuery(makeTask({ title: 'Reunião com o time' }), 'reuniao')).toBe(true);
    expect(matchesQuery(makeTask({ title: 'reuniao' }), 'REUNIÃO')).toBe(true);
  });

  it('busca em título, descrição e etapas', () => {
    const t = makeTask({
      title: 'Viagem',
      description: 'Comprar passagens',
      subtasks: [{ id: crypto.randomUUID(), title: 'Reservar hotel', completed: false, position: 1 }],
    });
    expect(matchesQuery(t, 'passagens')).toBe(true);
    expect(matchesQuery(t, 'hotel')).toBe(true);
    expect(matchesQuery(t, 'viagem hotel')).toBe(true);
    expect(matchesQuery(t, 'carro')).toBe(false);
  });

  it('combina filtros com AND e exclui a Lixeira', () => {
    const listId = crypto.randomUUID();
    const a = makeTask({ title: 'Relatório', listId, priority: 'high', dueDate: '2026-11-20' });
    const b = makeTask({ title: 'Relatório B', listId, priority: 'normal', dueDate: '2026-11-20' });
    const c = makeTask({ title: 'Relatório C', priority: 'high', dueDate: TODAY });
    const d = makeTask({ title: 'Relatório D', listId, priority: 'high', deletedAt: '2026-11-01T00:00:00.000Z' });
    const e = makeTask({
      title: 'Relatório E',
      listId,
      priority: 'high',
      dueDate: '2026-11-20',
      status: 'completed',
      completedAt: '2026-11-22T10:00:00.000Z',
      completedOn: '2026-11-22',
    });
    const all = [a, b, c, d, e];
    const f = { ...DEFAULT_FILTERS, query: 'relatorio', list: listId, priority: 'high' as const, due: 'overdue' as const };
    expect(applyFilters(all, f, TODAY).map((t) => t.id)).toEqual([a.id]);
    // "Vencidos" vale só para pendentes: a concluída não entra, mesmo com status "todas".
    expect(applyFilters(all, { ...f, status: 'all' }, TODAY).map((t) => t.id)).toEqual([a.id]);
    expect(applyFilters(all, { ...f, status: 'completed', due: 'all' }, TODAY).map((t) => t.id)).toEqual([e.id]);
    expect(applyFilters(all, { ...DEFAULT_FILTERS, due: 'today' }, TODAY).map((t) => t.id)).toEqual([c.id]);
    expect(applyFilters(all, { ...DEFAULT_FILTERS, list: 'inbox' }, TODAY).map((t) => t.id)).toEqual([c.id]);
    expect(applyFilters(all, { ...DEFAULT_FILTERS, due: 'none' }, TODAY)).toHaveLength(0);
  });

  it('detecta filtros ativos para exibir "Limpar filtros"', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, status: 'all' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, query: 'x' })).toBe(true);
  });
});

describe('ordenação', () => {
  it('ordena por prioridade, prazo, Fazer em, criação e id', () => {
    const normalLate = makeTask({ dueDate: '2026-12-01' });
    const high = makeTask({ priority: 'high' });
    const importantSoon = makeTask({ priority: 'important', dueDate: '2026-11-25' });
    const importantNoDue = makeTask({ priority: 'important', plannedDate: '2026-11-25' });
    const normalPlanned = makeTask({ dueDate: '2026-12-01', plannedDate: '2026-11-26' });
    const sorted = sortAuto([normalLate, importantNoDue, normalPlanned, high, importantSoon]);
    expect(sorted.map((t) => t.id)).toEqual([high.id, importantSoon.id, importantNoDue.id, normalPlanned.id, normalLate.id]);
  });

  it('usa createdAt e id como desempate', () => {
    const a = makeTask({ createdAt: '2026-11-01T10:00:00.000Z', id: 'b0000000-0000-4000-8000-000000000000' });
    const b = makeTask({ createdAt: '2026-11-01T10:00:00.000Z', id: 'a0000000-0000-4000-8000-000000000000' });
    const c = makeTask({ createdAt: '2026-10-31T10:00:00.000Z', id: 'c0000000-0000-4000-8000-000000000000' });
    expect(sortAuto([a, b, c]).map((t) => t.id)).toEqual([c.id, b.id, a.id]);
  });

  it('ordem manual usa position e não altera a ordem automática', () => {
    const first = makeTask({ position: 2, priority: 'high' });
    const second = makeTask({ position: 1 });
    expect(sortManual([first, second]).map((t) => t.id)).toEqual([second.id, first.id]);
    expect(sortAuto([first, second]).map((t) => t.id)).toEqual([first.id, second.id]);
    expect(first.position).toBe(2);
  });
});
