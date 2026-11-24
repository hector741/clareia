import { ClareiaDB } from './database';
import { createRepository } from './repository';

export const db = new ClareiaDB();
export const repo = createRepository(db);

export { AppError, toAppError } from './errors';
export type { MoveDirection, Repository, UpdateResult } from './repository';
