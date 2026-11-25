import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`);
  expect(summary, `Violações de acessibilidade em ${label}`).toEqual([]);
}

const screens = ['/#/compras', '/#/compras/historico', '/#/compras/produtos'];

for (const [w, h] of [[360, 800], [768, 1024], [1440, 900]] as const) {
  test(`axe: telas de Compras em ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const route of screens) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(250);
      await scan(page, `${route} (${w}px)`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `Rolagem horizontal em ${route} (${w}px)`).toBeLessThanOrEqual(0);
    }
  });
}

test('fluxo integrado: mercado, lista, carrinho, preço confirmado, compra registrada e histórico', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/#/compras/produtos');
  await page.getByLabel('Nome do mercado').fill('Mercado Central');
  await page.getByRole('button', { name: 'Cadastrar mercado' }).click();
  await expect(page.getByText('Mercado cadastrado.')).toBeVisible();

  await page.goto('/#/compras');
  await page.getByRole('main').getByRole('button', { name: 'Nova lista' }).first().click();
  const listDialog = page.getByRole('dialog');
  await listDialog.getByLabel('Mercado', { exact: true }).selectOption({ label: 'Mercado Central' });
  await listDialog.getByLabel('Orçamento (R$)').fill('50,00');
  await listDialog.getByRole('button', { name: 'Criar lista' }).click();
  await expect(page).toHaveURL(/#\/compras\/listas\/[0-9a-f-]+$/);

  await page.getByRole('region', { name: 'Adicionar item' }).getByRole('button', { name: 'Com detalhes' }).click();
  const itemDialog = page.getByRole('dialog');
  await itemDialog.getByLabel('Nome do item').fill('Café');
  await itemDialog.getByLabel('Embalagem').selectOption({ label: 'Nova embalagem…' });
  await itemDialog.getByLabel('Conteúdo do pacote').fill('500 g');
  await itemDialog.getByLabel('Quantidade', { exact: false }).fill('3');
  await itemDialog.getByLabel('Preço estimado por unidade de venda (R$)').fill('4,99');
  await itemDialog.getByRole('button', { name: 'Adicionar item', exact: true }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'Café' }).first();
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'Ir às compras' }).click();
  await row.getByRole('checkbox').check();
  await row.getByRole('button', { name: 'Informar preço' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar preço' }).click();

  await page.getByRole('button', { name: 'Revisar e finalizar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar compra' }).click();
  await expect(page).toHaveURL(/#\/compras\/historico$/);

  await expect(page.getByRole('list', { name: 'Compras' })).toContainText('Mercado Central');
  await expect(page.getByRole('list', { name: 'Compras' })).toContainText('R$ 14,97');
});

test('a aba Compras aparece na navegação do celular e abre a tela', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/hoje');
  const nav = page.getByRole('navigation').last();
  await nav.getByRole('link', { name: 'Compras' }).click();
  await expect(page).toHaveURL(/#\/compras$/);
});
