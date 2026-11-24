// Gera os ícones PNG do aplicativo a partir de SVG, usando o Chromium do Playwright.
// Uso: node scripts/generate-icons.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const check = (stroke) =>
  `<path d="M18 33l9 9 19-21" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;

// Ícone padrão: cantos arredondados. Maskable: fundo cheio, símbolo dentro da zona segura (80%).
const standard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#206A4A"/>${check(7)}</svg>`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#206A4A"/><g transform="translate(9.6 9.6) scale(0.7)">${check(8)}</g></svg>`;
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#206A4A"/><g transform="translate(6.4 6.4) scale(0.8)">${check(7.5)}</g></svg>`;

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, svg: standard },
  { file: 'public/icons/icon-512.png', size: 512, svg: standard },
  { file: 'public/icons/icon-maskable-512.png', size: 512, svg: maskable },
  { file: 'public/icons/apple-touch-icon.png', size: 180, svg: apple },
];

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch();
for (const { file, size, svg } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: file, omitBackground: true });
  await page.close();
  console.log('gerado', file);
}
await browser.close();
