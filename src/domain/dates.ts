import type { DateString } from './types';

/**
 * Datas civis (YYYY-MM-DD) tratadas como texto/componentes, nunca como instantes UTC.
 * Todas as conversões de/para Date usam componentes locais ou aritmética UTC explícita.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateString(value: string): { year: number; month: number; day: number } | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000) return null;
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/** Valida formato e existência real da data (ex.: 2026-02-30 é inválida). */
export function isValidDateString(value: unknown): value is DateString {
  return typeof value === 'string' && parseDateString(value) !== null;
}

function pad(n: number, size = 2): string {
  return String(n).padStart(size, '0');
}

export function formatDateParts(year: number, month: number, day: number): DateString {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/**
 * Data civil de um instante. Sem fuso: usa o fuso local do navegador.
 * Com `timeZone` (IANA): usa esse fuso (útil em testes e verificações).
 */
export function localDateOf(instant: Date, timeZone?: string): DateString {
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  return formatDateParts(instant.getFullYear(), instant.getMonth() + 1, instant.getDate());
}

export function todayLocal(now: Date = new Date(), timeZone?: string): DateString {
  return localDateOf(now, timeZone);
}

function toUtcDay(value: DateString): number {
  const parts = parseDateString(value);
  if (!parts) throw new Error(`Data inválida: ${value}`);
  const d = new Date(0);
  d.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  return d.getTime();
}

export function addDays(value: DateString, days: number): DateString {
  const d = new Date(toUtcDay(value));
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Diferença em dias inteiros: a - b. */
export function diffDays(a: DateString, b: DateString): number {
  return Math.round((toUtcDay(a) - toUtcDay(b)) / 86_400_000);
}

export function compareDates(a: DateString, b: DateString): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ordem crescente com ausentes por último. */
export function compareNullableDates(a: DateString | null, b: DateString | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareDates(a, b);
}

function civilToLocalNoon(value: DateString): Date {
  const parts = parseDateString(value);
  if (!parts) throw new Error(`Data inválida: ${value}`);
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
}

const longFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
const shortYearFormatter = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
const dayMonthFormatter = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
const instantFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Ex.: "terça-feira, 24 de novembro". */
export function formatLongDate(value: DateString): string {
  return longFormatter.format(civilToLocalNoon(value));
}

/** Ex.: "ter., 24 de nov." (com ano quando difere do ano de `today`). */
export function formatShortDate(value: DateString, today: DateString): string {
  const date = civilToLocalNoon(value);
  if (value.slice(0, 4) !== today.slice(0, 4)) return shortYearFormatter.format(date);
  return shortFormatter.format(date);
}

/** Ex.: "24 de nov." sem dia da semana. */
export function formatDayMonth(value: DateString, today: DateString): string {
  const date = civilToLocalNoon(value);
  if (value.slice(0, 4) !== today.slice(0, 4)) return shortYearFormatter.format(date);
  return dayMonthFormatter.format(date);
}

export function formatRelativeDate(value: DateString, today: DateString): string {
  const delta = diffDays(value, today);
  if (delta === 0) return 'hoje';
  if (delta === 1) return 'amanhã';
  if (delta === -1) return 'ontem';
  return formatShortDate(value, today);
}

/** Cabeçalho de grupo: "Hoje", "Amanhã" ou data longa. */
export function formatGroupDate(value: DateString, today: DateString): string {
  const delta = diffDays(value, today);
  const long = formatShortDate(value, today);
  if (delta === 0) return `Hoje · ${long}`;
  if (delta === 1) return `Amanhã · ${long}`;
  if (delta === -1) return `Ontem · ${long}`;
  return long;
}

export function formatInstant(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return instantFormatter.format(d);
}

/** Milissegundos até a próxima meia-noite local (mínimo 1 s). */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}
