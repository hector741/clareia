import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useCurrentUser } from '../../app/AuthContext';
import { useData } from '../../app/DataContext';
import { setTitlePrefix } from '../../app/documentTitle';
import { useFeedback } from '../../app/feedback';
import { repo, store, toAppError } from '../../db';
import type { FocusKind } from '../../domain/types';
import {
  EMPTY_STATS,
  PHASE_LABELS,
  clearOutbox,
  completeIfDue,
  describeDuration,
  discardSuspended,
  dismissPrompt,
  formatClock,
  nextBreak,
  pause,
  remainingMs,
  restoreSuspended,
  resume,
  start,
  statsByTask,
  stop,
  suspendActive,
  type BreakPhase,
  type FocusStats,
  type PomodoroPrefs,
  type PomodoroState,
  type Prompt,
  type StartInput,
} from './model';
import { showNotification } from './notify';
import { playBell, unlockAudio, unlockOnFirstGesture, type BellResult } from './sound';
import { mutateState, readPrefs, readState, subscribeStorage, writePrefs } from './storage';
import { SwitchTaskDialog, type SwitchRequest } from './SwitchTaskDialog';
import { PomodoroPrompt } from './PomodoroPrompt';

/** Numa aba oculta, espera um pouco além do término para que a aba visível dê o aviso. */
const HIDDEN_GRACE_MS = 1500;
/** Um término mais antigo que isso aconteceu com a página fechada: aparece sem tocar o sino. */
const LATE_MS = 2 * 60_000;
/** Sessões recém-concluídas contam na tela mesmo antes de a conta confirmar a gravação. */
const RECENT_MS = 15 * 60_000;

export interface FocusOptions {
  minutes?: number;
  kind?: FocusKind;
}

interface TaskRef {
  id: string;
  title: string;
}

export interface PomodoroApi {
  state: PomodoroState;
  prefs: PomodoroPrefs;
  setPrefs(patch: Partial<PomodoroPrefs>): void;
  statsFor(taskId: string): FocusStats;
  /** Resultado do último sino tocado nesta aba, por sessão. */
  bell: { sessionId: string; result: BellResult } | null;
  /** Inicia foco na tarefa. Se outra tarefa estiver em foco, pergunta antes de trocar. */
  startFocus(task: TaskRef, options?: FocusOptions): void;
  startBreak(task: TaskRef, phase?: BreakPhase): void;
  pause(): void;
  resume(): void;
  stop(): void;
  restoreSuspended(): void;
  discardSuspended(): void;
  dismissPrompt(): void;
  previewBell(): Promise<BellResult>;
  /** Mensagem para leitores de tela (início, pausa, retomada, fim). */
  announce(message: string): void;
}

const PomodoroContext = createContext<PomodoroApi | null>(null);

export function usePomodoro(): PomodoroApi {
  const value = useContext(PomodoroContext);
  if (!value) throw new Error('usePomodoro fora do PomodoroProvider');
  return value;
}

const newId = () => crypto.randomUUID();

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const { id: userId } = useCurrentUser();
  const { focusSessions } = useData();
  const feedback = useFeedback();
  const [state, setState] = useState<PomodoroState>(() => readState(userId));
  const [prefs, setPrefsState] = useState<PomodoroPrefs>(readPrefs);
  const [bell, setBell] = useState<PomodoroApi['bell']>(null);
  const [switchRequest, setSwitchRequest] = useState<SwitchRequest | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const stateRef = useRef(state);
  const prefsRef = useRef(prefs);
  stateRef.current = state;
  prefsRef.current = prefs;

  const announce = useCallback((message: string) => {
    // Limpa antes, para que a mesma frase seja anunciada de novo.
    setLiveMessage('');
    window.setTimeout(() => setLiveMessage(message), 50);
  }, []);

  useEffect(() => unlockOnFirstGesture(), []);

  useEffect(
    () =>
      subscribeStorage(
        userId,
        (next) => {
          const before = stateRef.current;
          setState(next);
          // Outra aba gravou uma sessão na conta: busca para a contagem desta aba ficar igual.
          if (next.outbox.length < before.outbox.length || (before.prompt && !next.prompt)) {
            void repo.refresh().catch(() => undefined);
          }
        },
        (next) => setPrefsState(next),
      ),
    [userId],
  );

  const apply = useCallback(
    async (fn: (s: PomodoroState, now: number) => PomodoroState) => {
      const { state: next } = await mutateState(userId, (s) => ({ state: fn(s, Date.now()), result: null }));
      setState(next);
      return next;
    },
    [userId],
  );

  /* --------------------------------------------- Gravação das sessões na conta */

  const flushing = useRef(false);
  const flushOutbox = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const done: string[] = [];
      for (const record of readState(userId).outbox) {
        if (!store.getTask(record.taskId)) {
          // A tarefa foi excluída: não há onde registrar.
          done.push(record.id);
          continue;
        }
        try {
          await repo.recordFocusSession(record);
          done.push(record.id);
        } catch (error) {
          const code = toAppError(error).code;
          if (code === 'not_found' || code === 'validation') done.push(record.id);
          else break;
        }
      }
      if (done.length > 0) await apply((s) => clearOutbox(s, done));
    } finally {
      flushing.current = false;
    }
  }, [apply, userId]);

  useEffect(() => {
    void flushOutbox();
    const onOnline = () => void flushOutbox();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushOutbox]);

  /* ----------------------------------------------------- Fim de uma etapa */

  const onCompleted = useCallback(
    async (prompt: Prompt) => {
      const focusEnded = prompt.type === 'focus_end';
      const title = focusEnded ? 'O tempo de foco terminou' : 'A pausa terminou';
      const body = focusEnded
        ? `${prompt.taskTitle}: você concluiu esta tarefa?`
        : `Você pode retomar a tarefa: ${prompt.taskTitle}`;
      announce(`${title}. ${body}`);
      if (focusEnded) void flushOutbox();

      const late = Date.now() - prompt.endedAt > LATE_MS;
      const p = prefsRef.current;
      if (!late) {
        const result = await playBell(p.volume, p.muted);
        setBell({ sessionId: prompt.sessionId, result });
      }
      if (p.notifications && document.visibilityState !== 'visible') void showNotification(title, body);
    },
    [announce, flushOutbox],
  );

  const check = useCallback(async () => {
    const hidden = document.visibilityState !== 'visible';
    const { state: next, result } = await mutateState(userId, (s) => {
      const now = Date.now();
      const endsAt = s.active?.endsAt ?? null;
      if (hidden && endsAt !== null && now < endsAt + HIDDEN_GRACE_MS) return { state: s, result: null };
      const r = completeIfDue(s, now);
      return { state: r.state, result: r.completed };
    });
    setState(next);
    // Só a aba que concluiu a sessão (sob a trava) toca o sino e registra.
    if (result) void onCompleted(result);
  }, [onCompleted, userId]);

  const active = state.active;
  useEffect(() => {
    if (!active) {
      setTitlePrefix(null);
      return;
    }
    if (active.endsAt === null) {
      setTitlePrefix(`Pausado ${formatClock(active.remainingMs)}`);
      return () => setTitlePrefix(null);
    }
    const endsAt = active.endsAt;
    const label = active.phase === 'focus' ? 'Foco' : 'Pausa';
    // O título com o tempo também evita que o navegador adie os temporizadores da aba oculta.
    const tick = () => {
      const now = Date.now();
      setTitlePrefix(`${formatClock(endsAt - now)} ${label}`);
      if (now >= endsAt) void check();
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    const timeout = window.setTimeout(() => void check(), Math.max(0, endsAt - Date.now()) + 30);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', tick);
      setTitlePrefix(null);
    };
  }, [active, check]);

  /* ------------------------------------------------------------- Ações */

  const begin = useCallback(
    (input: Omit<StartInput, 'id'>, prepare?: (s: PomodoroState, now: number) => PomodoroState) => {
      unlockAudio();
      void apply((s, now) => start(prepare ? prepare(s, now) : s, { ...input, id: newId() }, now)).then(() => {
        const what = input.phase === 'focus' ? 'Foco iniciado' : `${PHASE_LABELS[input.phase]} iniciada`;
        announce(`${what}: ${input.taskTitle}, ${describeDuration(input.minutes * 60_000)}.`);
      });
    },
    [announce, apply],
  );

  const focusInput = useCallback(
    (task: TaskRef, options?: FocusOptions): Omit<StartInput, 'id'> => ({
      taskId: task.id,
      taskTitle: task.title,
      phase: 'focus',
      kind: options?.kind ?? 'pomodoro',
      minutes: options?.minutes ?? prefsRef.current.focusMinutes,
    }),
    [],
  );

  const startFocus = useCallback<PomodoroApi['startFocus']>(
    (task, options) => {
      unlockAudio();
      const s = stateRef.current;
      const current = s.active;
      if (current && current.phase === 'focus') {
        if (current.taskId === task.id) {
          if (current.endsAt === null) {
            void apply(resume);
            announce('Foco retomado.');
          } else {
            feedback.info('Esta tarefa já está em foco.');
          }
          return;
        }
        setSwitchRequest({ task, options, current, replacesSuspended: s.suspended !== null });
        return;
      }
      if (!current && !options && s.suspended?.taskId === task.id) {
        void apply((x, now) => resume(restoreSuspended(x), now));
        announce(`Foco retomado: ${task.title}.`);
        return;
      }
      begin(focusInput(task, options));
    },
    [announce, apply, begin, feedback, focusInput],
  );

  const api = useMemo<PomodoroApi>(() => {
    const recentCutoff = Date.now() - RECENT_MS;
    const pendingRecords = state.outbox;
    const recent = state.prompt?.type === 'focus_end' ? [state.prompt.record] : [];
    const stats = statsByTask([
      ...focusSessions,
      ...pendingRecords,
      ...recent.filter((r) => Date.parse(r.endedAt) > recentCutoff),
    ]);
    return {
      state,
      prefs,
      bell,
      setPrefs(patch) {
        const next = { ...prefsRef.current, ...patch };
        writePrefs(next);
        setPrefsState(next);
      },
      statsFor: (taskId) => stats.get(taskId) ?? EMPTY_STATS,
      startFocus,
      startBreak(task, phase) {
        const suggested = nextBreak(stateRef.current, prefsRef.current);
        const chosen = phase ?? suggested.phase;
        const minutes = chosen === 'long_break' ? prefsRef.current.longBreakMinutes : prefsRef.current.shortBreakMinutes;
        begin({ taskId: task.id, taskTitle: task.title, phase: chosen, minutes });
      },
      pause() {
        void apply(pause);
        announce('Temporizador pausado.');
      },
      resume() {
        unlockAudio();
        void apply(resume);
        announce('Temporizador retomado.');
      },
      stop() {
        void apply(stop);
        announce('Sessão encerrada.');
      },
      restoreSuspended() {
        unlockAudio();
        void apply((s, now) => resume(restoreSuspended(s), now));
        announce('Foco retomado.');
      },
      discardSuspended() {
        void apply(discardSuspended);
      },
      dismissPrompt() {
        void apply(dismissPrompt);
      },
      previewBell() {
        unlockAudio();
        return playBell(prefsRef.current.volume, false);
      },
      announce,
    };
  }, [state, prefs, bell, focusSessions, startFocus, begin, apply, announce]);

  const visible = state.active !== null || state.suspended !== null;
  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.dataset.timer = 'on';
    else delete root.dataset.timer;
    return () => {
      delete root.dataset.timer;
    };
  }, [visible]);

  const confirmSwitch = (mode: 'pause' | 'end') => {
    const request = switchRequest;
    setSwitchRequest(null);
    if (!request) return;
    begin(focusInput(request.task, request.options), (s, now) => (mode === 'pause' ? suspendActive(s, now) : stop(s)));
    if (mode === 'pause') {
      feedback.info(`O foco em "${request.current.taskTitle}" ficou pausado. Retome quando quiser.`);
    }
  };

  return (
    <PomodoroContext.Provider value={api}>
      {children}
      <PomodoroPrompt />
      <SwitchTaskDialog
        request={switchRequest}
        remaining={switchRequest ? remainingMs(switchRequest.current, Date.now()) : 0}
        onPause={() => confirmSwitch('pause')}
        onEnd={() => confirmSwitch('end')}
        onCancel={() => setSwitchRequest(null)}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>
    </PomodoroContext.Provider>
  );
}
