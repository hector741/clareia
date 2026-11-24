import { Inbox } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { sortTasks } from '../../domain/sort';
import { isPendingActive } from '../../domain/today';
import { QuickAddTask } from '../../features/tasks/QuickAddTask';
import { SortToggle, useSortMode } from '../../features/tasks/SortToggle';
import { TaskListView } from '../../features/tasks/TaskGroup';
import { useData } from '../DataContext';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';

export function InboxPage() {
  usePageTitle('Entrada');
  const { tasks } = useData();
  const [mode, setMode] = useSortMode('inbox');
  const inbox = useMemo(
    () => sortTasks(tasks.filter((t) => isPendingActive(t) && t.listId === null), mode),
    [tasks, mode],
  );

  return (
    <div className={styles.page}>
      <PageHeader title="Entrada" subtitle="Tarefas pendentes que ainda não estão em uma lista." />
      <QuickAddTask target={{ listId: null, planToday: false, label: 'Entrada' }} />
      {inbox.length > 0 ? (
        <>
          <SortToggle mode={mode} onChange={setMode} />
          <TaskListView tasks={inbox} manual={mode === 'manual'} />
        </>
      ) : (
        <EmptyState title="Entrada vazia" icon={<Inbox size={32} />}>
          <p>Tudo que você captura sem escolher uma lista aparece aqui. Organize quando tiver tempo.</p>
        </EmptyState>
      )}
    </div>
  );
}
