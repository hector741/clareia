import { RotateCcw, Trash2 } from 'lucide-react';
import { useData } from '../../app/DataContext';
import { Button } from '../../components/ui/Button';
import { formatInstant } from '../../domain/dates';
import type { Task } from '../../domain/types';
import { ColorDot } from '../lists/ColorDot';
import { useTaskActions } from './useTaskActions';
import styles from './TrashRow.module.css';

export function TrashRow({ task }: { task: Task }) {
  const actions = useTaskActions();
  const { listsById } = useData();
  const list = task.listId ? listsById.get(task.listId) : undefined;
  return (
    <li className={styles.row}>
      <div className={styles.info}>
        <p className={styles.title}>{task.title}</p>
        <p className={styles.meta}>
          Excluída em {task.deletedAt ? formatInstant(task.deletedAt) : '—'}
          {list ? (
            <>
              {' · '}
              <ColorDot color={list.color} /> {list.name}
            </>
          ) : null}
          {task.status === 'completed' ? ' · estava concluída' : ''}
        </p>
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" icon={<RotateCcw size={16} />} aria-label={`Restaurar tarefa: ${task.title}`} onClick={() => void actions.restore(task)}>
          Restaurar
        </Button>
        <Button variant="danger" icon={<Trash2 size={16} />} aria-label={`Excluir definitivamente a tarefa: ${task.title}`} onClick={() => void actions.deleteForever(task)}>
          Excluir definitivamente
        </Button>
      </div>
    </li>
  );
}
