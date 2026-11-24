import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  EMPTY_STATE,
  completeIfDue,
  describeStats,
  formatClock,
  nextBreak,
  parsePrefs,
  parseState,
  pause,
  progress,
  remainingMs,
  restoreSuspended,
  resume,
  start,
  statsByTask,
  stop,
  suspendActive,
  type PomodoroState,
} from './model';

const MIN = 60_000;
const T0 = Date.parse('2026-11-24T14:00:00.000Z');

const focus = (state: PomodoroState = EMPTY_STATE, over: Partial<Parameters<typeof start>[1]> = {}, now = T0) =>
  start(state, { id: 's1', taskId: 'task-a', taskTitle: 'Relatório', phase: 'focus', minutes: 25, ...over }, now);

describe('temporizador', () => {
  it('calcula o tempo restante pelo horário de término, não por contagem', () => {
    const s = focus();
    expect(s.active?.endsAt).toBe(T0 + 25 * MIN);
    expect(remainingMs(s.active!, T0 + 10 * MIN)).toBe(15 * MIN);
    // Mesmo que nenhum "tick" tenha acontecido (aba suspensa), o valor é exato.
    expect(remainingMs(s.active!, T0 + 24 * MIN + 59_500)).toBe(500);
    expect(remainingMs(s.active!, T0 + 99 * MIN)).toBe(0);
    expect(progress(s.active!, T0 + 5 * MIN)).toBeCloseTo(0.2);
  });

  it('pausa congela o restante e retomar recalcula o término', () => {
    const paused = pause(focus(), T0 + 10 * MIN);
    expect(paused.active?.endsAt).toBeNull();
    expect(remainingMs(paused.active!, T0 + 50 * MIN)).toBe(15 * MIN);
    const resumed = resume(paused, T0 + 40 * MIN);
    expect(resumed.active?.endsAt).toBe(T0 + 55 * MIN);
    // Pausar duas vezes ou retomar o que já corre não muda nada.
    expect(pause(paused, T0 + 20 * MIN)).toBe(paused);
    expect(resume(resumed, T0 + 41 * MIN)).toBe(resumed);
  });

  it('formata minutos e segundos arredondando para cima', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(61_001)).toBe('01:02');
    expect(formatClock(400)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(90 * MIN)).toBe('1:30:00');
  });
});

describe('fim de uma sessão', () => {
  it('só conclui quando o horário passou, e apenas uma vez', () => {
    const s = focus();
    expect(completeIfDue(s, T0 + 24 * MIN).completed).toBeNull();
    const first = completeIfDue(s, T0 + 25 * MIN);
    expect(first.completed?.type).toBe('focus_end');
    expect(first.state.active).toBeNull();
    // Outra aba (ou outro tick) que leia o estado salvo não gera um segundo aviso.
    const second = completeIfDue(first.state, T0 + 26 * MIN);
    expect(second.completed).toBeNull();
    expect(second.state).toBe(first.state);
  });

  it('o fim do foco registra a sessão e pede uma decisão, sem concluir a tarefa', () => {
    const { state, completed } = completeIfDue(focus(), T0 + 30 * MIN);
    expect(completed).toMatchObject({ type: 'focus_end', taskId: 'task-a', kind: 'pomodoro', endedAt: T0 + 25 * MIN });
    expect(state.prompt).toEqual(completed);
    expect(state.outbox).toEqual([
      { id: 's1', taskId: 'task-a', kind: 'pomodoro', durationSeconds: 1500, endedAt: '2026-11-24T14:25:00.000Z' },
    ]);
    expect(state.cycle).toBe(1);
  });

  it('pausa não termina: uma sessão pausada nunca vence', () => {
    const paused = pause(focus(), T0 + MIN);
    expect(completeIfDue(paused, T0 + 999 * MIN).completed).toBeNull();
  });

  it('tempo extra é registrado à parte e não avança o ciclo', () => {
    const { state } = completeIfDue(focus(EMPTY_STATE, { kind: 'extra', minutes: 10 }), T0 + 10 * MIN);
    expect(state.outbox[0]).toMatchObject({ kind: 'extra', durationSeconds: 600 });
    expect(state.cycle).toBe(0);
  });

  it('o fim de uma pausa avisa que dá para retomar', () => {
    const s = start(EMPTY_STATE, { id: 'b1', taskId: 'task-a', taskTitle: 'Relatório', phase: 'short_break', minutes: 5 }, T0);
    const { state, completed } = completeIfDue(s, T0 + 5 * MIN);
    expect(completed).toMatchObject({ type: 'break_end', phase: 'short_break' });
    expect(state.outbox).toHaveLength(0);
  });

  it('encerrar antes da hora não registra nada', () => {
    const s = stop(focus());
    expect(s.active).toBeNull();
    expect(s.outbox).toHaveLength(0);
    expect(s.cycle).toBe(0);
  });
});

describe('ciclo de pausas', () => {
  it('sugere pausa longa depois de quatro Pomodoros e recomeça a contagem', () => {
    let s: PomodoroState = EMPTY_STATE;
    for (let i = 0; i < 4; i += 1) {
      expect(nextBreak(s, DEFAULT_PREFS)).toEqual({ phase: 'short_break', minutes: 5 });
      s = completeIfDue(focus(s, { id: `f${i}` }, T0), T0 + 25 * MIN).state;
    }
    expect(nextBreak(s, DEFAULT_PREFS)).toEqual({ phase: 'long_break', minutes: 15 });
    s = start(s, { id: 'lb', taskId: 'task-a', taskTitle: 'Relatório', phase: 'long_break', minutes: 15 }, T0);
    expect(s.cycle).toBe(0);
  });
});

describe('troca de tarefa', () => {
  it('pausar e trocar guarda a sessão atual para retomar depois', () => {
    const running = focus();
    const switched = start(
      suspendActive(running, T0 + 5 * MIN),
      { id: 's2', taskId: 'task-b', taskTitle: 'E-mails', phase: 'focus', minutes: 25 },
      T0 + 5 * MIN,
    );
    expect(switched.active?.taskId).toBe('task-b');
    expect(switched.suspended).toMatchObject({ id: 's1', taskId: 'task-a', endsAt: null, remainingMs: 20 * MIN });

    const back = restoreSuspended(stop(switched));
    expect(back.active).toMatchObject({ id: 's1', endsAt: null });
    expect(back.suspended).toBeNull();
  });

  it('uma pausa em andamento não é guardada ao trocar', () => {
    const s = start(EMPTY_STATE, { id: 'b', taskId: 'task-a', taskTitle: 'R', phase: 'short_break', minutes: 5 }, T0);
    expect(suspendActive(s, T0 + MIN)).toMatchObject({ active: null, suspended: null });
  });

  it('iniciar um novo foco descarta o aviso pendente', () => {
    const ended = completeIfDue(focus(), T0 + 25 * MIN).state;
    expect(ended.prompt).not.toBeNull();
    expect(focus(ended, { id: 's9' }, T0 + 26 * MIN).prompt).toBeNull();
  });
});

describe('estado salvo e preferências', () => {
  it('estado salvo inválido vira estado vazio', () => {
    expect(parseState(null)).toEqual(EMPTY_STATE);
    expect(parseState({ v: 2 })).toEqual(EMPTY_STATE);
    const s = focus();
    expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('preferências fora do limite voltam ao padrão, campo a campo', () => {
    expect(parsePrefs({ focusMinutes: 50, shortBreakMinutes: 0, volume: 3, muted: true })).toEqual({
      ...DEFAULT_PREFS,
      focusMinutes: 50,
      muted: true,
    });
    expect(parsePrefs('lixo')).toEqual(DEFAULT_PREFS);
  });
});

describe('estatísticas', () => {
  it('separa Pomodoros completos de tempo extra e ignora repetidos', () => {
    const base = { taskId: 'a', endedAt: '2026-11-24T14:25:00.000Z' };
    const stats = statsByTask([
      { ...base, id: '1', kind: 'pomodoro', durationSeconds: 1500 },
      { ...base, id: '1', kind: 'pomodoro', durationSeconds: 1500 },
      { ...base, id: '2', kind: 'pomodoro', durationSeconds: 1500 },
      { ...base, id: '3', kind: 'extra', durationSeconds: 600 },
      { ...base, id: '4', kind: 'extra', durationSeconds: 300 },
      { ...base, id: '5', taskId: 'b', kind: 'pomodoro', durationSeconds: 1500 },
    ]);
    expect(stats.get('a')).toEqual({ pomodoros: 2, extras: 2, extraMinutes: 15 });
    expect(describeStats(stats.get('a')!)).toBe('2 Pomodoros · +15 min extra');
    expect(describeStats({ pomodoros: 1, extras: 0, extraMinutes: 0 })).toBe('1 Pomodoro');
    expect(describeStats({ pomodoros: 0, extras: 1, extraMinutes: 5 })).toBe('+5 min extra');
  });
});
