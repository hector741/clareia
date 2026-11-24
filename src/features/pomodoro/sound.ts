/**
 * Sino suave sintetizado com Web Audio (sem arquivo para baixar). Os navegadores só
 * liberam áudio depois de um toque, clique ou tecla na página; por isso o contexto é
 * destravado no primeiro gesto e, se ainda assim estiver bloqueado, quem chama
 * recebe `blocked` e mostra o aviso visual sozinho.
 */

export type BellResult = 'played' | 'muted' | 'blocked' | 'unsupported';

type AudioContextClass = typeof AudioContext;

let context: AudioContext | null = null;

function audioClass(): AudioContextClass | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor = audioClass();
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/** Chame dentro de um gesto (clique, tecla): é o que o navegador exige para liberar o som. */
export function unlockAudio(): void {
  const ctx = getContext();
  if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
}

export function audioUnlocked(): boolean {
  return context?.state === 'running';
}

/** Destrava o áudio no primeiro gesto da pessoa em qualquer lugar da página. */
export function unlockOnFirstGesture(): () => void {
  const events = ['pointerdown', 'keydown'] as const;
  const handler = () => {
    unlockAudio();
    if (audioUnlocked()) remove();
  };
  const remove = () => events.forEach((e) => document.removeEventListener(e, handler, true));
  events.forEach((e) => document.addEventListener(e, handler, true));
  return remove;
}

async function ensureRunning(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === 'running') return true;
  try {
    await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 400))]);
  } catch {
    return false;
  }
  return (ctx.state as AudioContextState) === 'running';
}

/** Um toque de sino: fundamental com parciais inarmônicas, ataque curto e decaimento longo. */
function strike(ctx: AudioContext, at: number, volume: number, base: number): void {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, at);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 0.35), at + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, at + 2.6);
  master.connect(ctx.destination);
  const partials: [number, number][] = [
    [1, 1],
    [2.01, 0.45],
    [3.02, 0.22],
    [4.17, 0.1],
  ];
  for (const [ratio, gain] of partials) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base * ratio, at);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.6 / ratio);
    osc.connect(g).connect(master);
    osc.start(at);
    osc.stop(at + 2.7);
  }
}

/** Toca o sino (dois toques). `volume` de 0 a 1. */
export async function playBell(volume: number, muted: boolean): Promise<BellResult> {
  if (muted || volume <= 0) return 'muted';
  const ctx = getContext();
  if (!ctx) return 'unsupported';
  if (!(await ensureRunning(ctx))) return 'blocked';
  try {
    const t = ctx.currentTime + 0.05;
    strike(ctx, t, volume, 784);
    strike(ctx, t + 0.9, volume * 0.8, 659);
    return 'played';
  } catch {
    return 'blocked';
  }
}
