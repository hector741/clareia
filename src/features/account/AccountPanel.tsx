import { KeyRound, LogOut } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth, useCurrentUser } from '../../app/AuthContext';
import { useFeedback } from '../../app/feedback';
import { AuthFailure } from '../../backend';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { PasswordInput } from '../auth/PasswordInput';
import { validateNewPassword } from '../auth/validation';
import styles from '../../app/pages/page.module.css';

export function AccountPanel() {
  const user = useCurrentUser();
  const { auth } = useAuth();
  const feedback = useFeedback();
  const [changing, setChanging] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const close = () => {
    setChanging(false);
    setPassword('');
    setConfirm('');
    setErrors({});
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = validateNewPassword(password, confirm);
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    setError(null);
    try {
      await auth.updatePassword(password);
      feedback.success('Senha alterada.');
      close();
    } catch (err) {
      setError(err instanceof AuthFailure ? err.message : 'Não foi possível alterar a senha agora.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
    } catch {
      setSigningOut(false);
      feedback.error('Não foi possível sair agora. Tente de novo.');
    }
  };

  return (
    <section className={styles.card} aria-labelledby="account-title">
      <h2 id="account-title">Conta</h2>
      <p>
        Conectado como <strong>{user.email}</strong>. Suas tarefas ficam salvas na conta e aparecem em todos os aparelhos
        onde você entrar.
      </p>
      {changing ? (
        <form onSubmit={(e) => void submit(e)} noValidate className={styles.stack}>
          <Field label="Nova senha" error={errors.password} hint="Pelo menos 8 caracteres, com letras e números.">
            <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Repita a nova senha" error={errors.confirm}>
            <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error ? (
            <p role="alert" className={styles.inlineError}>
              {error}
            </p>
          ) : null}
          <div className={styles.toolbar}>
            <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
              {busy ? 'Salvando…' : 'Salvar nova senha'}
            </Button>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.toolbar}>
          <Button variant="secondary" icon={<KeyRound size={18} />} onClick={() => setChanging(true)}>
            Alterar senha
          </Button>
          <Button variant="danger" icon={<LogOut size={18} />} onClick={() => void signOut()} disabled={signingOut} aria-busy={signingOut}>
            {signingOut ? 'Saindo…' : 'Sair da conta'}
          </Button>
        </div>
      )}
    </section>
  );
}
