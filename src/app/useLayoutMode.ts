import { useEffect, useSyncExternalStore } from 'react';

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

const QUERIES = {
  tablet: '(min-width: 768px)',
  desktop: '(min-width: 1024px)',
  /** Celular deitado: tela de toque baixa, mesmo com largura de tablet. */
  phoneLandscape: '(pointer: coarse) and (max-height: 500px)',
  standalone: '(display-mode: standalone), (display-mode: fullscreen)',
} as const;

function subscribe(callback: () => void): () => void {
  const lists = Object.values(QUERIES).map((q) => window.matchMedia(q));
  lists.forEach((l) => l.addEventListener('change', callback));
  return () => lists.forEach((l) => l.removeEventListener('change', callback));
}

function getSnapshot(): LayoutMode {
  const match = (q: string) => window.matchMedia(q).matches;
  if (match(QUERIES.phoneLandscape)) return 'mobile';
  if (match(QUERIES.desktop)) return 'desktop';
  if (match(QUERIES.tablet)) return 'tablet';
  return 'mobile';
}

/** Rodando como aplicativo instalado (tela inicial), sem a interface do navegador. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia(QUERIES.standalone).matches || nav.standalone === true;
}

/**
 * Celular: largura < 768 px ou celular deitado; tablet: 768–1023 px; computador: ≥ 1024 px.
 * Publica o modo em `<html data-layout>` para estilos de camadas fora do shell (diálogos, avisos).
 */
export function useLayoutMode(): LayoutMode {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => 'desktop' as const);
  const standalone = useSyncExternalStore(subscribe, isStandalone, () => false);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.layout = mode;
    root.dataset.standalone = standalone ? 'true' : 'false';
  }, [mode, standalone]);
  return mode;
}
