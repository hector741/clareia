import { CheckCheck } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { compareDates, formatGroupDate } from '../../domain/dates';
import type { DateString, Task } from '../../domain/types';
import { TaskGroup } from '../../features/tasks/TaskGroup';
import { useData } from '../DataContext';
import { useToday } from '../TodayContext';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

export function CompletedPage() {
  usePageTitle('Concluídas');
  const today = useToday();
  const { tasks } = useData();

  const groups = useMemo(() => {
    const byDay = new Map<DateString, Task[]>();
    for (const task of tasks) {
      if (task.deletedAt !== null || task.status !== 'completed' || task.completedOn === null) continue;
      const bucket = byDay.get(task.completedOn);
      if (bucket) bucket.push(task);
      else byDay.set(task.completedOn, [task]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => compareDates(b, a))
      .map(([date, list]) => ({
        date,
        tasks: list.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
      }));
  }, [tasks]);

  return (
    <div className={styles.page}>
      <PageHeader title="Concluídas" subtitle="Histórico por data de conclusão, da mais recente para a mais antiga." />
      {groups.length === 0 ? (
        <EmptyState title="Nenhuma tarefa concluída ainda" icon={<CheckCheck size={32} />}>
          <p>Quando você concluir tarefas, elas aparecem aqui e podem ser reabertas.</p>
        </EmptyState>
      ) : (
        groups.map((g) => (
          <TaskGroup key={g.date} title={capitalize(formatGroupDate(g.date, today))} tasks={g.tasks} />
        ))
      )}
    </div>
  );
}
