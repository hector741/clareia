import { createMemoryBackend, type KeyValue, type MemoryControls } from './memory';
import { createSupabaseBackend } from './supabase';
import type { Backend } from './types';

function createBackend(): Backend {
  if (import.meta.env.VITE_BACKEND === 'memory') {
    const kv: KeyValue = {
      get: (k) => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v),
      remove: (k) => localStorage.removeItem(k),
    };
    const controls: MemoryControls = { failWrites: false };
    (window as unknown as { __clareiaMemory: MemoryControls }).__clareiaMemory = controls;
    return createMemoryBackend(kv, controls);
  }
  return createSupabaseBackend(
    import.meta.env.VITE_SUPABASE_URL as string | undefined,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  );
}

/** `null` quando o app foi publicado sem as variáveis do Supabase. */
export const backend: Backend | null = (() => {
  try {
    return createBackend();
  } catch {
    return null;
  }
})();

export type { AuthApi, AuthUser, Backend, Remote, Snapshot, UrlIntent } from './types';
export { AuthFailure } from './authErrors';
export { clearAuthParamsFromUrl } from './urlIntent';
