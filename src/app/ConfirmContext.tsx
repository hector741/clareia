import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import styles from '../components/ui/Dialog.module.css';
import { restoreFocus } from './focus';

export interface ConfirmOptions {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm fora do ConfirmProvider');
  return fn;
}

interface Pending {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const answered = useRef(false);
  const originRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      answered.current = false;
      originRef.current = document.activeElement as HTMLElement | null;
      setPending({ options, resolve });
    });
  }, []);

  const answer = (value: boolean) => {
    if (!pending || answered.current) return;
    answered.current = true;
    pending.resolve(value);
    setPending(null);
  };

  const api = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <AlertDialog.Root open={pending !== null} onOpenChange={(open) => (!open ? answer(false) : undefined)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.overlay} />
          <AlertDialog.Content
            className={styles.alertContent}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              restoreFocus(originRef.current);
            }}
          >
            <AlertDialog.Title className={styles.alertTitle}>{pending?.options.title}</AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className={styles.alertDescription}>{pending?.options.description}</div>
            </AlertDialog.Description>
            <div className={styles.actions}>
              <AlertDialog.Cancel asChild>
                <Button variant="secondary">{pending?.options.cancelLabel ?? 'Cancelar'}</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant={pending?.options.tone === 'danger' ? 'dangerSolid' : 'primary'}
                  onClick={() => answer(true)}
                >
                  {pending?.options.confirmLabel}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}
