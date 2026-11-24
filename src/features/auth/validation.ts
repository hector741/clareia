export const MIN_PASSWORD = 8;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Digite seu e-mail.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Digite um e-mail válido, como nome@exemplo.com.';
  return undefined;
}

export function validateNewPassword(password: string, confirm: string): { password?: string; confirm?: string } {
  const errors: { password?: string; confirm?: string } = {};
  if (password.length < MIN_PASSWORD) errors.password = `Use pelo menos ${MIN_PASSWORD} caracteres.`;
  else if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Misture letras e números.';
  }
  if (!confirm) errors.confirm = 'Repita a senha.';
  else if (confirm !== password) errors.confirm = 'As senhas não coincidem.';
  return errors;
}
