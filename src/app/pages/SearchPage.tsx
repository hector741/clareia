import { SearchX, Search as SearchIcon, X } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import {
  applyFilters,
  DEFAULT_FILTERS,
  hasActiveFilters,
  type DueFilter,
  type PriorityFilter,
  type StatusFilter,
  type TaskFilters,
} from '../../domain/filters';
import { PRIORITIES, PRIORITY_LABELS } from '../../domain/types';
import { TaskListView } from '../../features/tasks/TaskGroup';
import { useData } from '../DataContext';
import { useToday } from '../TodayContext';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';
import searchStyles from './SearchPage.module.css';

const STATUS_LABELS: Record<StatusFilter, string> = {
  pending: 'Pendentes',
  completed: 'Concluídas',
  all: 'Pendentes e concluídas',
};
const DUE_LABELS: Record<DueFilter, string> = {
  all: 'Todos',
  today: 'Vencem hoje',
  overdue: 'Vencidos',
  none: 'Sem prazo',
};

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function SearchPage() {
  usePageTitle('Busca');
  const today = useToday();
  const { tasks, lists, listsById } = useData();
  const [params, setParams] = useSearchParams();

  const rawList = params.get('lista') ?? 'all';
  const filters: TaskFilters = {
    query: params.get('q') ?? '',
    list: rawList === 'all' || rawList === 'inbox' || listsById.has(rawList) ? rawList : 'all',
    priority: oneOf<PriorityFilter>(params.get('prioridade'), ['all', ...PRIORITIES], 'all'),
    status: oneOf<StatusFilter>(params.get('situacao'), ['pending', 'completed', 'all'], 'pending'),
    due: oneOf<DueFilter>(params.get('prazo'), ['all', 'today', 'overdue', 'none'], 'all'),
  };

  const update = (patch: Partial<TaskFilters>) => {
    const next = { ...filters, ...patch };
    const out = new URLSearchParams();
    if (next.query) out.set('q', next.query);
    if (next.list !== DEFAULT_FILTERS.list) out.set('lista', next.list);
    if (next.priority !== DEFAULT_FILTERS.priority) out.set('prioridade', next.priority);
    if (next.status !== DEFAULT_FILTERS.status) out.set('situacao', next.status);
    if (next.due !== DEFAULT_FILTERS.due) out.set('prazo', next.due);
    setParams(out, { replace: true });
  };

  const results = useMemo(() => applyFilters(tasks, filters, today), [tasks, filters.query, filters.list, filters.priority, filters.status, filters.due, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const anyTask = tasks.some((t) => t.deletedAt === null);
  const active = hasActiveFilters(filters);

  const chips: { key: string; label: string }[] = [];
  if (filters.query.trim()) chips.push({ key: 'q', label: `Texto: “${filters.query.trim()}”` });
  if (filters.list !== 'all') {
    chips.push({
      key: 'lista',
      label: `Lista: ${filters.list === 'inbox' ? 'Entrada' : (listsById.get(filters.list)?.name ?? '')}`,
    });
  }
  if (filters.priority !== 'all') chips.push({ key: 'prioridade', label: `Prioridade: ${PRIORITY_LABELS[filters.priority]}` });
  if (filters.status !== 'pending') chips.push({ key: 'situacao', label: `Situação: ${STATUS_LABELS[filters.status]}` });
  if (filters.due !== 'all') chips.push({ key: 'prazo', label: `Prazo: ${DUE_LABELS[filters.due]}` });

  return (
    <div className={styles.page}>
      <PageHeader title="Busca" subtitle="Procure em títulos, descrições e etapas. A Lixeira não entra na busca." />

      <form role="search" className={searchStyles.filters} onSubmit={(e) => e.preventDefault()}>
        <div className={searchStyles.queryRow}>
          <Field label="Buscar tarefas">
            <input
              type="search"
              className="control"
              value={filters.query}
              placeholder="Ex.: reuniao"
              autoComplete="off"
              onChange={(e) => update({ query: e.target.value })}
            />
          </Field>
        </div>
        <div className={searchStyles.selects}>
          <Field label="Lista">
            <select className="control" value={filters.list} onChange={(e) => update({ list: e.target.value })}>
              <option value="all">Todas as listas</option>
              <option value="inbox">Entrada (sem lista)</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridade">
            <select
              className="control"
              value={filters.priority}
              onChange={(e) => update({ priority: e.target.value as PriorityFilter })}
            >
              <option value="all">Todas</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Situação">
            <select
              className="control"
              value={filters.status}
              onChange={(e) => update({ status: e.target.value as StatusFilter })}
            >
              {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prazo">
            <select className="control" value={filters.due} onChange={(e) => update({ due: e.target.value as DueFilter })}>
              {(Object.keys(DUE_LABELS) as DueFilter[]).map((d) => (
                <option key={d} value={d}>
                  {DUE_LABELS[d]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </form>

      <div className={searchStyles.summary}>
        {chips.length > 0 ? (
          <ul className={searchStyles.chips} aria-label="Filtros selecionados">
            {chips.map((c) => (
              <li key={c.key} className={searchStyles.chip}>
                {c.label}
              </li>
            ))}
          </ul>
        ) : null}
        {active ? (
          <Button variant="secondary" icon={<X size={16} />} onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Limpar filtros
          </Button>
        ) : null}
        <p role="status" className={styles.tip}>
          {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
        </p>
      </div>

      {results.length > 0 ? (
        <TaskListView tasks={results} showList />
      ) : !anyTask ? (
        <EmptyState title="Ainda não há tarefas" icon={<SearchIcon size={32} />}>
          <p>Crie sua primeira tarefa em Hoje ou na Entrada; depois você poderá encontrá-la aqui.</p>
        </EmptyState>
      ) : (
        <EmptyState
          title="Nenhuma tarefa corresponde aos filtros"
          icon={<SearchX size={32} />}
          action={
            active ? (
              <Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Limpar filtros
              </Button>
            ) : undefined
          }
        >
          <p>Tente outras palavras ou mude a situação para incluir tarefas concluídas.</p>
        </EmptyState>
      )}
    </div>
  );
}
