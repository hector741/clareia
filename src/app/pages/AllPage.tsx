import { ListTodo } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { sortAuto } from '../../domain/sort';
import { isPendingActive } from '../../domain/today';
import { QuickAddTask } from '../../features/tasks/QuickAddTask';
import { TaskListView } from '../../features/tasks/TaskGroup';
import { useData } from '../DataContext';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';

export function AllPage() {
  usePageTitle('Todas');
  const { tasks } = useData();
  const pending = useMemo(() => sortAuto(tasks.filter(isPendingActive)), [tasks]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Todas"
        subtitle={`${pending.length} ${pending.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'}, com ou sem data.`}
      />
      <QuickAddTask target={{ listId: null, planToday: false, label: 'Entrada' }} />
      {pending.length === 0 ? (
        <EmptyState title="Nenhuma tarefa pendente" icon={<ListTodo size={32} />}>
          <p>Quando você criar tarefas, todas as pendentes aparecem aqui.</p>
        </EmptyState>
      ) : (
        <TaskListView tasks={pending} showList />
      )}
    </div>
  );
}
