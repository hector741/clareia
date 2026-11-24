import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListEditorDialog, type ListEditorRequest } from '../features/lists/ListEditorDialog';
import { TaskEditorDialog, type EditorRequest } from '../features/tasks/TaskEditorDialog';
import type { TaskInput } from '../domain/schemas';
import { emptyTaskInput, taskToInput } from '../domain/taskInput';
import type { Task, TaskList } from '../domain/types';
import { routes } from './routes';

export interface NewTaskOptions {
  /** Valores iniciais (lista, Fazer em...). */
  defaults?: Partial<TaskInput>;
  /** Título já digitado na captura rápida. */
  title?: string;
  origin?: HTMLElement | null;
}

interface EditorApi {
  openNewTask: (options?: NewTaskOptions) => void;
  openEditTask: (task: Task, origin?: HTMLElement | null) => void;
  openListEditor: (list?: TaskList, origin?: HTMLElement | null) => void;
}

const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error('useEditor fora do EditorProvider');
  return api;
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [taskRequest, setTaskRequest] = useState<EditorRequest | null>(null);
  const [listRequest, setListRequest] = useState<ListEditorRequest | null>(null);
  const counter = useRef(0);
  const navigate = useNavigate();

  const openNewTask = useCallback((options: NewTaskOptions = {}) => {
    const base = emptyTaskInput(options.defaults);
    setTaskRequest({
      key: ++counter.current,
      mode: 'new',
      baseline: base,
      initial: { ...base, title: options.title ?? '' },
      origin: options.origin ?? (document.activeElement as HTMLElement | null),
    });
  }, []);

  const openEditTask = useCallback((task: Task, origin?: HTMLElement | null) => {
    const input = taskToInput(task);
    setTaskRequest({
      key: ++counter.current,
      mode: 'edit',
      taskId: task.id,
      baseline: input,
      initial: input,
      origin: origin ?? (document.activeElement as HTMLElement | null),
    });
  }, []);

  const openListEditor = useCallback((list?: TaskList, origin?: HTMLElement | null) => {
    setListRequest({
      key: ++counter.current,
      ...(list ? { list } : {}),
      origin: origin ?? (document.activeElement as HTMLElement | null),
    });
  }, []);

  const api = useMemo<EditorApi>(
    () => ({ openNewTask, openEditTask, openListEditor }),
    [openNewTask, openEditTask, openListEditor],
  );

  return (
    <EditorContext.Provider value={api}>
      {children}
      {taskRequest ? (
        <TaskEditorDialog key={taskRequest.key} request={taskRequest} onClose={() => setTaskRequest(null)} />
      ) : null}
      {listRequest ? (
        <ListEditorDialog
          key={listRequest.key}
          request={listRequest}
          onClose={() => setListRequest(null)}
          onSaved={(list, created) => {
            if (created) navigate(routes.list(list.id));
          }}
        />
      ) : null}
    </EditorContext.Provider>
  );
}
