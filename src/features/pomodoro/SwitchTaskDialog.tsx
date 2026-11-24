import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Pause, Square } from 'lucide-react';
import { useRef } from 'react';
import { restoreFocus } from '../../app/focus';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { formatClock, type TimerSession } from './model';
import type { FocusOptions } from './PomodoroContext';

export interface SwitchRequest {
  task: { id: string; title: string };
  options: FocusOptions | undefined;
  current: TimerSession;
  /** Já existe uma sessão guardada, que será trocada por esta. */
  replacesSuspended: boolean;
}

interface Props {
  request: SwitchRequest | null;
  remaining: number;
  onPause(): void;
  onEnd(): void;
  onCancel(): void;
}

/** Só um temporizador por vez: antes de trocar de tarefa, a pessoa escolhe o que fazer com o atual. */
export function SwitchTaskDialog({ request, remaining, onPause, onEnd, onCancel }: Props) {
  const origin = useRef<HTMLElement | null>(null);
  return (
    <AlertDialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (open) origin.current = document.activeElement as HTMLElement | null;
        else onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogStyles.overlay} />
        <AlertDialog.Content
          className={dialogStyles.alertContent}
          onOpenAutoFocus={() => {
            origin.current = origin.current ?? (document.activeElement as HTMLElement | null);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus(origin.current);
            origin.current = null;
          }}
        >
          <AlertDialog.Title className={dialogStyles.alertTitle}>Trocar a tarefa em foco?</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className={dialogStyles.alertDescription}>
              <p>
                Há uma sessão de foco em andamento em <strong>{request?.current.taskTitle}</strong> (faltam{' '}
                {formatClock(remaining)}). Só um temporizador fica ativo por vez.
              </p>
              <p>
                Para focar em <strong>{request?.task.title}</strong>, você pode pausar a sessão atual e retomá-la
                depois, ou encerrá-la (uma sessão interrompida não conta como Pomodoro).
              </p>
              {request?.replacesSuspended ? (
                <p>A sessão que já estava pausada antes será substituída por esta.</p>
              ) : null}
            </div>
          </AlertDialog.Description>
          <div className={dialogStyles.actions}>
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">Cancelar</Button>
            </AlertDialog.Cancel>
            <Button variant="secondary" icon={<Square size={16} />} onClick={onEnd}>
              Encerrar e trocar
            </Button>
            <Button variant="primary" icon={<Pause size={16} />} onClick={onPause}>
              Pausar e trocar
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
