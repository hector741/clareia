import { CalendarDays } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatGroupDate } from '../../domain/dates';
import { groupUpcoming } from '../../domain/today';
import { QuickAddTask } from '../../features/tasks/QuickAddTask';
import { TaskGroup } from '../../features/tasks/TaskGroup';
import { useData } from '../DataContext';
import { useToday } from '../TodayContext';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

export function UpcomingPage() {
  usePageTitle('Próximas');
  const today = useToday();
  const { tasks } = useData();
  const groups = useMemo(() => groupUpcoming(tasks, today), [tasks, today]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Próximas"
        subtitle="Tarefas com Fazer em ou Prazo no futuro, agrupadas pela data mais próxima."
      />
      <QuickAddTask target={{ listId: null, planToday: false, label: 'Entrada' }} />
      {groups.length === 0 ? (
        <EmptyState title="Nada agendado para os próximos dias" icon={<CalendarDays size={32} />}>
          <p>Tarefas com Fazer em ou Prazo depois de hoje aparecem aqui, uma vez cada.</p>
        </EmptyState>
      ) : (
        groups.map((group) => (
          <TaskGroup key={group.date} title={capitalize(formatGroupDate(group.date, today))} tasks={group.tasks} />
        ))
      )}
    </div>
  );
}
