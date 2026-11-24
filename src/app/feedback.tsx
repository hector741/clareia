import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './feedback.module.css';

type Kind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: Kind;
  message: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}

interface NotifyOptions {
  actionLabel?: string;
  onAction?: () => void;
}

interface FeedbackApi {
  success: (message: string, options?: NotifyOptions) => void;
  info: (message: string, options?: NotifyOptions) => void;
  error: (message: string, options?: NotifyOptions) => void;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback fora do FeedbackProvider');
  return ctx;
}

const AUTO_DISMISS_MS = 5000;

/**
 * Mensagens anunciáveis sem roubar o foco: sucesso/informação em região `status`
 * (educada) e erros em região `alert`. Erros permanecem até serem dispensados.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: Kind, message: string, options?: NotifyOptions) => {
      const id = nextId.current++;
      setToasts((current) => [
        ...current.slice(-3),
        { id, kind, message, actionLabel: options?.actionLabel, onAction: options?.onAction },
      ]);
      if (kind !== 'error') window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const api = useMemo<FeedbackApi>(
    () => ({
      success: (m, o) => push('success', m, o),
      info: (m, o) => push('info', m, o),
      error: (m, o) => push('error', m, o),
    }),
    [push],
  );

  const polite = toasts.filter((t) => t.kind !== 'error');
  const errors = toasts.filter((t) => t.kind === 'error');

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <div className={styles.region}>
        <div role="status" aria-live="polite" className={styles.stack}>
          {polite.map((t) => (
            <ToastView key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
        <div role="alert" className={styles.stack}>
          {errors.map((t) => (
            <ToastView key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </FeedbackContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? TriangleAlert : Info;
  return (
    <div className={`${styles.toast} ${styles[toast.kind]}`}>
      <Icon size={20} aria-hidden="true" className={styles.icon} />
      <p className={styles.message}>{toast.message}</p>
      {toast.actionLabel && toast.onAction ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            toast.onAction?.();
            onDismiss(toast.id);
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
      <button type="button" className={styles.close} aria-label="Dispensar mensagem" onClick={() => onDismiss(toast.id)}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
