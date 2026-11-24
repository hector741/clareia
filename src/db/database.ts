import Dexie, { type DexieOptions, type EntityTable } from 'dexie';
import type { Settings, Task, TaskList } from '../domain/types';

/**
 * Esquema do IndexedDB.
 *
 * Observações:
 * - IndexedDB não indexa `null`; por isso consultas por "sem lista", "sem prazo" etc.
 *   são feitas filtrando em memória. Os índices abaixo servem apenas para valores não nulos.
 * - Migrações futuras: acrescente `this.version(2).stores({...}).upgrade(tx => ...)`.
 *   Nunca limpe dados para resolver um erro de migração.
 */
export class ClareiaDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  lists!: EntityTable<TaskList, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor(name = 'clareia', options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      tasks: 'id, listId, status, focusDate, plannedDate, dueDate, completedOn, deletedAt',
      lists: 'id, position',
      settings: 'id',
    });
  }
}
