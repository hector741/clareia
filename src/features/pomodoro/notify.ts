/**
 * Notificações do navegador, só depois de um pedido explícito da pessoa. No celular o
 * construtor `Notification` não funciona; lá a notificação sai por um service worker
 * mínimo (`notify-sw.js`, sem cache). Qualquer falha é silenciosa: o aviso na tela
 * e o som continuam valendo.
 */

export type NotifyPermission = 'unsupported' | 'default' | 'granted' | 'denied';

const SW_URL = `${import.meta.env.BASE_URL}notify-sw.js`;
const TAG = 'clareia-pomodoro';

export function notificationPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  const p = Notification.permission;
  return p === 'granted' || p === 'denied' ? p : 'default';
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    const reg = await navigator.serviceWorker.register(SW_URL);
    if (reg.active) return reg;
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    return ready;
  } catch {
    return null;
  }
}

/** Deve ser chamada a partir de um clique. Devolve a permissão resultante. */
export async function requestNotifications(): Promise<NotifyPermission> {
  if (notificationPermission() === 'unsupported') return 'unsupported';
  try {
    await Notification.requestPermission();
  } catch {
    // Alguns navegadores recusam fora de contexto seguro; a permissão atual decide.
  }
  const result = notificationPermission();
  if (result === 'granted') void registration();
  return result;
}

/** Mostra uma notificação; devolve `false` quando não foi possível (permissão, suporte, erro). */
export async function showNotification(title: string, body: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const options: NotificationOptions = { body, tag: TAG, icon: `${import.meta.env.BASE_URL}icons/icon-192.png` };
  const reg = await registration();
  if (reg) {
    try {
      await reg.showNotification(title, options);
      return true;
    } catch {
      // cai para o construtor
    }
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
