import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** No servidor simulado, o link do e-mail leva `token_hash=memory:<email>`. */
const emailLink = (email: string, type: 'email' | 'recovery') => `/?token_hash=memory:${email}&type=${type}#/hoje`;

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`);
  expect(summary, `Violações de acessibilidade em ${label}`).toEqual([]);
}

test.describe('Conta e login', () => {
  test('criar conta, confirmar pelo link, usar, sair e entrar de novo', async ({ page }) => {
    const email = 'ana@exemplo.com';
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await scan(page, 'entrar');

    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible();

    // Validação no próprio formulário.
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('Digite seu e-mail.')).toBeVisible();
    await page.getByLabel('E-mail').fill('ana@exemplo');
    await page.getByLabel('Senha', { exact: true }).fill('curta');
    await page.getByLabel('Repita a senha').fill('outra');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('Digite um e-mail válido')).toBeVisible();
    await expect(page.getByText('Use pelo menos 8 caracteres.')).toBeVisible();
    await expect(page.getByText('As senhas não coincidem.')).toBeVisible();
    await scan(page, 'criar conta com erros');

    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('minhasenha1');
    await page.getByRole('button', { name: 'Mostrar senha' }).first().click();
    await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
    await page.getByLabel('Repita a senha').fill('minhasenha1');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // Sem confirmar, não entra.
    await page.getByRole('button', { name: 'Voltar para entrar' }).click();
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('minhasenha1');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Confirme seu e-mail antes de entrar');
    await expect(page.getByRole('button', { name: 'Reenviar link de confirmação' })).toBeVisible();

    // O link do e-mail pede um toque antes de confirmar.
    await page.goto(emailLink(email, 'email'));
    await expect(page.getByRole('heading', { name: 'Confirmar e-mail' })).toBeVisible();
    await scan(page, 'confirmar e-mail');
    await page.getByRole('button', { name: 'Confirmar e-mail' }).click();
    await expect(page.getByRole('heading', { name: 'Hoje', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/#\/hoje$/);
    await expect(page.getByText('E-mail confirmado. Bem-vindo ao Clareia!')).toBeVisible();

    // Usa o app; os dados ficam na conta.
    const quick = page.getByRole('textbox', { name: 'Nova tarefa' });
    await quick.fill('Primeira da conta');
    await quick.press('Enter');
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Primeira da conta' })).toBeVisible();

    // Sair.
    await page.getByRole('link', { name: 'Configurações' }).click();
    await expect(page.getByText('Conectado como')).toContainText(email);
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();

    // Senha errada.
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('errada123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('E-mail ou senha incorretos.');

    // Entrar de novo traz as tarefas da conta.
    await page.getByLabel('Senha', { exact: true }).fill('minhasenha1');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Hoje', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Primeira da conta' })).toBeVisible();

    // A sessão continua depois de recarregar.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Abrir tarefa: Primeira da conta' })).toBeVisible();
  });

  test('esqueci minha senha: pedir link, escolher nova senha e entrar com ela', async ({ page }) => {
    const email = 'bia@exemplo.com';
    await page.goto('/');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('antiga123');
    await page.getByLabel('Repita a senha').fill('antiga123');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
    await page.goto(emailLink(email, 'email'));
    await page.getByRole('button', { name: 'Confirmar e-mail' }).click();
    await expect(page.getByRole('heading', { name: 'Hoje', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Configurações' }).click();
    await page.getByRole('button', { name: 'Sair da conta' }).click();

    await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
    await expect(page.getByRole('heading', { name: 'Esqueci minha senha' })).toBeVisible();
    await scan(page, 'esqueci minha senha');
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();

    await page.goto(emailLink(email, 'recovery'));
    await expect(page.getByRole('heading', { name: 'Redefinir senha' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('heading', { name: 'Escolha uma nova senha' })).toBeVisible();
    await scan(page, 'nova senha');
    await page.getByLabel('Nova senha', { exact: true }).fill('nova12345');
    await page.getByLabel('Repita a nova senha').fill('nova12345');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByRole('heading', { name: 'Hoje', level: 1 })).toBeVisible();
    await expect(page.getByText('Senha alterada. Você já está conectado.')).toBeVisible();

    await page.getByRole('link', { name: 'Configurações' }).click();
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('antiga123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('E-mail ou senha incorretos.');
    await page.getByLabel('Senha', { exact: true }).fill('nova12345');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Hoje', level: 1 })).toBeVisible();
  });

  test('link inválido mostra a explicação e a tela de entrada', async ({ page }) => {
    await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('O link expirou ou já foi usado. Peça um novo.');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await expect(page).toHaveURL(/#\/hoje$/);
  });

  test('celular: tela de entrada sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeInViewport();
    await scan(page, 'entrar (360px)');
    await page.screenshot({ path: 'test-results/login-360.png' });
  });
});
