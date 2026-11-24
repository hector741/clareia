import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { CloudUpload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '../../app/AuthContext';
import { useFeedback } from '../../app/feedback';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { repo, toAppError, type LocalData } from '../../db';
import { getLegacyDecision, setLegacyDecision, type LegacyDecision } from '../../db/legacyDecision';
import styles from '../../app/pages/page.module.css';

function describe(data: LocalData): string {
  const tasks = data.tasks.length;
  const lists = data.lists.length;
  const t = `${tasks} ${tasks === 1 ? 'tarefa' : 'tarefas'}`;
  return lists > 0 ? `${t} e ${lists} ${lists === 1 ? 'lista' : 'listas'}` : t;
}

/** Dados da versão sem conta, ainda neste navegador, e a decisão do usuário sobre eles. */
function useLegacy(userId: string) {
  const [data, setData] = useState<LocalData | null>(null);
  const [decision, setDecisionState] = useState<LegacyDecision | null>(() => getLegacyDecision(userId));
  useEffect(() => {
    let active = true;
    void import('../../db/legacy')
      .then((m) => m.readLegacyData())
      .then((found) => {
        if (active) setData(found);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const decide = useCallback(
    (next: LegacyDecision) => {
      setLegacyDecision(userId, next);
      setDecisionState(next);
    },
    [userId],
  );
  return { data, decision, decide };
}

function useImport(data: LocalData | null, decide: (d: LegacyDecision) => void) {
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (!data || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await repo.importLocal(data);
      decide('imported');
      feedback.success(
        `${result.tasks} ${result.tasks === 1 ? 'tarefa enviada' : 'tarefas enviadas'} para a sua conta.`,
      );
    } catch (e) {
      setError(`${toAppError(e).message} As tarefas continuam neste navegador.`);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** No primeiro acesso à conta neste navegador, oferece enviar as tarefas salvas só aqui. */
export function LegacyImportPrompt() {
  const user = useCurrentUser();
  const { data, decision, decide } = useLegacy(user.id);
  const { busy, error, run } = useImport(data, decide);
  const open = data !== null && decision === null;

  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogStyles.overlay} />
        <AlertDialog.Content className={dialogStyles.alertContent}>
          <AlertDialog.Title className={dialogStyles.alertTitle}>Enviar suas tarefas para a conta?</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className={dialogStyles.alertDescription}>
              <p>
                Este navegador tem <strong>{data ? describe(data) : ''}</strong> salvas antes do login.
              </p>
              <p>
                Ao enviar, elas passam a aparecer em todos os aparelhos onde você entrar. Nada do que já está na conta é
                substituído, e a cópia deste navegador é mantida.
              </p>
            </div>
          </AlertDialog.Description>
          {error ? (
            <p role="alert" className={styles.inlineError}>
              {error}
            </p>
          ) : null}
          <div className={dialogStyles.actions}>
            <Button variant="secondary" onClick={() => decide('dismissed')} disabled={busy}>
              Agora não
            </Button>
            <Button variant="primary" icon={<CloudUpload size={18} />} onClick={() => void run()} disabled={busy} aria-busy={busy}>
              {busy ? 'Enviando…' : 'Enviar para minha conta'}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** Em Configurações: permite enviar depois, se o usuário escolheu "Agora não". */
export function LegacyImportSection() {
  const user = useCurrentUser();
  const { data, decision, decide } = useLegacy(user.id);
  const { busy, error, run } = useImport(data, decide);
  if (!data || decision !== 'dismissed') return null;
  return (
    <section className={styles.card} aria-labelledby="legacy-title">
      <h2 id="legacy-title">Tarefas salvas só neste navegador</h2>
      <p>
        Há <strong>{describe(data)}</strong> de antes do login. Envie para a conta para vê-las em todos os aparelhos.
      </p>
      {error ? (
        <p role="alert" className={styles.inlineError}>
          {error}
        </p>
      ) : null}
      <div>
        <Button variant="primary" icon={<CloudUpload size={18} />} onClick={() => void run()} disabled={busy} aria-busy={busy}>
          {busy ? 'Enviando…' : 'Enviar para minha conta'}
        </Button>
      </div>
    </section>
  );
}
