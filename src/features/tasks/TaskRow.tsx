import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarDays,
  Check,
  FolderInput,
  ListChecks,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
  Flag,
  ChevronRight,
} from 'lucide-react';
import { memo, useRef } from 'react';
import { useData } from '../../app/DataContext';
import { useEditor } from '../../app/EditorContext';
import { useToday } from '../../app/TodayContext';
import { Button } from '../../components/ui/Button';
import { formatRelativeDate } from '../../domain/dates';
import { isFocusedOn, isOverdue, needsReplan } from '../../domain/today';
import { PRIORITY_LABELS, type Task } from '../../domain/types';
import { ColorDot } from '../lists/ColorDot';
import { FocusBadges, TimerButton } from '../pomodoro/TaskTimer';
import { useTaskActions } from './useTaskActions';
import styles from './TaskRow.module.css';

export interface ManualOrder {
  index: number;
  count: number;
}

interface TaskRowProps {
  task: Task;
  /** Mostra a lista da tarefa (visões agregadas). */
  showList?: boolean;
  /** Presente apenas quando a ordem manual está disponível nesta visão. */
  manual?: ManualOrder;
}

export const TaskRow = memo(function TaskRow({ task, showList = false, manual }: TaskRowProps) {
  const today = useToday();
  const { lists, listsById } = useData();
  const { openEditTask } = useEditor();
  const actions = useTaskActions();
  const openRef = useRef<HTMLButtonElement>(null);

  const completed = task.status === 'completed';
  const focused = isFocusedOn(task, today);
  const overdue = isOverdue(task, today);
  const replan = needsReplan(task, today);
  const list = task.listId ? listsById.get(task.listId) : undefined;
  const openSteps = task.subtasks.filter((s) => !s.completed).length;
  const doneSteps = task.subtasks.length - openSteps;

  const onToggle = () => {
    if (completed) void actions.reopen(task);
    else void actions.complete(task);
  };

  return (
    <li className={`${styles.row} ${focused ? styles.focused : ''} ${completed ? styles.completed : ''}`}>
      <label className={styles.check}>
        <input
          type="checkbox"
          className={styles.checkInput}
          checked={completed}
          onChange={onToggle}
          aria-label={completed ? `Reabrir tarefa: ${task.title}` : `Concluir tarefa: ${task.title}`}
        />
        <span className={styles.box} aria-hidden="true" />
      </label>

      <div className={styles.content}>
        <button
          ref={openRef}
          type="button"
          className={styles.titleButton}
          onClick={() => openEditTask(task, openRef.current)}
          aria-label={`Abrir tarefa: ${task.title}`}
        >
          {task.title}
        </button>
        <ul className={styles.meta} aria-label="Detalhes da tarefa">
          {focused ? (
            <li className={`${styles.badge} ${styles.badgeFocus}`}>
              <Star size={14} aria-hidden="true" /> Em foco
            </li>
          ) : null}
          {task.priority !== 'normal' && !completed ? (
            <li className={`${styles.badge} ${task.priority === 'high' ? styles.badgeWarn : styles.badgeNeutral}`}>
              <Flag size={14} aria-hidden="true" /> Prioridade {PRIORITY_LABELS[task.priority].toLowerCase()}
            </li>
          ) : null}
          {showList && list ? (
            <li className={styles.badge}>
              <ColorDot color={list.color} /> {list.name}
            </li>
          ) : null}
          {task.plannedDate ? (
            <li className={`${styles.badge} ${replan ? styles.badgeWarn : ''}`}>
              <CalendarClock size={14} aria-hidden="true" />
              {replan
                ? `Fazer em: ${formatRelativeDate(task.plannedDate, today)} · Replanejar`
                : `Fazer em: ${formatRelativeDate(task.plannedDate, today)}`}
            </li>
          ) : null}
          {task.dueDate ? (
            <li className={`${styles.badge} ${overdue ? styles.badgeDanger : ''}`}>
              <CalendarDays size={14} aria-hidden="true" />
              {overdue
                ? `Prazo vencido: ${formatRelativeDate(task.dueDate, today)}`
                : `Prazo: ${formatRelativeDate(task.dueDate, today)}`}
            </li>
          ) : null}
          {task.subtasks.length > 0 ? (
            <li className={styles.badge}>
              <ListChecks size={14} aria-hidden="true" /> {doneSteps} de {task.subtasks.length}{' '}
              {task.subtasks.length === 1 ? 'etapa' : 'etapas'}
            </li>
          ) : null}
          <FocusBadges task={task} />
          {completed && task.completedOn ? (
            <li className={styles.badge}>
              <Check size={14} aria-hidden="true" /> Concluída {formatRelativeDate(task.completedOn, today)}
            </li>
          ) : null}
        </ul>
      </div>

      {completed ? (
        <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => void actions.reopen(task)}>
          Reabrir
        </Button>
      ) : (
        <TimerButton task={task} />
      )}

      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" iconOnly aria-label={`Ações para a tarefa: ${task.title}`} icon={<MoreHorizontal size={20} />} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4} collisionPadding={8}>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => openEditTask(task, openRef.current)}>
              <Pencil size={18} aria-hidden="true" /> Editar
            </DropdownMenu.Item>
            {!completed ? (
              focused ? (
                <DropdownMenu.Item className={styles.menuItem} onSelect={() => void actions.unfocus(task)}>
                  <StarOff size={18} aria-hidden="true" /> Retirar do foco
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item className={styles.menuItem} onSelect={() => void actions.focus(task)}>
                  <Star size={18} aria-hidden="true" /> Focar hoje
                </DropdownMenu.Item>
              )
            ) : null}
            <DropdownMenu.Item className={styles.menuItem} onSelect={onToggle}>
              {completed ? <RotateCcw size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
              {completed ? 'Reabrir' : 'Concluir'}
            </DropdownMenu.Item>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={styles.menuItem}>
                <FolderInput size={18} aria-hidden="true" /> Mover para
                <ChevronRight size={16} aria-hidden="true" className={styles.chevron} />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={styles.menu} sideOffset={4} collisionPadding={8}>
                  <DropdownMenu.Item
                    className={styles.menuItem}
                    disabled={task.listId === null}
                    onSelect={() => void actions.move(task, null)}
                  >
                    Entrada {task.listId === null ? '(atual)' : ''}
                  </DropdownMenu.Item>
                  {lists.map((l) => (
                    <DropdownMenu.Item
                      key={l.id}
                      className={styles.menuItem}
                      disabled={task.listId === l.id}
                      onSelect={() => void actions.move(task, l)}
                    >
                      <ColorDot color={l.color} /> {l.name} {task.listId === l.id ? '(atual)' : ''}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            {manual ? (
              <>
                <DropdownMenu.Item
                  className={styles.menuItem}
                  disabled={manual.index === 0}
                  onSelect={() => void actions.reorder(task, 'up')}
                >
                  <ArrowUp size={18} aria-hidden="true" /> Mover para cima
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={styles.menuItem}
                  disabled={manual.index === manual.count - 1}
                  onSelect={() => void actions.reorder(task, 'down')}
                >
                  <ArrowDown size={18} aria-hidden="true" /> Mover para baixo
                </DropdownMenu.Item>
              </>
            ) : null}
            <DropdownMenu.Separator className={styles.separator} />
            <DropdownMenu.Item
              className={`${styles.menuItem} ${styles.menuDanger}`}
              onSelect={() => void actions.trash(task)}
            >
              <Trash2 size={18} aria-hidden="true" /> Mover para a Lixeira
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  );
});
