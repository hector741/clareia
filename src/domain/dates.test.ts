import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  formatLongDate,
  formatRelativeDate,
  isValidDateString,
  localDateOf,
  todayLocal,
} from './dates';

describe('datas civis', () => {
  it('valida datas reais e rejeita impossíveis', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2026-02-29')).toBe(false);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-1-01')).toBe(false);
    expect(isValidDateString('2026-04-31')).toBe(false);
    expect(isValidDateString(20260101)).toBe(false);
    expect(isValidDateString(null)).toBe(false);
  });

  it('calcula "hoje" no fuso de São Paulo, não em UTC', () => {
    // 02:30 UTC de 1/mar ainda é 28/fev (23:30) em São Paulo (UTC-3).
    const instant = new Date('2026-03-01T02:30:00.000Z');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(localDateOf(instant, 'America/Sao_Paulo')).toBe('2026-02-28');
    expect(todayLocal(instant, 'America/Sao_Paulo')).toBe('2026-02-28');
    // 23:30 de 31/dez em SP = 02:30 UTC de 1/jan.
    expect(localDateOf(new Date('2027-01-01T02:30:00.000Z'), 'America/Sao_Paulo')).toBe('2026-12-31');
  });

  it('usa componentes locais quando não há fuso explícito', () => {
    const d = new Date(2026, 10, 24, 23, 59, 0);
    expect(todayLocal(d)).toBe('2026-11-24');
    const e = new Date(2026, 11, 31, 0, 1, 0);
    expect(todayLocal(e)).toBe('2026-12-31');
  });

  it('soma e compara dias na virada de mês e ano', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(diffDays('2027-01-01', '2026-12-31')).toBe(1);
    expect(diffDays('2026-11-24', '2026-11-20')).toBe(4);
  });

  it('formata datas em pt-BR sem deslocar o dia por fuso', () => {
    expect(formatLongDate('2026-11-24')).toBe('terça-feira, 24 de novembro');
    expect(formatLongDate('2026-12-01')).toBe('terça-feira, 1 de dezembro');
    expect(formatRelativeDate('2026-11-24', '2026-11-24')).toBe('hoje');
    expect(formatRelativeDate('2026-11-25', '2026-11-24')).toBe('amanhã');
    expect(formatRelativeDate('2026-11-23', '2026-11-24')).toBe('ontem');
  });
});
