import { FolderOpen, Pencil, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { repo, toAppError } from '../../db';
import { sortTasks } from '../../domain/sort';
import { isPendingActive } from '../../domain/today';
import { ColorDot } from '../../features/lists/ColorDot';
import { QuickAddTask } from '../../features/tasks/QuickAddTask';
import { SortToggle, useSortMode } from '../../features/tasks/SortToggle';
import { TaskListView } from '../../features/tasks/TaskGroup';
import { useConfirm } from '../ConfirmContext';
import { useData } from '../DataContext';
import { useEditor } from '../EditorContext';
import { useFeedback } from '../feedback';
import { routes } from '../routes';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';
import { LIST_COLOR_LABELS } from '../../domain/types';

export function ListPage() {
  const { id = '' } = useParams();
  const { tasks, listsById } = useData();
  const list = listsById.get(id);
  usePageTitle(list ? list.name : 'Lista não encontrada');

  if (!list) {
    return (
      <div className={styles.page}>
        <EmptyState title="Esta lista não existe" tone="danger">
          <p>Ela pode ter sido excluída. Suas tarefas continuam na Entrada.</p>
          <p>
            <Link to={routes.inbox}>Ir para a Entrada</Link>
          </p>
        </EmptyState>
      </div>
    );
  }
  return <ListView key={list.id} listId={list.id} tasks={tasks} />;
}

function ListView({ listId, tasks }: { listId: string; tasks: ReturnType<typeof useData>['tasks'] }) {
  const { listsById } = useData();
  const list = listsById.get(listId)!;
  const { openListEditor } = useEditor();
  const confirm = useConfirm();
  const feedback = useFeedback();
  const navigate = useNavigate();
  const [mode, setMode] = useSortMode(`list-${listId}`);

  const pending = useMemo(
    () => sortTasks(tasks.filter((t) => isPendingActive(t) && t.listId === listId), mode),
    [tasks, listId, mode],
  );
  const totals = useMemo(() => {
    const all = tasks.filter((t) => t.listId === listId);
    return {
      all: all.length,
      pending: all.filter((t) => t.deletedAt === null && t.status === 'pending').length,
      completed: all.filter((t) => t.deletedAt === null && t.status === 'completed').length,
      trashed: all.filter((t) => t.deletedAt !== null).length,
    };
  }, [tasks, listId]);

  const onDelete = async () => {
    const detail =
      totals.all === 0
        ? 'A lista não tem tarefas.'
        : `${totals.all} ${totals.all === 1 ? 'tarefa será movida' : 'tarefas serão movidas'} para a Entrada (${totals.pending} pendentes, ${totals.completed} concluídas, ${totals.trashed} na Lixeira).`;
    const ok = await confirm({
      title: 'Excluir esta lista?',
      description: (
        <>
          A lista <strong>{list.name}</strong> será removida. {detail} As tarefas não são apagadas.
        </>
      ),
      confirmLabel: 'Excluir lista',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const result = await repo.deleteList(listId);
      feedback.success(
        result.movedTasks > 0
          ? `Lista excluída. ${result.movedTasks} ${result.movedTasks === 1 ? 'tarefa foi para a Entrada' : 'tarefas foram para a Entrada'}.`
          : 'Lista excluída.',
      );
      navigate(routes.inbox);
    } catch (error) {
      feedback.error(toAppError(error).message);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title={
          <>
            <ColorDot color={list.color} />
            <span>{list.name}</span>
          </>
        }
        subtitle={`Cor ${LIST_COLOR_LABELS[list.color].toLowerCase()} · ${pending.length} ${pending.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'}`}
        actions={
          <>
            <Button variant="secondary" icon={<Pencil size={16} />} onClick={(e) => openListEditor(list, e.currentTarget)}>
              Renomear ou mudar cor
            </Button>
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => void onDelete()}>
              Excluir lista
            </Button>
          </>
        }
      />
      <QuickAddTask target={{ listId, planToday: false, label: list.name }} />
      {pending.length > 0 ? (
        <>
          <SortToggle mode={mode} onChange={setMode} />
          <TaskListView tasks={pending} manual={mode === 'manual'} />
        </>
      ) : (
        <EmptyState title="Nenhuma tarefa pendente nesta lista" icon={<FolderOpen size={32} />}>
          <p>Capture uma tarefa acima ou mova tarefas da Entrada pelo menu delas.</p>
        </EmptyState>
      )}
    </div>
  );
}
