import { EMPTY_STATE, parsePrefs, parseState, type PomodoroPrefs, type PomodoroState } from './model';

/**
 * O temporizador fica salvo neste navegador (por conta), para sobreviver a uma
 * atualização da página e ser compartilhado entre abas. As alterações passam por
 * uma trava entre abas (Web Locks), para que só uma aba conclua cada sessão.
 */

const stateKey = (userId: string) => `clareia:pomodoro:${userId}`;
const PREFS_KEY = 'clareia:pomodoro-prefs';

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento cheio ou bloqueado: o temporizador segue nesta aba, só não sobrevive à atualização.
  }
}

export function readState(userId: string): PomodoroState {
  const raw = readJson(stateKey(userId));
  return raw === null ? EMPTY_STATE : parseState(raw);
}

export function readPrefs(): PomodoroPrefs {
  return parsePrefs(readJson(PREFS_KEY));
}

export function writePrefs(prefs: PomodoroPrefs): void {
  writeJson(PREFS_KEY, prefs);
}

/**
 * Lê o estado mais recente (de qualquer aba), aplica `fn` e salva, tudo sob a trava.
 * Devolve o estado anterior e o novo, para quem chamou saber se a mudança foi sua.
 */
export async function mutateState<T>(
  userId: string,
  fn: (current: PomodoroState) => { state: PomodoroState; result: T },
): Promise<{ before: PomodoroState; state: PomodoroState; result: T }> {
  const run = () => {
    const before = readState(userId);
    const { state, result } = fn(before);
    if (state !== before) writeJson(stateKey(userId), state);
    return { before, state, result };
  };
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return run();
  try {
    return await locks.request(`clareia-pomodoro:${userId}`, run);
  } catch {
    return run();
  }
}

/** Avisa quando outra aba altera o temporizador ou as preferências. */
export function subscribeStorage(
  userId: string,
  onState: (state: PomodoroState) => void,
  onPrefs: (prefs: PomodoroPrefs) => void,
): () => void {
  const listener = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return;
    if (event.key === stateKey(userId)) onState(readState(userId));
    else if (event.key === PREFS_KEY) onPrefs(readPrefs());
    else if (event.key === null) {
      onState(readState(userId));
      onPrefs(readPrefs());
    }
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
