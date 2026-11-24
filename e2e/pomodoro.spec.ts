import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * O relógio da página é simulado (page.clock): os testes avançam 25 minutos em
 * milissegundos. O áudio e as notificações são substituídos por versões que contam
 * chamadas, para verificar som tocado, som bloqueado e permissão negada.
 */

const START = new Date('2026-11-24T13:00:00-03:00');

interface Env {
  audioBlocked?: boolean;
  notification?: 'default' | 'denied' | 'granted';
}

async function stubMedia(target: Page | BrowserContext, env: Env = {}) {
  await target.addInitScript((e: Env) => {
    const w = window as unknown as Record<string, unknown>;
    w.__oscStarts = 0;
    w.__notifications = 0;
    const noop = () => undefined;
    const param = { setValueAtTime: noop, exponentialRampToValueAtTime: noop };
    class FakeAudioContext {
      state = e.audioBlocked ? 'suspended' : 'running';
      currentTime = 0;
      destination = {};
      resume() {
        if (e.audioBlocked) return Promise.reject(new DOMException('bloqueado', 'NotAllowedError'));
        this.state = 'running';
        return Promise.resolve();
      }
      createGain() {
        return { gain: param, connect: (x: unknown) => x };
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: param,
          connect: (x: unknown) => x,
          start: () => {
            w.__oscStarts = (w.__oscStarts as number) + 1;
          },
          stop: noop,
        };
      }
    }
    w.AudioContext = FakeAudioContext;
    let permission = e.notification ?? 'default';
    class FakeNotification {
      static get permission() {
        return permission;
      }
      static requestPermission() {
        if (permission === 'default') permission = 'denied';
        return Promise.resolve(permission);
      }
      constructor() {
        w.__notifications = (w.__notifications as number) + 1;
      }
      close() {}
    }
    w.Notification = FakeNotification;
  }, env);
}

/** Um sino = dois toques de quatro parciais. */
const bells = async (page: Page) => (await page.evaluate(() => (window as unknown as { __oscStarts: number }).__oscStarts)) / 8;

async function addTask(page: Page, title: string) {
  const input = page.getByRole('textbox', { name: 'Nova tarefa' });
  await input.fill(title);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: `Abrir tarefa: ${title}` })).toBeVisible();
}

const panel = (page: Page) => page.getByRole('region').filter({ has: page.getByRole('timer') });
const row = (page: Page, title: string) => page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Abrir tarefa: ${title}` }) });
const prompt = (page: Page) => page.getByRole('alertdialog');

test.describe('Pomodoro', () => {
  test('início, pausa, retomada, fim, continuação com tempo extra, conclusão e pausa', async ({ page }) => {
    await stubMedia(page);
    await page.clock.install({ time: START });
    await page.goto('/');
    await addTask(page, 'Escrever relatório');

    await row(page, 'Escrever relatório').getByRole('button', { name: 'Iniciar foco: Escrever relatório' }).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole('timer')).toHaveText('25:00');
    await expect(panel(page)).toContainText('Foco');
    await expect(panel(page).getByRole('button', { name: 'Tarefa: Escrever relatório' })).toBeVisible();
    await expect(panel(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    await expect(row(page, 'Escrever relatório')).toContainText('Em sessão de foco');
    await expect(page).toHaveTitle(/^25:00 Foco · Hoje · Clareia$/);

    await page.clock.fastForward('05:00');
    await expect(panel(page).getByRole('timer')).toHaveText('20:00');
    await expect(panel(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');

    // O painel acompanha a navegação.
    await page.getByRole('link', { name: 'Entrada' }).first().click();
    await expect(panel(page).getByRole('timer')).toHaveText('20:00');
    await page.getByRole('link', { name: 'Hoje' }).first().click();

    // Pausar congela o tempo; retomar continua de onde parou.
    await panel(page).getByRole('button', { name: 'Pausar' }).click();
    await expect(panel(page)).toContainText('Pausado');
    await page.clock.fastForward('03:00');
    await expect(panel(page).getByRole('timer')).toHaveText('20:00');
    await panel(page).getByRole('button', { name: 'Retomar' }).click();
    await expect(panel(page)).not.toContainText('Pausado');
    await page.clock.fastForward('19:00');
    await expect(panel(page).getByRole('timer')).toHaveText('01:00');
    expect(await bells(page)).toBe(0);

    // Fim do foco: sino + aviso; a tarefa continua pendente.
    await page.clock.fastForward('01:01');
    await expect(prompt(page)).toBeVisible();
    await expect(prompt(page).getByRole('heading', { name: 'O tempo de foco terminou.' })).toBeVisible();
    await expect(prompt(page)).toContainText('Você concluiu esta tarefa?');
    await expect(prompt(page)).toContainText('Nesta tarefa: 1 Pomodoro.');
    expect(await bells(page)).toBe(1);
    await expect(panel(page)).toBeHidden();
    // Com o aviso aberto, o restante da página fica oculto para tecnologias assistivas (modal).
    await expect(
      page.getByRole('checkbox', { name: 'Concluir tarefa: Escrever relatório', includeHidden: true }),
    ).not.toBeChecked();

    // Continuar: tempo extra curto, contado à parte.
    await prompt(page).getByRole('button', { name: 'Continuar tarefa' }).click();
    await expect(prompt(page).getByRole('heading', { name: 'Como quer continuar?' })).toBeVisible();
    await expect(prompt(page).getByRole('button', { name: 'Mais um Pomodoro (25 min)' })).toBeVisible();
    await prompt(page).getByRole('button', { name: '10 min extra' }).click();
    await expect(prompt(page)).toBeHidden();
    await expect(panel(page)).toContainText('Foco extra');
    await expect(panel(page).getByRole('timer')).toHaveText('10:00');
    await expect(row(page, 'Escrever relatório')).toContainText('1 Pomodoro');

    await page.clock.fastForward('10:01');
    await expect(prompt(page)).toContainText('Tempo extra registrado. Nesta tarefa: 1 Pomodoro · +10 min extra.');
    expect(await bells(page)).toBe(2);

    // Concluir tarefa: só agora a tarefa é concluída, e uma pausa é oferecida.
    await prompt(page).getByRole('button', { name: 'Concluir tarefa' }).click();
    await expect(prompt(page).getByRole('heading', { name: 'Tarefa concluída.' })).toBeVisible();
    await prompt(page).getByRole('button', { name: 'Fazer uma pausa curta (5 min)' }).click();
    await expect(panel(page)).toContainText('Pausa curta');
    await expect(panel(page).getByRole('timer')).toHaveText('05:00');

    // Fim da pausa: aviso visual e sonoro; nada começa sozinho.
    await page.clock.fastForward('05:01');
    await expect(prompt(page).getByRole('heading', { name: 'Pausa curta terminou.' })).toBeVisible();
    expect(await bells(page)).toBe(3);
    await prompt(page).getByRole('button', { name: 'Agora não' }).click();
    await expect(prompt(page)).toBeHidden();
    await expect(panel(page)).toBeHidden();
    await expect(page).toHaveTitle('Hoje · Clareia');

    // A tarefa foi concluída pela escolha da pessoa e guarda a contagem no histórico.
    await page.getByRole('link', { name: 'Concluídas' }).first().click();
    await expect(page.getByRole('checkbox', { name: 'Reabrir tarefa: Escrever relatório' })).toBeChecked();
    await expect(row(page, 'Escrever relatório')).toContainText('1 Pomodoro · +10 min extra');
  });

  test('"Decidir depois" mantém a tarefa pendente; pausa após quatro Pomodoros é longa', async ({ page }) => {
    await stubMedia(page);
    await page.clock.install({ time: START });
    await page.goto('/');
    await addTask(page, 'Estudar');
    for (let i = 1; i <= 4; i += 1) {
      await row(page, 'Estudar').getByRole('button', { name: 'Iniciar foco: Estudar' }).click();
      await expect(panel(page).getByRole('timer')).toHaveText('25:00');
      await page.clock.fastForward('25:01');
      await expect(prompt(page)).toContainText(`Nesta tarefa: ${i} ${i === 1 ? 'Pomodoro' : 'Pomodoros'}.`);
      if (i < 4) await prompt(page).getByRole('button', { name: 'Decidir depois' }).click();
    }
    await prompt(page).getByRole('button', { name: 'Continuar tarefa' }).click();
    await expect(prompt(page).getByRole('button', { name: 'Fazer uma pausa longa (15 min)' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(prompt(page)).toBeHidden();
    await expect(page.getByRole('checkbox', { name: 'Concluir tarefa: Estudar' })).not.toBeChecked();
    await expect(row(page, 'Estudar')).toContainText('4 Pomodoros');
  });

  test('troca de tarefa: pausar a sessão atual, focar em outra e retomar a primeira', async ({ page }) => {
    await stubMedia(page);
    await page.clock.install({ time: START });
    await page.goto('/');
    await addTask(page, 'Tarefa A');
    await addTask(page, 'Tarefa B');

    await row(page, 'Tarefa A').getByRole('button', { name: 'Iniciar foco: Tarefa A' }).click();
    await expect(panel(page).getByRole('timer')).toHaveText('25:00');
    await page.clock.fastForward('05:00');
    await expect(panel(page).getByRole('timer')).toHaveText('20:00');
    await row(page, 'Tarefa B').getByRole('button', { name: 'Iniciar foco: Tarefa B' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Trocar a tarefa em foco?' });
    await expect(dialog).toContainText('faltam 20:00');

    // Cancelar mantém a sessão atual.
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(panel(page).getByRole('button', { name: 'Tarefa: Tarefa A' })).toBeVisible();

    await row(page, 'Tarefa B').getByRole('button', { name: 'Iniciar foco: Tarefa B' }).click();
    await dialog.getByRole('button', { name: 'Pausar e trocar' }).click();
    await expect(panel(page).getByRole('button', { name: 'Tarefa: Tarefa B' })).toBeVisible();
    await expect(panel(page).getByRole('timer')).toHaveText('25:00');
    await expect(row(page, 'Tarefa A').getByRole('button', { name: 'Retomar foco: Tarefa A' })).toHaveCount(0);

    // Encerrar B (pede confirmação e não conta Pomodoro); A volta, com o tempo que faltava.
    await panel(page).getByRole('button', { name: 'Encerrar' }).click();
    await page.getByRole('alertdialog', { name: 'Encerrar a sessão de foco?' }).getByRole('button', { name: 'Encerrar sessão' }).click();
    const paused = page.getByRole('region', { name: 'Foco pausado' });
    await expect(paused).toContainText('Tarefa A');
    await expect(paused).toContainText('Faltam 20:00');
    await expect(row(page, 'Tarefa B')).not.toContainText('Pomodoro');
    await paused.getByRole('button', { name: 'Retomar' }).click();
    await expect(panel(page).getByRole('button', { name: 'Tarefa: Tarefa A' })).toBeVisible();
    await expect(panel(page).getByRole('timer')).toHaveText('20:00');
    await page.clock.fastForward('02:00');
    await expect(panel(page).getByRole('timer')).toHaveText('18:00');
  });

  test('recupera a sessão ao atualizar a página e mostra o aviso pendente uma única vez', async ({ page, context }) => {
    await stubMedia(context);
    await page.clock.install({ time: START });
    await page.goto('/');
    await addTask(page, 'Revisar contrato');
    await row(page, 'Revisar contrato').getByRole('button', { name: 'Iniciar foco: Revisar contrato' }).click();
    await expect(panel(page).getByRole('timer')).toHaveText('25:00');
    await page.clock.fastForward('05:00');

    await page.reload();
    await expect(panel(page).getByRole('timer')).toHaveText('20:00');
    await expect(row(page, 'Revisar contrato')).toContainText('Em sessão de foco');

    // Pausado continua pausado depois de atualizar.
    await panel(page).getByRole('button', { name: 'Pausar' }).click();
    await expect(panel(page)).toContainText('Pausado');
    await page.reload();
    await expect(panel(page)).toContainText('Pausado');
    await expect(panel(page).getByRole('timer')).toHaveText('20:00');
    await panel(page).getByRole('button', { name: 'Retomar' }).click();
    await expect(panel(page)).not.toContainText('Pausado');

    // A página é fechada e reaberta depois do término.
    await page.close();
    const later = await context.newPage();
    await later.clock.install({ time: new Date(START.getTime() + 60 * 60_000) });
    await later.goto('/');
    await expect(prompt(later).getByRole('heading', { name: 'O tempo de foco terminou.' })).toBeVisible();
    await expect(prompt(later)).toContainText('enquanto o Clareia estava fechado');
    expect(await bells(later)).toBe(0);
    await prompt(later).getByRole('button', { name: 'Decidir depois' }).click();
    await expect(row(later, 'Revisar contrato')).toContainText('1 Pomodoro');

    await later.reload();
    await expect(row(later, 'Revisar contrato')).toContainText('1 Pomodoro');
    await expect(prompt(later)).toHaveCount(0);
  });

  test('várias abas: um único temporizador, um único sino, e a resposta vale para todas', async ({ page, context }) => {
    await stubMedia(context);
    const a = page;
    await a.clock.install({ time: START });
    await a.goto('/');
    await addTask(a, 'Planejar sprint');
    const b = await context.newPage();
    await b.clock.install({ time: START });
    await b.goto('/');

    await row(a, 'Planejar sprint').getByRole('button', { name: 'Iniciar foco: Planejar sprint' }).click();
    await expect(panel(b).getByRole('button', { name: 'Tarefa: Planejar sprint' })).toBeVisible();
    await panel(b).getByRole('button', { name: 'Pausar' }).click();
    await expect(panel(a)).toContainText('Pausado');
    await panel(a).getByRole('button', { name: 'Retomar' }).click();
    await expect(panel(a)).not.toContainText('Pausado');
    await expect(panel(b)).not.toContainText('Pausado');

    await a.clock.fastForward('25:01');
    await expect(prompt(a)).toBeVisible();
    await expect(prompt(b)).toBeVisible();
    await b.clock.fastForward('25:01');
    await b.waitForTimeout(300);
    expect((await bells(a)) + (await bells(b))).toBe(1);

    await prompt(b).getByRole('button', { name: 'Decidir depois' }).click();
    await expect(prompt(a)).toBeHidden();
    await expect(row(a, 'Planejar sprint')).toContainText('1 Pomodoro');
    await expect(row(b, 'Planejar sprint')).toContainText('1 Pomodoro');
  });

  test('som bloqueado e notificações negadas não interrompem o temporizador', async ({ page }) => {
    await stubMedia(page, { audioBlocked: true, notification: 'default' });
    await page.clock.install({ time: START });
    await page.goto('/#/configuracoes');

    const section = page.getByRole('region', { name: 'Pomodoro' });
    await section.getByRole('button', { name: 'Ativar notificações' }).click();
    await expect(section).toContainText('As notificações estão bloqueadas para este site');
    await expect(section.getByRole('button', { name: 'Ativar notificações' })).toHaveCount(0);

    await section.getByRole('button', { name: 'Ouvir o sino' }).click();
    await expect(section).toContainText('O navegador bloqueou o som');

    await section.getByLabel('Foco (minutos)').fill('5');
    await section.getByLabel('Pausa curta (minutos)').fill('0');
    await expect(section).toContainText('Use um número inteiro de 1 a 30.');

    await page.getByRole('link', { name: 'Hoje' }).first().click();
    await addTask(page, 'Ligar para o banco');
    await row(page, 'Ligar para o banco').getByRole('button', { name: 'Iniciar foco: Ligar para o banco' }).click();
    await expect(panel(page).getByRole('timer')).toHaveText('05:00');
    await page.clock.fastForward('05:01');
    await expect(prompt(page)).toContainText('O tempo de foco terminou.');
    await expect(prompt(page)).toContainText('O navegador bloqueou o som');
    expect(await bells(page)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __notifications: number }).__notifications)).toBe(0);
    await prompt(page).getByRole('button', { name: 'Continuar tarefa' }).click();
    await prompt(page).getByRole('button', { name: 'Fazer uma pausa curta (5 min)' }).click();
    await expect(panel(page)).toContainText('Pausa curta');
  });

  test('celular: barra compacta acessível, acima da navegação', async ({ page }) => {
    await stubMedia(page);
    await page.setViewportSize({ width: 360, height: 760 });
    await page.clock.install({ time: START });
    await page.goto('/');
    await addTask(page, 'Responder clientes');
    await row(page, 'Responder clientes').getByRole('button', { name: 'Iniciar foco: Responder clientes' }).click();
    const bar = panel(page);
    await expect(bar.getByRole('timer')).toHaveText('25:00');
    await expect(bar.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Encerrar' })).toBeVisible();

    const barBox = (await bar.boundingBox())!;
    const navBox = (await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox())!;
    const fabBox = (await page.getByRole('button', { name: 'Nova tarefa' }).boundingBox())!;
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(navBox.y);
    expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(barBox.y);
    expect(barBox.x).toBeGreaterThanOrEqual(0);
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(360);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);

    await page.clock.fastForward('25:01');
    await expect(prompt(page)).toBeVisible();
    const withPrompt = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(withPrompt.violations).toEqual([]);
  });
});
