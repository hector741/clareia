import { repo } from '../../db';
import { backupFileName } from '../../domain/backup';
import { todayLocal } from '../../domain/dates';

/**
 * Gera o arquivo de backup e dispara o download. O navegador não confirma
 * onde/se o arquivo foi salvo; só registramos que o arquivo foi gerado.
 */
export async function generateBackupDownload(): Promise<{ fileName: string; exportedAt: string }> {
  const backup = await repo.exportBackup();
  const fileName = backupFileName(todayLocal());
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await repo.markExported(backup.exportedAt);
  return { fileName, exportedAt: backup.exportedAt };
}
