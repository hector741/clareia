import { backend } from '../backend';
import type { Remote } from '../backend/types';
import { AppError } from './errors';
import { createRepository } from './repository';
import { DataStore } from './store';

const unavailable = (): never => {
  throw new AppError('storage', 'O serviço de dados não está configurado.');
};
const offlineRemote: Remote = {
  fetchAll: unavailable,
  saveTask: unavailable,
  deleteTask: unavailable,
  saveList: unavailable,
  deleteList: unavailable,
  setPositions: unavailable,
  importData: unavailable,
  saveFocusSession: unavailable,
  saveSettings: unavailable,
  restoreBackup: unavailable,
  saveShoppingStore: unavailable,
  saveShoppingProduct: unavailable,
  saveShoppingVariant: unavailable,
  saveShoppingList: unavailable,
  deleteShoppingList: unavailable,
  saveShoppingItems: unavailable,
  deleteShoppingItem: unavailable,
  createShoppingList: unavailable,
  finalizeShoppingList: unavailable,
  correctShoppingPurchase: unavailable,
  voidShoppingPurchase: unavailable,
};

export const store = new DataStore();
export const repo = createRepository(store, backend?.remote ?? offlineRemote);

export { AppError, toAppError } from './errors';
export type { LocalData, MoveDirection, Repository, UpdateResult } from './repository';
