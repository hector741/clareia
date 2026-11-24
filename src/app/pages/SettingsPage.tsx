import { PageHeader } from '../../components/ui/PageHeader';
import { BackupPanel } from '../../features/backup/BackupPanel';
import { InstallPanel } from '../../features/install/InstallPanel';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';

export function SettingsPage() {
  usePageTitle('Configurações');
  return (
    <div className={styles.page}>
      <PageHeader title="Configurações" />

      <section className={styles.card} aria-labelledby="scope-title">
        <h2 id="scope-title">Onde ficam seus dados</h2>
        <p>
          <strong>Suas tarefas ficam neste navegador. Exporte uma cópia para guardar ou transferir seus dados.</strong>
        </p>
        <ul className={styles.bullets}>
          <li>Os dados valem para este navegador, este perfil e este endereço. Outro navegador ou aparelho começa vazio.</li>
          <li>Computador e celular não sincronizam entre si nesta versão. Use exportar e restaurar para transferir.</li>
          <li>
            Limpar os dados do site ou usar uma janela privativa pode apagar as tarefas. O Clareia não faz cópia remota
            nem criptografia própria.
          </li>
          <li>Não há notificações com o aplicativo fechado, e a reabertura sem internet não é garantida.</li>
        </ul>
      </section>

      <InstallPanel />

      <BackupPanel />
    </div>
  );
}
