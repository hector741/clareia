import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ArrowLeft, BellOff, Check, Coffee, Play, Plus, Timer } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useData } from '../../app/DataContext';
import { useFeedback } from '../../app/feedback';
import { restoreFocus } from '../../app/focus';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { repo, toAppError } from '../../db';
import { openSubtaskCount } from '../../domain/taskInput';
import { EXTRA_MINUTES, PHASE_LABELS, describeStats, nextBreak } from './model';
import { usePomodoro } from './PomodoroContext';
import styles from './Pomodoro.module.css';

type Step = 'ask' | 'steps' | 'continue';

const LATE_MS = 2 * 60_000;

function timeOf(ms: number): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(ms);
}

/**
 * Aviso de fim de etapa. Fica salvo até a pessoa decidir, aparece em todas as abas e
 * some de todas quando ela responde em qualquer uma. O fim do foco nunca conclui a tarefa.
 */
export function PomodoroPrompt() {
  const pomodoro = usePomodoro();
  const { state, prefs, bell } = pomodoro;
  const { tasks } = useData();
  const feedback = useFeedback();
  const prompt = state.prompt;
  const [step, setStep] = useState<Step>('ask');
  const [completing, setCompleting] = useState(false);
  const origin = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setStep('ask');
    if (prompt) origin.current = document.activeElement as HTMLElement | null;
  }, [prompt?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const task = prompt ? tasks.find((t) => t.id === prompt.taskId) : undefined;
  const available = task !== undefined && task.deletedAt === null;
  const done = available && task.status === 'completed';
  const ref = { id: prompt?.taskId ?? '', title: task?.title ?? prompt?.taskTitle ?? '' };
  const brk = nextBreak(state, prefs);
  const breakLabel = `${brk.phase === 'long_break' ? 'Fazer uma pausa longa' : 'Fazer uma pausa curta'} (${brk.minutes} min)`;
  const stats = prompt ? pomodoro.statsFor(prompt.taskId) : null;
  const late = prompt ? Date.now() - prompt.endedAt > LATE_MS : false;
  const bellResult = bell && prompt && bell.sessionId === prompt.sessionId ? bell.result : null;

  const complete = async () => {
    if (!task || completing) return;
    setCompleting(true);
    try {
      await repo.completeTask(task.id);
      feedback.success('Tarefa concluída.');
      setStep('ask');
    } catch (error) {
      feedback.error(toAppError(error).message);
    } finally {
      setCompleting(false);
    }
  };

  const onComplete = () => {
    if (task && openSubtaskCount(task) > 0) setStep('steps');
    else void complete();
  };

  const notes = (
    <>
      {late && prompt ? (
        <p className={styles.promptNote}>
          Terminou às {timeOf(prompt.endedAt)}, enquanto o Clareia estava fechado ou sem atividade.
        </p>
      ) : null}
      {bellResult === 'blocked' ? (
        <p className={styles.promptNote}>
          <BellOff size={16} aria-hidden="true" /> O navegador bloqueou o som. Ele é liberado depois que você clica ou
          toca na página.
        </p>
      ) : bellResult === 'unsupported' ? (
        <p className={styles.promptNote}>
          <BellOff size={16} aria-hidden="true" /> Este navegador não reproduz o som do aviso.
        </p>
      ) : null}
    </>
  );

  let title = '';
  let body: ReactNode = null;
  let actions: ReactNode = null;

  if (prompt?.type === 'focus_end') {
    if (!available) {
      title = 'O tempo de foco terminou.';
      body = (
        <p>
          A tarefa <strong>{prompt.taskTitle}</strong> não está mais disponível (foi excluída ou está na Lixeira).
        </p>
      );
      actions = (
        <>
          <AlertDialog.Cancel asChild>
            <Button variant="secondary">Fechar</Button>
          </AlertDialog.Cancel>
          <Button variant="primary" icon={<Coffee size={16} />} onClick={() => pomodoro.startBreak(ref, brk.phase)}>
            {breakLabel}
          </Button>
        </>
      );
    } else if (done) {
      title = 'Tarefa concluída.';
      body = (
        <p>
          <strong>{task.title}</strong> está concluída. Que tal uma pausa antes da próxima?
        </p>
      );
      actions = (
        <>
          <AlertDialog.Cancel asChild>
            <Button variant="secondary">Agora não</Button>
          </AlertDialog.Cancel>
          <Button variant="primary" icon={<Coffee size={16} />} onClick={() => pomodoro.startBreak(ref, brk.phase)}>
            {breakLabel}
          </Button>
        </>
      );
    } else if (step === 'steps') {
      const open = openSubtaskCount(task);
      title = 'Concluir com etapas abertas?';
      body = (
        <p>
          <strong>{task.title}</strong> ainda tem {open} {open === 1 ? 'etapa aberta' : 'etapas abertas'}. As etapas não
          serão marcadas como feitas; elas continuam como estão.
        </p>
      );
      actions = (
        <>
          <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setStep('ask')}>
            Voltar
          </Button>
          <Button variant="primary" icon={<Check size={16} />} onClick={() => void complete()} disabled={completing}>
            Concluir tarefa
          </Button>
        </>
      );
    } else if (step === 'continue') {
      title = 'Como quer continuar?';
      body = (
        <p>
          <strong>{task.title}</strong> continua pendente. Escolha uma pausa ou mais tempo de foco.
        </p>
      );
      actions = (
        <div className={styles.choiceList}>
          <Button variant="primary" icon={<Coffee size={18} />} onClick={() => pomodoro.startBreak(ref, brk.phase)}>
            {breakLabel}
          </Button>
          <Button
            variant="secondary"
            icon={<Timer size={18} />}
            onClick={() => pomodoro.startFocus(ref, { kind: 'pomodoro', minutes: prefs.focusMinutes })}
          >
            Mais um Pomodoro ({prefs.focusMinutes} min)
          </Button>
          <div className={styles.choiceRow}>
            {EXTRA_MINUTES.map((m) => (
              <Button
                key={m}
                variant="secondary"
                icon={<Plus size={18} />}
                onClick={() => pomodoro.startFocus(ref, { kind: 'extra', minutes: m })}
              >
                {m} min extra
              </Button>
            ))}
          </div>
          <p className={styles.promptNote}>Tempo extra é contado à parte, não como Pomodoro completo.</p>
          <div className={styles.choiceFooter}>
            <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep('ask')}>
              Voltar
            </Button>
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">Decidir depois</Button>
            </AlertDialog.Cancel>
          </div>
        </div>
      );
    } else {
      title = 'O tempo de foco terminou.';
      body = (
        <>
          <p>Você concluiu esta tarefa?</p>
          <p>
            <strong>{task.title}</strong>
          </p>
          {stats ? (
            <p className={styles.promptStats}>
              <Timer size={16} aria-hidden="true" />{' '}
              {prompt.kind === 'extra' ? 'Tempo extra registrado.' : 'Pomodoro registrado.'} Nesta tarefa:{' '}
              {describeStats(stats)}.
            </p>
          ) : null}
        </>
      );
      actions = (
        <div className={styles.choiceList}>
          <Button variant="primary" icon={<Check size={18} />} onClick={onComplete} disabled={completing}>
            Concluir tarefa
          </Button>
          <Button variant="secondary" icon={<Play size={18} />} onClick={() => setStep('continue')}>
            Continuar tarefa
          </Button>
          <AlertDialog.Cancel asChild>
            <Button variant="ghost">Decidir depois</Button>
          </AlertDialog.Cancel>
        </div>
      );
    }
  } else if (prompt?.type === 'break_end') {
    const canResume = available && !done;
    title = `${PHASE_LABELS[prompt.phase]} terminou.`;
    body = canResume ? (
      <p>
        Você pode retomar a tarefa <strong>{task.title}</strong> quando quiser.
      </p>
    ) : (
      <p>Você pode escolher a próxima tarefa quando quiser.</p>
    );
    actions = (
      <>
        <AlertDialog.Cancel asChild>
          <Button variant="secondary">Agora não</Button>
        </AlertDialog.Cancel>
        {canResume ? (
          <Button variant="primary" icon={<Play size={16} />} onClick={() => pomodoro.startFocus(ref)}>
            Retomar a tarefa ({prefs.focusMinutes} min)
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <AlertDialog.Root
      open={prompt !== null}
      onOpenChange={(open) => {
        if (!open) pomodoro.dismissPrompt();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogStyles.overlay} />
        <AlertDialog.Content
          className={`${dialogStyles.alertContent} ${styles.prompt}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus(origin.current);
          }}
        >
          <div className={styles.promptBadge} data-phase={prompt?.type === 'break_end' ? 'break' : 'focus'}>
            {prompt?.type === 'break_end' ? <Coffee size={18} aria-hidden="true" /> : <Timer size={18} aria-hidden="true" />}
            {prompt?.type === 'break_end' ? 'Pausa' : 'Foco'}
          </div>
          <AlertDialog.Title className={dialogStyles.alertTitle}>{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className={dialogStyles.alertDescription}>
              {body}
              {notes}
            </div>
          </AlertDialog.Description>
          <div className={dialogStyles.actions}>{actions}</div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
