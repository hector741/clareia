import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`Token --${name} não encontrado em tokens.css`);
  return match[1];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_AA = 4.5;
const UI_AA = 3;

describe('contraste dos tokens (WCAG 2.x)', () => {
  const t = (n: string) => token(n);
  const text: [string, string, string][] = [
    ['texto sobre fundo', 'color-text', 'color-bg'],
    ['texto sobre superfície', 'color-text', 'color-surface'],
    ['texto sobre foco', 'color-text', 'color-focus-bg'],
    ['texto secundário sobre fundo', 'color-text-secondary', 'color-bg'],
    ['texto secundário sobre superfície', 'color-text-secondary', 'color-surface'],
    ['texto secundário sobre foco', 'color-text-secondary', 'color-focus-bg'],
    ['botão principal', 'color-primary-contrast', 'color-primary'],
    ['botão principal (hover)', 'color-primary-contrast', 'color-primary-hover'],
    ['ação primária como texto sobre superfície', 'color-primary', 'color-surface'],
    ['ação primária como texto sobre foco', 'color-primary', 'color-focus-bg'],
    ['ação primária como texto sobre fundo', 'color-primary', 'color-bg'],
    ['atenção', 'color-warning', 'color-warning-bg'],
    ['prazo vencido', 'color-danger', 'color-danger-bg'],
    ['destrutivo como texto sobre superfície', 'color-danger', 'color-surface'],
    ['botão destrutivo', 'color-surface', 'color-danger'],
    ['botão destrutivo (hover)', 'color-surface', 'color-danger-hover'],
    ['título de grupo de atenção sobre fundo', 'color-warning', 'color-bg'],
    ['título de grupo vencido sobre fundo', 'color-danger', 'color-bg'],
  ];
  for (const [label, fg, bg] of text) {
    it(`${label}: ≥ ${TEXT_AA}:1`, () => {
      expect(contrast(t(fg), t(bg))).toBeGreaterThanOrEqual(TEXT_AA);
    });
  }

  const ui: [string, string, string][] = [
    ['borda de campos sobre superfície', 'color-border-strong', 'color-surface'],
    ['borda de campos sobre fundo', 'color-border-strong', 'color-bg'],
    ['anel de foco sobre fundo', 'color-primary', 'color-bg'],
    ['anel de foco sobre superfície', 'color-primary', 'color-surface'],
    ['anel de foco sobre foco', 'color-primary', 'color-focus-bg'],
    ['marcador verde', 'list-green', 'color-surface'],
    ['marcador azul', 'list-blue', 'color-surface'],
    ['marcador violeta', 'list-violet', 'color-surface'],
    ['marcador âmbar', 'list-amber', 'color-surface'],
    ['marcador rosa', 'list-pink', 'color-surface'],
    ['marcador cinza', 'list-gray', 'color-surface'],
  ];
  for (const [label, fg, bg] of ui) {
    it(`${label}: ≥ ${UI_AA}:1`, () => {
      expect(contrast(t(fg), t(bg))).toBeGreaterThanOrEqual(UI_AA);
    });
  }
});
