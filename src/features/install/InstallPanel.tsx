import { Download, Share } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isStandalone } from '../../app/useLayoutMode';
import { useFeedback } from '../../app/feedback';
import { Button } from '../../components/ui/Button';
import styles from '../../app/pages/page.module.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

// Capturado cedo (no carregamento do módulo), pois o navegador dispara o evento uma única vez.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((l) => l());
  });
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function InstallPanel() {
  const feedback = useFeedback();
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const installed = isStandalone();
  const canPrompt = deferredPrompt !== null;
  const ios = isIos();
  if (!installed && !canPrompt && !ios) return null;

  const install = async () => {
    const event = deferredPrompt;
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferredPrompt = null;
    rerender((n) => n + 1);
    if (outcome === 'accepted') feedback.success('Clareia adicionado à tela inicial.');
  };

  return (
    <section className={styles.card} aria-labelledby="install-title">
      <h2 id="install-title">Usar como aplicativo</h2>
      {installed ? (
        <p>O Clareia está aberto como aplicativo instalado neste aparelho.</p>
      ) : canPrompt ? (
        <>
          <p>Adicione o Clareia à tela inicial para abrir em tela cheia, como um aplicativo.</p>
          <div>
            <Button variant="primary" icon={<Download size={18} />} onClick={() => void install()}>
              Instalar aplicativo
            </Button>
          </div>
        </>
      ) : (
        <p>
          No Safari, toque em <Share size={16} aria-label="Compartilhar" style={{ verticalAlign: '-2px' }} />{' '}
          <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
        </p>
      )}
      <p>Os dados continuam neste aparelho, no mesmo espaço do navegador.</p>
    </section>
  );
}
