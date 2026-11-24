import { Coffee, Pause, Play, Square, Timer, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useConfirm } from '../../app/ConfirmContext';
import { useData } from '../../app/DataContext';
import { useEditor } from '../../app/EditorContext';
import { Button } from '../../components/ui/Button';
import { PHASE_LABELS, describeDuration, describeStats, formatClock, progress, remainingMs, type TimerSession } from './model';
import { usePomodoro } from './PomodoroContext';
import styles from './Pomodoro.module.css';

/** Relógio da tela: só re-renderiza o painel, e só enquanto o temporizador corre. */
function useNow(session: TimerSession | null): number {
  const [now, setNow] = useState(() => Date.now());
  const running = session !== null && session.endsAt !== null;
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running, session?.id, session?.endsAt]);
  return now;
}

function ButtonLabel({ children }: { children: string }) {
  return <span className={styles.buttonLabel}>{children}</span>;
}

/** Painel compacto do temporizador, visível em todas as telas enquanto há uma sessão. */
export function PomodoroPanel() {
  const pomodoro = usePomodoro();
  const { state } = pomodoro;
  const confirm = useConfirm();
  const { openEditTask } = useEditor();
  const { tasks } = useData();
  const labelId = useId();
  const session = state.active;
  const now = useNow(session ?? state.suspended);

  if (!session) {
    const suspended = state.suspended;
    if (!suspended) return null;
    return (
      <section className={styles.panel} data-phase="focus" data-paused="true" aria-labelledby={labelId}>
        <div className={styles.info}>
          <p className={styles.phase} id={labelId}>
            <Pause size={16} aria-hidden="true" /> Foco pausado
          </p>
          <p className={styles.taskStatic}>{suspended.taskTitle}</p>
          <p className={styles.count}>Faltam {formatClock(suspended.remainingMs)}</p>
        </div>
        <div className={styles.controls}>
          <Button variant="primary" icon={<Play size={18} />} onClick={pomodoro.restoreSuspended}>
            <ButtonLabel>Retomar</ButtonLabel>
          </Button>
          <Button variant="ghost" icon={<X size={18} />} onClick={pomodoro.discardSuspended}>
            <ButtonLabel>Descartar</ButtonLabel>
          </Button>
        </div>
      </section>
    );
  }

  const paused = session.endsAt === null;
  const focus = session.phase === 'focus';
  const remaining = remainingMs(session, now);
  const pct = Math.round(progress(session, now) * 100);
  const task = tasks.find((t) => t.id === session.taskId);
  const stats = pomodoro.statsFor(session.taskId);
  const phaseLabel = focus ? (session.kind === 'extra' ? 'Foco extra' : PHASE_LABELS.focus) : PHASE_LABELS[session.phase];
  const PhaseIcon = paused ? Pause : focus ? Timer : Coffee;

  const onStop = async () => {
    if (focus) {
      const ok = await confirm({
        title: 'Encerrar a sessão de foco?',
        description: (
          <>
            Ainda faltam {formatClock(remaining)} em <strong>{session.taskTitle}</strong>. Uma sessão interrompida não
            conta como Pomodoro. A tarefa continua como está.
          </>
        ),
        confirmLabel: 'Encerrar sessão',
        cancelLabel: 'Continuar focando',
      });
      if (!ok) return;
    }
    pomodoro.stop();
  };

  return (
    <section
      className={styles.panel}
      data-phase={focus ? 'focus' : 'break'}
      data-paused={paused ? 'true' : 'false'}
      aria-labelledby={labelId}
    >
      <div
        className={styles.ring}
        role="progressbar"
        aria-label={`Progresso: ${phaseLabel.toLowerCase()}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% concluído`}
      >
        <svg className={styles.ringSvg} viewBox="0 0 100 100" aria-hidden="true">
          <circle className={styles.ringTrack} cx="50" cy="50" r="44" />
          <circle
            className={styles.ringBar}
            cx="50"
            cy="50"
            r="44"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - pct}
          />
        </svg>
        <PhaseIcon size={20} aria-hidden="true" className={styles.ringIcon} />
      </div>

      <div className={styles.info}>
        <p className={styles.phase} id={labelId}>
          {phaseLabel}
          {paused ? <span className={styles.pausedTag}>Pausado</span> : null}
        </p>
        <p className={styles.time} role="timer" aria-label={`${describeDuration(remaining)} restantes`}>
          {formatClock(remaining)}
        </p>
        {task ? (
          <button type="button" className={styles.task} onClick={(e) => openEditTask(task, e.currentTarget)}>
            <span className="sr-only">Tarefa: </span>
            {task.title}
          </button>
        ) : (
          <p className={styles.taskStatic}>{session.taskTitle}</p>
        )}
        <p className={styles.count}>{describeStats(stats)} nesta tarefa</p>
      </div>

      <div className={styles.controls}>
        {paused ? (
          <Button variant="primary" icon={<Play size={18} />} onClick={pomodoro.resume}>
            <ButtonLabel>Retomar</ButtonLabel>
          </Button>
        ) : (
          <Button variant="secondary" icon={<Pause size={18} />} onClick={pomodoro.pause}>
            <ButtonLabel>Pausar</ButtonLabel>
          </Button>
        )}
        <Button variant="ghost" icon={<Square size={18} />} onClick={() => void onStop()}>
          <ButtonLabel>{focus ? 'Encerrar' : 'Encerrar pausa'}</ButtonLabel>
        </Button>
      </div>
    </section>
  );
}
