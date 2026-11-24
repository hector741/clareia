import { Pause, Play, Timer } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { Task } from '../../domain/types';
import taskStyles from '../tasks/TaskRow.module.css';
import { describeStats } from './model';
import { usePomodoro } from './PomodoroContext';
import styles from './Pomodoro.module.css';

/** Botão de temporizador da tarefa: inicia o foco, ou pausa/retoma a sessão desta tarefa. */
export function TimerButton({ task }: { task: Task }) {
  const pomodoro = usePomodoro();
  const active = pomodoro.state.active;
  const mine = active !== null && active.phase === 'focus' && active.taskId === task.id;
  const suspendedHere = !active && pomodoro.state.suspended?.taskId === task.id;

  if (mine && active.endsAt !== null) {
    return (
      <Button
        variant="ghost"
        iconOnly
        className={styles.rowTimerActive}
        aria-label={`Pausar foco: ${task.title}`}
        title="Pausar foco"
        icon={<Pause size={20} />}
        onClick={pomodoro.pause}
      />
    );
  }
  if (mine || suspendedHere) {
    return (
      <Button
        variant="ghost"
        iconOnly
        className={styles.rowTimerActive}
        aria-label={`Retomar foco: ${task.title}`}
        title="Retomar foco"
        icon={<Play size={20} />}
        onClick={() => (mine ? pomodoro.resume() : pomodoro.restoreSuspended())}
      />
    );
  }
  return (
    <Button
      variant="ghost"
      iconOnly
      aria-label={`Iniciar foco: ${task.title}`}
      title={`Iniciar foco (${pomodoro.prefs.focusMinutes} min)`}
      icon={<Timer size={20} />}
      onClick={() => pomodoro.startFocus({ id: task.id, title: task.title })}
    />
  );
}

/** Situação do Pomodoro na linha: sessão em andamento e contagem de sessões concluídas. */
export function FocusBadges({ task }: { task: Task }) {
  const pomodoro = usePomodoro();
  const active = pomodoro.state.active;
  const stats = pomodoro.statsFor(task.id);
  const mine = active !== null && active.phase === 'focus' && active.taskId === task.id;
  const hasStats = stats.pomodoros > 0 || stats.extras > 0;
  return (
    <>
      {mine ? (
        <li className={`${taskStyles.badge} ${styles.badgeTimer}`}>
          {active.endsAt === null ? <Pause size={14} aria-hidden="true" /> : <Timer size={14} aria-hidden="true" />}
          {active.endsAt === null ? 'Foco pausado' : 'Em sessão de foco'}
        </li>
      ) : null}
      {hasStats ? (
        <li className={taskStyles.badge}>
          <Timer size={14} aria-hidden="true" /> {describeStats(stats)}
        </li>
      ) : null}
    </>
  );
}
