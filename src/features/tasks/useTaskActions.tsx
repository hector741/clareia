import { useMemo } from 'react';
import { useConfirm } from '../../app/ConfirmContext';
import { useFeedback } from '../../app/feedback';
import { repo, toAppError } from '../../db';
import { openSubtaskCount } from '../../domain/taskInput';
import type { MoveDirection } from '../../db';
import type { Task, TaskList } from '../../domain/types';

/** Ações sobre tarefas com confirmação, mensagens anunciáveis e tratamento de erro. */
export function useTaskActions() {
  const feedback = useFeedback();
  const confirm = useConfirm();

  return useMemo(() => {
    async function attempt(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
      try {
        await fn();
        if (success) feedback.success(success);
        return true;
      } catch (error) {
        feedback.error(toAppError(error).message);
        return false;
      }
    }

    return {
      async complete(task: Task) {
        const open = openSubtaskCount(task);
        if (open > 0) {
          const ok = await confirm({
            title: 'Concluir com etapas abertas?',
            description: (
              <>
                <strong>{task.title}</strong> ainda tem {open} {open === 1 ? 'etapa aberta' : 'etapas abertas'}. As
                etapas não serão marcadas como feitas; elas continuam como estão.
              </>
            ),
            confirmLabel: 'Concluir tarefa',
          });
          if (!ok) return false;
        }
        return attempt(() => repo.completeTask(task.id), 'Tarefa concluída.');
      },

      reopen(task: Task) {
        return attempt(() => repo.reopenTask(task.id), 'Tarefa reaberta.');
      },

      focus(task: Task) {
        return attempt(() => repo.focusTask(task.id), 'Tarefa em foco hoje.');
      },

      unfocus(task: Task) {
        return attempt(() => repo.unfocusTask(task.id), 'Tarefa fora do foco.');
      },

      move(task: Task, list: TaskList | null) {
        return attempt(
          () => repo.moveTask(task.id, list?.id ?? null),
          list ? `Tarefa movida para ${list.name}.` : 'Tarefa movida para a Entrada.',
        );
      },

      reorder(task: Task, direction: MoveDirection) {
        return attempt(() => repo.reorderTask(task.id, direction));
      },

      async trash(task: Task) {
        try {
          await repo.trashTask(task.id);
          feedback.success('Tarefa movida para a Lixeira.', {
            actionLabel: 'Desfazer',
            onAction: () => {
              void attempt(() => repo.restoreTask(task.id), 'Tarefa restaurada.');
            },
          });
          return true;
        } catch (error) {
          feedback.error(toAppError(error).message);
          return false;
        }
      },

      restore(task: Task) {
        return attempt(() => repo.restoreTask(task.id), 'Tarefa restaurada.');
      },

      async deleteForever(task: Task) {
        const ok = await confirm({
          title: 'Excluir definitivamente?',
          description: (
            <>
              A tarefa <strong>{task.title}</strong> será apagada para sempre, com a descrição e as etapas. Esta ação
              não pode ser desfeita.
            </>
          ),
          confirmLabel: 'Excluir definitivamente',
          tone: 'danger',
        });
        if (!ok) return false;
        return attempt(() => repo.deleteTaskForever(task.id), 'Tarefa excluída definitivamente.');
      },
    };
  }, [feedback, confirm]);
}
