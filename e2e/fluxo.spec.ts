import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { readFileSync } from 'node:fs';

const quickAdd = (page: Page) => page.getByRole('textbox', { name: 'Nova tarefa' });

async function addQuick(page: Page, title: string) {
  await quickAdd(page).fill(title);
  await quickAdd(page).press('Enter');
  await expect(page.getByRole('button', { name: `Abrir tarefa: ${title}` })).toBeVisible();
}

test.describe('Clareia - fluxo principal', () => {
  test('captura, lista, etapas, foco, conclusão, histórico, lixeira e backup', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/#\/hoje$/);

    // Primeiro acesso: estado vazio útil, sem dados fictícios.
    await expect(page.getByRole('heading', { name: 'Comece com a sua primeira tarefa' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Abrir tarefa' })).toHaveCount(0);

    // Texto vazio é recusado.
    await quickAdd(page).press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: 'Escreva um título' })).toBeVisible();

    // Enter cria com apenas o título e o campo fica pronto.
    await addQuick(page, 'Reunião com o time');
    await expect(quickAdd(page)).toHaveValue('');
    await expect(quickAdd(page)).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Para hoje' })).toBeVisible();

    // Criar lista (nome + cor).
    await page.getByRole('button', { name: 'Nova lista' }).click();
    const listDialog = page.getByRole('dialog', { name: 'Nova lista' });
    await listDialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(listDialog.getByText('Escreva um nome para a lista.')).toBeVisible();
    await listDialog.getByLabel('Nome da lista').fill('Estudos');
    await listDialog.getByRole('radio', { name: 'Azul' }).check();
    await listDialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/#\/listas\/.+/);
    await expect(page.getByRole('heading', { level: 1, name: 'Estudos' })).toBeVisible();

    // Tarefa na lista, via captura rápida.
    await addQuick(page, 'Ler capítulo');

    // Editor: etapas, datas, salvar.
    await page.getByRole('button', { name: 'Abrir tarefa: Ler capítulo' }).click();
    const editor = page.getByRole('dialog', { name: 'Editar tarefa' });
    await expect(editor.getByLabel('Título', { exact: true })).toBeFocused();
    await editor.getByLabel('Nova etapa').fill('Introdução');
    await editor.getByLabel('Nova etapa').press('Enter');
    await editor.getByLabel('Nova etapa').fill('Exercícios');
    await editor.getByRole('button', { name: 'Adicionar etapa' }).click();
    await editor.getByRole('checkbox', { name: 'Etapa 1 concluída' }).click();
    await editor.getByRole('group', { name: 'Atalhos para Fazer em' }).getByRole('button', { name: 'Hoje' }).click();
    await editor.getByRole('group', { name: 'Atalhos para Prazo' }).getByRole('button', { name: 'Amanhã' }).click();
    await editor.getByRole('combobox', { name: 'Prioridade' }).selectOption('high');
    await editor.getByRole('button', { name: 'Salvar' }).click();
    await expect(editor).toBeHidden();
    const row = page.getByRole('listitem').filter({ hasText: 'Ler capítulo' });
    await expect(row).toContainText('1 de 2 etapas');
    await expect(row).toContainText('Fazer em: hoje');
    await expect(row).toContainText('Prazo: amanhã');
    await expect(row).toContainText('Prioridade alta');
    // Foco devolvido ao controle de origem.
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Ler capítulo' })).toBeFocused();

    // Fechar com alterações pede decisão explícita.
    await page.getByRole('button', { name: 'Abrir tarefa: Ler capítulo' }).click();
    await editor.getByLabel('Título', { exact: true }).fill('Ler capítulo 2');
    await page.keyboard.press('Escape');
    const discard = page.getByRole('alertdialog', { name: 'Alterações não salvas' });
    await expect(discard).toBeVisible();
    await discard.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(editor.getByLabel('Título', { exact: true })).toHaveValue('Ler capítulo 2');
    await editor.getByRole('button', { name: 'Salvar' }).click();
    await expect(editor).toBeHidden();

    // Focar hoje e conferir em Hoje.
    await page.getByRole('button', { name: 'Ações para a tarefa: Ler capítulo 2' }).click();
    await page.getByRole('menuitem', { name: 'Focar hoje' }).click();
    await page.getByRole('link', { name: /^Hoje/ }).first().click();
    const focusGroup = page.getByRole('region', { name: 'Em foco' });
    await expect(focusGroup).toContainText('Ler capítulo 2');
    await expect(page.getByRole('region', { name: 'Para hoje' })).toContainText('Reunião com o time');

    // Concluir com etapas abertas exige confirmação.
    await focusGroup.getByRole('checkbox', { name: 'Concluir tarefa: Ler capítulo 2' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Concluir com etapas abertas?' });
    await expect(confirm).toContainText('1 etapa aberta');
    await confirm.getByRole('button', { name: 'Concluir tarefa' }).click();
    await expect(page.getByText('1 concluída hoje')).toBeVisible();

    // Persistência após recarregar + histórico.
    await page.reload();
    await expect(page.getByText('1 concluída hoje')).toBeVisible();
    await page.getByRole('link', { name: 'Concluídas' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Ler capítulo 2' })).toContainText('1 de 2 etapas');

    // Reabrir preserva etapas e datas.
    await page.getByRole('button', { name: 'Reabrir', exact: true }).first().click();
    await page.getByRole('link', { name: 'Todas' }).click();
    const reopened = page.getByRole('listitem').filter({ hasText: 'Ler capítulo 2' });
    await expect(reopened).toContainText('Prazo: amanhã');
    await expect(reopened).toContainText('1 de 2 etapas');

    // Lixeira: mover, restaurar, e excluir definitivamente com confirmação.
    await page.getByRole('button', { name: 'Ações para a tarefa: Reunião com o time' }).click();
    await page.getByRole('menuitem', { name: 'Mover para a Lixeira' }).click();
    await page.getByRole('link', { name: 'Lixeira' }).click();
    await expect(page.getByText('Reunião com o time', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Restaurar/ }).click();
    await expect(page.getByRole('heading', { name: 'A Lixeira está vazia' })).toBeVisible();
    await page.getByRole('link', { name: 'Todas' }).click();
    await page.getByRole('button', { name: 'Ações para a tarefa: Reunião com o time' }).click();
    await page.getByRole('menuitem', { name: 'Mover para a Lixeira' }).click();
    await page.getByRole('link', { name: 'Lixeira' }).click();
    await page.getByRole('button', { name: /^Excluir definitivamente/ }).click();
    const forever = page.getByRole('alertdialog', { name: 'Excluir definitivamente?' });
    await expect(forever).toContainText('Reunião com o time');
    await forever.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Reunião com o time', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Restaurar/ }).click();

    // Busca ignorando acentos + filtros combinados.
    await page.getByRole('link', { name: 'Busca' }).click();
    await page.getByRole('searchbox', { name: 'Buscar tarefas' }).fill('reuniao');
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Reunião com o time' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Ler capítulo 2' })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Prioridade' }).selectOption('high');
    await expect(page.getByText('Nenhuma tarefa corresponde aos filtros')).toBeVisible();
    await page.getByRole('button', { name: 'Limpar filtros' }).first().click();
    await expect(page.getByRole('searchbox', { name: 'Buscar tarefas' })).toHaveValue('');

    // Exportar.
    await page.getByRole('link', { name: 'Configurações' }).click();
    await expect(page.getByText('Conectado como')).toContainText('teste@clareia.app');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar dados' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^clareia-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const backupPath = await download.path();
    const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
    expect(backup.app).toBe('clareia');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.tasks).toHaveLength(2);
    expect(backup.lists).toHaveLength(1);
    await expect(page.getByText(/Última exportação gerada:/)).toBeVisible();

    // Alterar a base e restaurar o backup (substitui).
    await page.getByRole('link', { name: 'Entrada' }).click();
    await addQuick(page, 'Tarefa extra');
    await page.getByRole('link', { name: 'Configurações' }).click();
    await page.locator('input[type=file]').setInputFiles(backupPath);
    const restoreDialog = page.getByRole('alertdialog', { name: 'Substituir os dados da conta?' });
    await expect(restoreDialog).toContainText('2');
    await restoreDialog.getByRole('button', { name: 'Substituir dados da conta' }).click();
    await expect(restoreDialog).toBeHidden();
    await page.getByRole('link', { name: 'Todas' }).click();
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Tarefa extra' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Ler capítulo 2' })).toBeVisible();
  });

  test('arquivo inválido não altera a base', async ({ page }) => {
    await page.goto('/#/hoje');
    await addQuick(page, 'Minha tarefa');
    await page.getByRole('link', { name: 'Configurações' }).click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'ruim.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'clareia', schemaVersion: 1, tasks: 'x' })),
    });
    await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível usar este arquivo' })).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Todas' }).click();
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Minha tarefa' })).toBeVisible();
  });

  test('limite de três focos', async ({ page }) => {
    await page.goto('/#/hoje');
    for (const t of ['A', 'B', 'C', 'D']) await addQuick(page, `Tarefa ${t}`);
    for (const t of ['A', 'B', 'C']) {
      await page.getByRole('button', { name: `Ações para a tarefa: Tarefa ${t}` }).click();
      await page.getByRole('menuitem', { name: 'Focar hoje' }).click();
    }
    await page.getByRole('button', { name: 'Ações para a tarefa: Tarefa D' }).click();
    await page.getByRole('menuitem', { name: 'Focar hoje' }).click();
    await expect(page.getByRole('alert')).toContainText('Você já tem 3 tarefas em foco. Retire uma para escolher outra.');
    await expect(page.getByRole('region', { name: 'Em foco' }).getByRole('button', { name: /^Abrir tarefa:/ })).toHaveCount(3);
  });
});

test.describe('Responsividade', () => {
  for (const width of [360, 768, 1440]) {
    test(`sem rolagem horizontal em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
      await page.goto('/#/hoje');
      await addQuick(page, 'Uma tarefa com um título bem comprido para testar a quebra de linha em telas pequenas e conferir que nada estoura');
      for (const route of ['hoje', 'entrada', 'proximas', 'todas', 'busca', 'concluidas', 'lixeira', 'configuracoes']) {
        await page.goto(`/#/${route}`);
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `rota ${route}`).toBeLessThanOrEqual(0);
      }
      await page.goto('/#/hoje');
      await page.screenshot({ path: `test-results/hoje-${width}.png` });
      await page.getByRole('button', { name: /^Abrir tarefa:/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Editar tarefa' });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      if (width < 768) {
        expect(box!.width).toBeGreaterThanOrEqual(width - 1);
      } else {
        expect(box!.width).toBeLessThanOrEqual(401);
      }
      await expect(dialog.getByRole('button', { name: 'Salvar' })).toBeInViewport();
      await page.screenshot({ path: `test-results/editor-${width}.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('celular: navegação inferior, Mais, busca na barra e Nova tarefa flutuante', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/#/hoje');
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'mobile');
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    for (const name of ['Hoje', 'Entrada', 'Próximas', 'Mais']) await expect(nav.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Nova tarefa' })).toHaveCount(0);
    const fab = page.getByRole('button', { name: 'Nova tarefa' });
    await expect(fab).toBeInViewport();
    const fabBox = (await fab.boundingBox())!;
    const navBox = (await nav.boundingBox())!;
    expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(navBox.y);
    await fab.click();
    const editor = page.getByRole('dialog', { name: 'Nova tarefa' });
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Fechar editor' }).click();
    await expect(editor).toHaveCount(0);
    await page.getByRole('banner').getByRole('link', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/#\/busca$/);
    await nav.getByRole('button', { name: 'Mais' }).click();
    const more = page.getByRole('dialog', { name: 'Mais' });
    for (const name of ['Todas', 'Busca', 'Concluídas', 'Lixeira', 'Configurações']) {
      await expect(more.getByRole('link', { name })).toBeVisible();
    }
    await more.getByRole('link', { name: 'Configurações' }).click();
    await expect(page).toHaveURL(/#\/configuracoes$/);
  });

  test.describe('celular deitado (toque)', () => {
    test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    test('usa o layout de celular mesmo com largura de tablet', async ({ page }) => {
      await page.goto('/#/hoje');
      await expect(page.locator('html')).toHaveAttribute('data-layout', 'mobile');
      await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Abrir menu de navegação' })).toHaveCount(0);
    });
  });

  test('pode ser instalado: manifesto e ícones válidos', async ({ page, request }) => {
    await page.goto('/#/hoje');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = await (await request.get(new URL(href!, page.url()).href)).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('pt-BR');
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of manifest.icons) {
      const res = await request.get(new URL(icon.src, new URL(href!, page.url())).href);
      expect(res.ok(), icon.src).toBe(true);
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('tablet: menu lateral recolhível', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/#/hoje');
    await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Abrir menu de navegação' }).click();
    await page.getByRole('navigation', { name: 'Menu de navegação' }).getByRole('link', { name: 'Entrada' }).click();
    await expect(page).toHaveURL(/#\/entrada$/);
  });
});

test.describe('Teclado e acessibilidade', () => {
  test('fluxo por teclado: capturar, abrir editor, salvar e devolver o foco', async ({ page }) => {
    await page.goto('/#/entrada');
    await quickAdd(page).focus();
    await page.keyboard.type('Pelo teclado');
    await page.keyboard.press('Enter');
    const open = page.getByRole('button', { name: 'Abrir tarefa: Pelo teclado' });
    await open.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Editar tarefa' });
    await expect(dialog.getByLabel('Título', { exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();

    // Menu da tarefa por teclado, com ordem manual.
    await quickAdd(page).fill('Segunda');
    await quickAdd(page).press('Enter');
    await page.getByRole('button', { name: 'Ordem manual' }).click();
    const menuTrigger = page.getByRole('button', { name: 'Ações para a tarefa: Segunda' });
    await menuTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Mover para cima' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Mover para cima' }).press('Enter');
    await expect(page.locator('ul > li button[aria-label^="Abrir tarefa:"]')).toHaveText(['Segunda', 'Pelo teclado']);
    await expect(menuTrigger).toBeFocused();
  });
});

test.describe('Robustez', () => {
  test('Hoje recalcula a data ao virar o dia, sem perder tarefas', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-24T22:59:30-03:00') });
    await page.goto('/#/hoje');
    await expect(page.getByText('Terça-feira, 24 de novembro')).toBeVisible();
    await addQuick(page, 'Tarefa de ontem');
    await expect(page.getByRole('region', { name: 'Para hoje' })).toContainText('Tarefa de ontem');
    await page.clock.fastForward(2 * 60 * 60 * 1000);
    await expect(page.getByText('Quarta-feira, 25 de novembro')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Replanejar' })).toContainText('Tarefa de ontem');
    await expect(page.getByRole('heading', { name: 'Para hoje' })).toHaveCount(0);
  });

  test('falha de gravação preserva o texto e permite tentar de novo', async ({ page }) => {
    await page.goto('/#/hoje');
    await addQuick(page, 'Existente');
    const setOffline = (value: boolean) =>
      page.evaluate((v) => {
        (window as unknown as { __clareiaMemory: { failWrites: boolean } }).__clareiaMemory.failWrites = v;
      }, value);
    await setOffline(true);
    await quickAdd(page).fill('Não vai gravar');
    await quickAdd(page).press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: 'Sem conexão com o servidor' })).toBeVisible();
    await expect(quickAdd(page)).toHaveValue('Não vai gravar');
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Não vai gravar' })).toHaveCount(0);
    await expect(page.getByText('Tarefa adicionada a Hoje.')).toHaveCount(0);
    await setOffline(false);
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Não vai gravar' })).toBeVisible();
    await expect(quickAdd(page)).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Existente' })).toBeVisible();
  });

  test('"Mais detalhes" abre o editor com o título e não perde o rascunho sem confirmação', async ({ page }) => {
    await page.goto('/#/hoje');
    await quickAdd(page).fill('Rascunho');
    await page.getByRole('button', { name: 'Mais detalhes' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nova tarefa' });
    await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Rascunho');
    await page.keyboard.press('Escape');
    const alert = page.getByRole('alertdialog', { name: 'Alterações não salvas' });
    await expect(alert).toBeVisible();
    await alert.getByRole('button', { name: 'Descartar alterações' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Rascunho' })).toHaveCount(0);
  });

  test('lista inexistente mostra mensagem e acesso à Entrada', async ({ page }) => {
    await page.goto('/#/listas/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('heading', { name: 'Esta lista não existe' })).toBeVisible();
    await page.getByRole('link', { name: 'Ir para a Entrada' }).click();
    await expect(page).toHaveURL(/#\/entrada$/);
  });

  test('excluir lista preserva as tarefas na Entrada', async ({ page }) => {
    await page.goto('/#/hoje');
    await page.getByRole('button', { name: 'Nova lista' }).click();
    await page.getByLabel('Nome da lista').fill('Temporária');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await addQuick(page, 'Fica na entrada');
    await page.getByRole('button', { name: 'Excluir lista' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Excluir esta lista?' });
    await expect(confirm).toContainText('1 tarefa será movida');
    await confirm.getByRole('button', { name: 'Excluir lista' }).click();
    await expect(page).toHaveURL(/#\/entrada$/);
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Fica na entrada' })).toBeVisible();
  });
});
