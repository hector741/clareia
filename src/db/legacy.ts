import { ClareiaDB } from './database';
import type { LocalData } from './repository';

/**
 * Dados da versão sem conta, guardados no IndexedDB deste navegador.
 * Nunca são apagados automaticamente: continuam aqui como cópia de segurança.
 * Carregado sob demanda (import dinâmico) para não pesar a abertura do app.
 */
export async function readLegacyData(name = 'clareia'): Promise<LocalData | null> {
  if (typeof indexedDB === 'undefined') return null;
  const exists = (await indexedDB.databases?.())?.some((d) => d.name === name);
  if (exists === false) return null;
  const db = new ClareiaDB(name);
  try {
    await db.open();
    const [tasks, lists] = await Promise.all([db.tasks.toArray(), db.lists.orderBy('position').toArray()]);
    return tasks.length === 0 && lists.length === 0 ? null : { tasks, lists };
  } catch {
    return null;
  } finally {
    db.close();
  }
}
