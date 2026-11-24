import { useId, type ReactNode } from 'react';
import type { Task } from '../../domain/types';
import { TaskRow } from './TaskRow';
import styles from './TaskGroup.module.css';

interface TaskListViewProps {
  tasks: readonly Task[];
  showList?: boolean;
  /** Ordem manual disponível (Entrada/lista, sem filtros). */
  manual?: boolean;
}

export function TaskListView({ tasks, showList = false, manual = false }: TaskListViewProps) {
  return (
    <ul className={styles.list}>
      {tasks.map((task, index) => (
        <TaskRow
          key={task.id}
          task={task}
          showList={showList}
          {...(manual ? { manual: { index, count: tasks.length } } : {})}
        />
      ))}
    </ul>
  );
}

interface TaskGroupProps {
  title: string;
  tasks: readonly Task[];
  tone?: 'default' | 'focus' | 'danger' | 'warning';
  description?: ReactNode;
  showList?: boolean;
}

export function TaskGroup({ title, tasks, tone = 'default', description, showList = true }: TaskGroupProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.group}>
      <div className={styles.header}>
        <h2 id={headingId} className={`${styles.title} ${styles[tone]}`}>
          {title}
        </h2>
        <span className={styles.count} aria-label={`${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'}`}>
          {tasks.length}
        </span>
      </div>
      {description ? <p className={styles.description}>{description}</p> : null}
      <TaskListView tasks={tasks} showList={showList} />
    </section>
  );
}
