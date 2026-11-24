import { test as base, expect } from '@playwright/test';

export const E2E_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'teste@clareia.app', password: 'senha1234' };

/**
 * Os testes rodam com o servidor simulado (VITE_BACKEND=memory). Este `test` já começa
 * com uma conta confirmada e conectada; use o `test` do Playwright para testar o login.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript((user) => {
      if (localStorage.getItem('clareia-memory:users') === null) {
        localStorage.setItem(
          'clareia-memory:users',
          JSON.stringify({ [user.email]: { id: user.id, password: user.password, confirmed: true } }),
        );
        localStorage.setItem('clareia-memory:session', JSON.stringify({ id: user.id, email: user.email }));
      }
    }, E2E_USER);
    await provide(page);
  },
});

export { expect };
