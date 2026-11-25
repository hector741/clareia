import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Download, FileUp } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useData, useSettings } from '../../app/DataContext';
import { useFeedback } from '../../app/feedback';
import { restoreFocus } from '../../app/focus';
import { Button } from '../../components/ui/Button';
import dialogStyles from '../../components/ui/Dialog.module.css';
import { repo, toAppError } from '../../db';
import { parseBackupText, type BackupSummary, type ShoppingSummary } from '../../domain/backup';
import { formatInstant, todayLocal } from '../../domain/dates';
import { MAX_BACKUP_BYTES, type BackupFile } from '../../domain/types';
import { useShopping } from '../compras/useShopping';
import { generateBackupDownload } from './download';
import styles from './BackupPanel.module.css';

interface PendingRestore {
  fileName: string;
  backup: BackupFile;
  summary: BackupSummary;
}

function ShoppingCounts({ counts }: { counts: ShoppingSummary | null }) {
  if (!counts) {
    return <p className={styles.note}>Este arquivo é da versão 1 e não traz compras: as compras atuais da conta serão mantidas.</p>;
  }
  return (
    <ul className={styles.counts}>
      <li>
        <strong>{counts.lists}</strong> {counts.lists === 1 ? 'lista de compras' : 'listas de compras'}
      </li>
      <li>
        <strong>{counts.purchases}</strong> {counts.purchases === 1 ? 'compra registrada' : 'compras registradas'}
      </li>
      <li>
        <strong>{counts.voided}</strong> {counts.voided === 1 ? 'compra anulada' : 'compras anuladas'}
      </li>
    </ul>
  );
}

function Counts({ summary }: { summary: Pick<BackupSummary, 'lists' | 'pending' | 'completed' | 'trashed'> }) {
  return (
    <ul className={styles.counts}>
      <li>
        <strong>{summary.lists}</strong> {summary.lists === 1 ? 'lista' : 'listas'}
      </li>
      <li>
        <strong>{summary.pending}</strong> {summary.pending === 1 ? 'tarefa pendente' : 'tarefas pendentes'}
      </li>
      <li>
        <strong>{summary.completed}</strong> {summary.completed === 1 ? 'tarefa concluída' : 'tarefas concluídas'}
      </li>
      <li>
        <strong>{summary.trashed}</strong> {summary.trashed === 1 ? 'item na Lixeira' : 'itens na Lixeira'}
      </li>
    </ul>
  );
}

export function BackupPanel() {
  const feedback = useFeedback();
  const { tasks, lists } = useData();
  const shoppingData = useShopping();
  const settings = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [exportedBefore, setExportedBefore] = useState(false);
  const restoringRef = useRef(false);

  const current = {
    lists: lists.length,
    pending: tasks.filter((t) => t.deletedAt === null && t.status === 'pending').length,
    completed: tasks.filter((t) => t.deletedAt === null && t.status === 'completed').length,
    trashed: tasks.filter((t) => t.deletedAt !== null).length,
  };
  const currentShopping: ShoppingSummary = {
    lists: shoppingData.lists.length,
    activeLists: shoppingData.lists.filter((l) => l.status !== 'finished').length,
    finishedLists: shoppingData.lists.filter((l) => l.status === 'finished').length,
    purchases: shoppingData.purchases.filter((p) => p.status === 'active').length,
    voided: shoppingData.purchases.filter((p) => p.status === 'voided').length,
  };

  const doExport = async (): Promise<boolean> => {
    if (exporting) return false;
    setExporting(true);
    try {
      const { fileName } = await generateBackupDownload();
      feedback.success(`Arquivo ${fileName} gerado. Confira sua pasta de downloads.`);
      return true;
    } catch (error) {
      feedback.error(toAppError(error).message);
      return false;
    } finally {
      setExporting(false);
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setImportErrors(null);
    setRestoreError(null);
    setExportedBefore(false);
    if (file.size > MAX_BACKUP_BYTES) {
      setImportErrors(['O arquivo é maior que 10 MiB. Nada foi alterado.']);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportErrors(['Não foi possível ler o arquivo. Nada foi alterado.']);
      return;
    }
    const result = parseBackupText(text, todayLocal());
    if (!result.ok) {
      setImportErrors([...result.errors, 'Nada foi alterado: seus dados atuais continuam como estavam.']);
      return;
    }
    setPending({ fileName: file.name, backup: result.backup, summary: result.summary });
  };

  const confirmRestore = async () => {
    if (!pending || restoringRef.current) return;
    restoringRef.current = true;
    setRestoring(true);
    setRestoreError(null);
    try {
      await repo.restoreBackup(pending.backup);
      feedback.success('Dados restaurados. Os dados anteriores da conta foram substituídos.');
      setPending(null);
    } catch (error) {
      setRestoreError(`${toAppError(error).message} Seus dados anteriores continuam intactos.`);
    } finally {
      restoringRef.current = false;
      setRestoring(false);
    }
  };

  return (
    <div className={styles.panel}>
      <section className={styles.section} aria-labelledby="export-title">
        <h2 id="export-title">Exportar dados</h2>
        <p>
          Gera um arquivo JSON com listas, tarefas pendentes, concluídas, Lixeira, etapas e o módulo Compras (listas,
          produtos, mercados e compras registradas). Guarde-o onde preferir ou use-o para restaurar a conta depois.
        </p>
        <div>
          <Button variant="primary" icon={<Download size={18} />} onClick={() => void doExport()} disabled={exporting} aria-busy={exporting}>
            {exporting ? 'Gerando…' : 'Exportar dados'}
          </Button>
        </div>
        <p className={styles.note} role="status">
          {settings?.lastExportGeneratedAt
            ? `Última exportação gerada: ${formatInstant(settings.lastExportGeneratedAt)}. O navegador não confirma onde o arquivo foi salvo.`
            : 'Nenhuma exportação gerada ainda.'}
        </p>
      </section>

      <section className={styles.section} aria-labelledby="restore-title">
        <h2 id="restore-title">Restaurar de um arquivo</h2>
        <p>
          Escolha um arquivo exportado pelo Clareia. O arquivo é verificado por inteiro antes de qualquer alteração e você
          confirma antes de substituir. Esta versão <strong>não mescla</strong> dados: ela substitui tudo o que está na
          sua conta.
        </p>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void onFile(e)}
            aria-label="Arquivo de backup"
          />
          <Button
            ref={chooseButton}
            variant="secondary"
            icon={<FileUp size={18} />}
            onClick={() => fileInput.current?.click()}
          >
            Escolher arquivo de backup
          </Button>
        </div>
        {importErrors ? (
          <div role="alert" className={styles.errors}>
            <p>
              <strong>Não foi possível usar este arquivo.</strong>
            </p>
            <ul>
              {importErrors.map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <AlertDialog.Root
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !restoring) setPending(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={dialogStyles.overlay} />
          <AlertDialog.Content
            className={dialogStyles.alertContent}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              restoreFocus(chooseButton.current);
            }}
          >
            <AlertDialog.Title className={dialogStyles.alertTitle}>Substituir os dados da conta?</AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className={dialogStyles.alertDescription}>
                <p>
                  O arquivo <strong>{pending?.fileName}</strong> (gerado em{' '}
                  {pending ? formatInstant(pending.summary.exportedAt) : ''}) contém:
                </p>
                {pending ? <Counts summary={pending.summary} /> : null}
                {pending ? <ShoppingCounts counts={pending.summary.shopping} /> : null}
                <p>Hoje a sua conta tem:</p>
                <Counts summary={current} />
                <ShoppingCounts counts={currentShopping} />
                <p>
                  Ao confirmar, <strong>tudo isso será substituído</strong> pelo conteúdo do arquivo. Não há mesclagem e a
                  ação não pode ser desfeita. Se quiser, exporte os dados atuais antes.
                </p>
              </div>
            </AlertDialog.Description>
            {restoreError ? (
              <p role="alert" className={styles.errors}>
                {restoreError}
              </p>
            ) : null}
            <div className={styles.dialogExtra}>
              <Button variant="secondary" icon={<Download size={16} />} onClick={() => void doExport().then((ok) => ok && setExportedBefore(true))} disabled={exporting}>
                Exportar dados atuais antes
              </Button>
              {exportedBefore ? <span className={styles.note}>Arquivo dos dados atuais gerado.</span> : null}
            </div>
            <div className={dialogStyles.actions}>
              <AlertDialog.Cancel asChild>
                <Button variant="secondary" disabled={restoring}>
                  Cancelar
                </Button>
              </AlertDialog.Cancel>
              <Button variant="dangerSolid" onClick={() => void confirmRestore()} disabled={restoring} aria-busy={restoring}>
                {restoring ? 'Substituindo…' : restoreError ? 'Tentar de novo' : 'Substituir dados da conta'}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
