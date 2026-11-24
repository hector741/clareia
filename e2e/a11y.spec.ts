import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addDays, todayLocal } from '../src/domain/dates';

const today = todayLocal(new Date(), 'America/Sao_Paulo');
const id = () => crypto.randomUUID();
const ts = '2026-11-20T12:00:00.000Z';

function task(over: Record<string, unknown>) {
  return {
    id: id(), title: 'x', description: '', listId: null, priority: 'normal', status: 'pending',
    plannedDate: null, dueDate: null, focusDate: null, position: Math.random(), subtasks: [],
    createdAt: ts, updatedAt: ts, completedAt: null, completedOn: null, deletedAt: null, ...over,
  };
}

const work = { id: id(), name: 'Trabalho', color: 'blue', position: 1, createdAt: ts, updatedAt: ts };
const step = (title: string, completed: boolean, position: number) => ({ id: id(), title, completed, position });

const backup = {
  app: 'clareia', schemaVersion: 1, exportedAt: ts, settings: { id: 'app', schemaVersion: 1 },
  lists: [work],
  tasks: [
    task({ title: 'Enviar proposta', listId: work.id, priority: 'high', focusDate: today, plannedDate: today, dueDate: addDays(today, -2), subtasks: [step('Revisar', true, 1), step('Enviar', false, 2)] }),
    task({ title: 'Pagar conta', dueDate: addDays(today, -1) }),
    task({ title: 'Organizar estante', plannedDate: addDays(today, -3), dueDate: addDays(today, 10) }),
    task({ title: 'Planejar viagem', plannedDate: addDays(today, 3) }),
    task({ title: 'Reunião semanal', status: 'completed', completedAt: ts, completedOn: today }),
    task({ title: 'Excluída', deletedAt: ts }),
  ],
};

async function seed(page: Page) {
  await page.goto('/#/configuracoes');
  await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('button', { name: 'Substituir dados deste navegador' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await page.getByText('Dados restaurados.').waitFor();
  await page.getByRole('button', { name: 'Dispensar mensagem' }).click();
}

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`);
  expect(summary, `Violações de acessibilidade em ${label}`).toEqual([]);
}

const routes = ['hoje', 'entrada', 'proximas', 'todas', 'busca', 'concluidas', 'lixeira', 'configuracoes'];

for (const [w, h] of [[1440, 900], [360, 800]] as const) {
  test(`axe: telas em ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seed(page);
    for (const r of routes) {
      await page.goto(`/#/${r}`);
      await page.waitForTimeout(250);
      await scan(page, `${r} (${w}px)`);
    }
    await page.goto('/#/hoje');
    await page.getByRole('button', { name: 'Ações para a tarefa: Enviar proposta' }).click();
    await scan(page, `menu da tarefa (${w}px)`);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Abrir tarefa: Enviar proposta' }).click();
    await page.getByRole('dialog', { name: 'Editar tarefa' }).waitFor();
    await page.waitForTimeout(300);
    await scan(page, `editor (${w}px)`);
    await page.keyboard.press('Escape');
    await page.goto('/#/configuracoes');
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.getByRole('alertdialog').waitFor();
    await scan(page, `confirmação de restauração (${w}px)`);
  });
}
