import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { TrashRow } from '../../features/tasks/TrashRow';
import { useData } from '../DataContext';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';
import taskGroupStyles from '../../features/tasks/TaskGroup.module.css';

export function TrashPage() {
  usePageTitle('Lixeira');
  const { tasks } = useData();
  const trashed = useMemo(
    () => tasks.filter((t) => t.deletedAt !== null).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [tasks],
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Lixeira"
        subtitle="Tarefas excluídas ficam aqui até você restaurá-las ou excluí-las definitivamente. Nada é apagado automaticamente."
      />
      {trashed.length === 0 ? (
        <EmptyState title="A Lixeira está vazia" icon={<Trash2 size={32} />}>
          <p>Tarefas que você mover para a Lixeira aparecem aqui.</p>
        </EmptyState>
      ) : (
        <ul className={taskGroupStyles.list}>
          {trashed.map((task) => (
            <TrashRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </div>
  );
}
