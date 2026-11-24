import { PageHeader } from '../../components/ui/PageHeader';
import { AccountPanel } from '../../features/account/AccountPanel';
import { LegacyImportSection } from '../../features/account/LegacyImport';
import { BackupPanel } from '../../features/backup/BackupPanel';
import { InstallPanel } from '../../features/install/InstallPanel';
import { PomodoroSettings } from '../../features/pomodoro/PomodoroSettings';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';

export function SettingsPage() {
  usePageTitle('Configurações');
  return (
    <div className={styles.page}>
      <PageHeader title="Configurações" />

      <AccountPanel />

      <LegacyImportSection />

      <PomodoroSettings />

      <section className={styles.card} aria-labelledby="scope-title">
        <h2 id="scope-title">Onde ficam seus dados</h2>
        <ul className={styles.bullets}>
          <li>Listas, tarefas, etapas e Lixeira ficam salvas na sua conta e sincronizam entre os aparelhos onde você entrar.</li>
          <li>Somente você acessa os seus dados: cada consulta ao servidor é verificada pela sua sessão.</li>
          <li>É preciso internet para salvar. Sem conexão, a alteração não é gravada e o app avisa.</li>
          <li>Exporte uma cópia de vez em quando para guardar onde preferir.</li>
        </ul>
      </section>

      <InstallPanel />

      <BackupPanel />
    </div>
  );
}
