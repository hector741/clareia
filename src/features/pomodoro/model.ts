import { z } from 'zod';
import type { FocusKind, FocusSession } from '../../domain/types';

/**
 * Regras do Pomodoro, sem React nem navegador. O tempo restante é sempre calculado
 * pelo horário previsto de término (`endsAt`), nunca contando ticks: o navegador
 * atrasa temporizadores em abas ocultas, mas o relógio continua certo.
 */

export type Phase = 'focus' | 'short_break' | 'long_break';
export type BreakPhase = Exclude<Phase, 'focus'>;

export const PHASE_LABELS: Record<Phase, string> = {
  focus: 'Foco',
  short_break: 'Pausa curta',
  long_break: 'Pausa longa',
};

export const EXTRA_MINUTES = [5, 10] as const;

/* ------------------------------------------------------------- Preferências */

export const PREF_LIMITS = {
  focusMinutes: { min: 5, max: 120 },
  shortBreakMinutes: { min: 1, max: 30 },
  longBreakMinutes: { min: 5, max: 60 },
  longBreakEvery: { min: 2, max: 8 },
} as const;

const minutes = (key: keyof typeof PREF_LIMITS) =>
  z.number().int().min(PREF_LIMITS[key].min).max(PREF_LIMITS[key].max);

export const prefsSchema = z.object({
  focusMinutes: minutes('focusMinutes'),
  shortBreakMinutes: minutes('shortBreakMinutes'),
  longBreakMinutes: minutes('longBreakMinutes'),
  longBreakEvery: minutes('longBreakEvery'),
  /** 0 a 1. */
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
  /** A pessoa pediu notificações (a permissão do navegador é verificada à parte). */
  notifications: z.boolean(),
});

export type PomodoroPrefs = z.infer<typeof prefsSchema>;

export const DEFAULT_PREFS: PomodoroPrefs = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  volume: 0.6,
  muted: false,
  notifications: false,
};

/** Lê preferências salvas, completando o que faltar com os padrões. */
export function parsePrefs(raw: unknown): PomodoroPrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS;
  const merged = { ...DEFAULT_PREFS };
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof PomodoroPrefs)[]) {
    const candidate = { ...merged, [key]: (raw as Record<string, unknown>)[key] };
    if (prefsSchema.safeParse(candidate).success) Object.assign(merged, { [key]: candidate[key] });
  }
  return merged;
}

/* ------------------------------------------------------------------ Estado */

export interface TimerSession {
  /** Também é o id da sessão registrada, para não contar duas vezes. */
  id: string;
  taskId: string;
  /** Guardado para o painel continuar legível mesmo se a tarefa sumir. */
  taskTitle: string;
  phase: Phase;
  /** Só faz sentido no foco. */
  kind: FocusKind;
  durationMs: number;
  startedAt: number;
  /** Horário previsto de término quando está correndo; `null` quando pausado. */
  endsAt: number | null;
  /** Tempo que faltava no momento da pausa. */
  remainingMs: number;
}

export type Prompt =
  | {
      type: 'focus_end';
      sessionId: string;
      taskId: string;
      taskTitle: string;
      kind: FocusKind;
      endedAt: number;
      record: FocusSession;
    }
  | { type: 'break_end'; sessionId: string; taskId: string; taskTitle: string; phase: BreakPhase; endedAt: number };

export interface PomodoroState {
  v: 1;
  /** No máximo um temporizador ativo por vez. */
  active: TimerSession | null;
  /** Sessão de foco pausada ao trocar de tarefa, para retomar depois. */
  suspended: TimerSession | null;
  /** Aviso de fim que espera uma decisão. Fica salvo até a pessoa responder. */
  prompt: Prompt | null;
  /** Pomodoros completos desde a última pausa longa. */
  cycle: number;
  /** Sessões concluídas que ainda não foram gravadas na conta (sem conexão, por exemplo). */
  outbox: FocusSession[];
}

export const EMPTY_STATE: PomodoroState = { v: 1, active: null, suspended: null, prompt: null, cycle: 0, outbox: [] };

const MAX_OUTBOX = 50;

const sessionShape = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  taskTitle: z.string(),
  phase: z.enum(['focus', 'short_break', 'long_break']),
  kind: z.enum(['pomodoro', 'extra']),
  durationMs: z.number().positive(),
  startedAt: z.number(),
  endsAt: z.number().nullable(),
  remainingMs: z.number().min(0),
});

const recordShape = z.object({
  id: z.string(),
  taskId: z.string(),
  kind: z.enum(['pomodoro', 'extra']),
  durationSeconds: z.number(),
  endedAt: z.string(),
});

const stateShape = z.object({
  v: z.literal(1),
  active: sessionShape.nullable(),
  suspended: sessionShape.nullable(),
  prompt: z
    .discriminatedUnion('type', [
      z.object({
        type: z.literal('focus_end'),
        sessionId: z.string(),
        taskId: z.string(),
        taskTitle: z.string(),
        kind: z.enum(['pomodoro', 'extra']),
        endedAt: z.number(),
        record: recordShape,
      }),
      z.object({
        type: z.literal('break_end'),
        sessionId: z.string(),
        taskId: z.string(),
        taskTitle: z.string(),
        phase: z.enum(['short_break', 'long_break']),
        endedAt: z.number(),
      }),
    ])
    .nullable(),
  cycle: z.number().int().min(0),
  outbox: z.array(recordShape),
});

/** Estado salvo inválido ou de outra versão vira estado vazio, em vez de quebrar a tela. */
export function parseState(raw: unknown): PomodoroState {
  const parsed = stateShape.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_STATE;
}

export function remainingMs(session: TimerSession, now: number): number {
  return session.endsAt === null ? session.remainingMs : Math.max(0, session.endsAt - now);
}

export function isRunning(session: TimerSession | null): boolean {
  return session !== null && session.endsAt !== null;
}

/** Fração já decorrida (0 a 1), para o indicador de progresso. */
export function progress(session: TimerSession, now: number): number {
  return Math.min(1, Math.max(0, 1 - remainingMs(session, now) / session.durationMs));
}

/** mm:ss (ou h:mm:ss), arredondando para cima: "00:00" só quando acabou. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Leitura falada do tempo, para leitores de tela. */
export function describeDuration(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts = [];
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`);
  if (s > 0 || m === 0) parts.push(`${s} ${s === 1 ? 'segundo' : 'segundos'}`);
  return parts.join(' e ');
}

export interface StartInput {
  id: string;
  taskId: string;
  taskTitle: string;
  phase: Phase;
  kind?: FocusKind;
  minutes: number;
}

export function start(state: PomodoroState, input: StartInput, now: number): PomodoroState {
  const durationMs = Math.round(input.minutes * 60_000);
  const session: TimerSession = {
    id: input.id,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    phase: input.phase,
    kind: input.kind ?? 'pomodoro',
    durationMs,
    startedAt: now,
    endsAt: now + durationMs,
    remainingMs: durationMs,
  };
  const startsLongBreak = input.phase === 'long_break';
  return {
    ...state,
    active: session,
    // Uma nova sessão na tarefa que estava guardada substitui a sessão guardada.
    suspended: state.suspended?.taskId === input.taskId ? null : state.suspended,
    prompt: null,
    cycle: startsLongBreak ? 0 : state.cycle,
  };
}

const paused = (session: TimerSession, now: number): TimerSession =>
  session.endsAt === null ? session : { ...session, endsAt: null, remainingMs: remainingMs(session, now) };

export function pause(state: PomodoroState, now: number): PomodoroState {
  if (!state.active || state.active.endsAt === null) return state;
  return { ...state, active: paused(state.active, now) };
}

export function resume(state: PomodoroState, now: number): PomodoroState {
  if (!state.active || state.active.endsAt !== null) return state;
  return { ...state, active: { ...state.active, endsAt: now + state.active.remainingMs } };
}

/** Encerrar antes da hora: nada é registrado (uma sessão interrompida não conta). */
export function stop(state: PomodoroState): PomodoroState {
  return state.active ? { ...state, active: null } : state;
}

/** Trocar de tarefa guardando a sessão de foco atual, pausada, para retomar depois. */
export function suspendActive(state: PomodoroState, now: number): PomodoroState {
  const current = state.active;
  if (!current) return state;
  if (current.phase !== 'focus') return { ...state, active: null };
  return { ...state, active: null, suspended: paused(current, now) };
}

/** Volta à sessão guardada, pausada, para a pessoa retomar quando quiser. */
export function restoreSuspended(state: PomodoroState): PomodoroState {
  if (!state.suspended || state.active) return state;
  return { ...state, active: state.suspended, suspended: null };
}

export function discardSuspended(state: PomodoroState): PomodoroState {
  return state.suspended ? { ...state, suspended: null } : state;
}

export function dismissPrompt(state: PomodoroState): PomodoroState {
  return state.prompt ? { ...state, prompt: null } : state;
}

export function nextBreak(state: PomodoroState, prefs: PomodoroPrefs): { phase: BreakPhase; minutes: number } {
  return state.cycle >= prefs.longBreakEvery
    ? { phase: 'long_break', minutes: prefs.longBreakMinutes }
    : { phase: 'short_break', minutes: prefs.shortBreakMinutes };
}

export interface CompletionResult {
  state: PomodoroState;
  /** Presente só quando esta chamada concluiu a sessão (evita avisar duas vezes). */
  completed: Prompt | null;
}

/**
 * Conclui a sessão ativa se o horário de término já passou. Chamada repetida (ou
 * por outra aba, depois que o estado foi salvo) não tem efeito: devolve `completed: null`.
 * O fim do foco gera um aviso; a tarefa nunca é concluída aqui.
 */
export function completeIfDue(state: PomodoroState, now: number): CompletionResult {
  const session = state.active;
  if (!session || session.endsAt === null || session.endsAt > now) return { state, completed: null };
  const endedAt = session.endsAt;
  if (session.phase === 'focus') {
    const record: FocusSession = {
      id: session.id,
      taskId: session.taskId,
      kind: session.kind,
      durationSeconds: Math.max(60, Math.round(session.durationMs / 1000)),
      endedAt: new Date(endedAt).toISOString(),
    };
    const prompt: Prompt = {
      type: 'focus_end',
      sessionId: session.id,
      taskId: session.taskId,
      taskTitle: session.taskTitle,
      kind: session.kind,
      endedAt,
      record,
    };
    return {
      state: {
        ...state,
        active: null,
        prompt,
        cycle: session.kind === 'pomodoro' ? state.cycle + 1 : state.cycle,
        outbox: [...state.outbox, record].slice(-MAX_OUTBOX),
      },
      completed: prompt,
    };
  }
  const prompt: Prompt = {
    type: 'break_end',
    sessionId: session.id,
    taskId: session.taskId,
    taskTitle: session.taskTitle,
    phase: session.phase,
    endedAt,
  };
  return { state: { ...state, active: null, prompt }, completed: prompt };
}

/** Retira da fila as sessões já gravadas na conta. */
export function clearOutbox(state: PomodoroState, ids: string[]): PomodoroState {
  if (ids.length === 0) return state;
  const done = new Set(ids);
  return { ...state, outbox: state.outbox.filter((r) => !done.has(r.id)) };
}

export interface FocusStats {
  pomodoros: number;
  extras: number;
  extraMinutes: number;
}

export const EMPTY_STATS: FocusStats = { pomodoros: 0, extras: 0, extraMinutes: 0 };

/** Contagem por tarefa, separando Pomodoros completos de tempo extra. Ignora ids repetidos. */
export function statsByTask(sessions: FocusSession[]): Map<string, FocusStats> {
  const seen = new Set<string>();
  const out = new Map<string, FocusStats>();
  for (const s of sessions) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const current = out.get(s.taskId) ?? { ...EMPTY_STATS };
    if (s.kind === 'pomodoro') current.pomodoros += 1;
    else {
      current.extras += 1;
      current.extraMinutes += Math.round(s.durationSeconds / 60);
    }
    out.set(s.taskId, current);
  }
  return out;
}

export function describeStats(stats: FocusStats): string {
  const parts: string[] = [];
  if (stats.pomodoros > 0 || stats.extras === 0) {
    parts.push(`${stats.pomodoros} ${stats.pomodoros === 1 ? 'Pomodoro' : 'Pomodoros'}`);
  }
  if (stats.extras > 0) parts.push(`+${stats.extraMinutes} min extra`);
  return parts.join(' · ');
}
