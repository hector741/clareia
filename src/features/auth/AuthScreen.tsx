import { LogIn, MailCheck, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useFeedback } from '../../app/feedback';
import { usePageTitle } from '../../app/usePageTitle';
import { BrandMark } from '../../app/Sidebar';
import { AuthFailure } from '../../backend';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { PasswordInput } from './PasswordInput';
import { validateEmail, validateNewPassword } from './validation';
import styles from './AuthScreen.module.css';

type Mode = 'signin' | 'signup' | 'forgot' | 'sent_signup' | 'sent_reset';

const messageOf = (error: unknown) =>
  error instanceof AuthFailure ? error.message : 'Não foi possível concluir agora. Tente de novo em instantes.';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  usePageTitle(title);
  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <BrandMark />
        </div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {children}
      </div>
    </main>
  );
}

/** Entrar, criar conta e recuperar senha. */
export function AuthScreen() {
  const { auth, redirectTo, intent, clearIntent } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(intent.kind === 'error' ? intent.message : null);
  const [notice, setNotice] = useState<string | null>(
    intent.kind === 'confirmed' ? 'E-mail confirmado. Entre com sua senha.' : null,
  );
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const headingTarget = useRef(false);

  useEffect(() => {
    if (intent.kind === 'error' || intent.kind === 'confirmed') clearIntent();
  }, [intent.kind, clearIntent]);

  useEffect(() => {
    if (!headingTarget.current) {
      headingTarget.current = true;
      return;
    }
    if (mode === 'signin' || mode === 'signup' || mode === 'forgot') emailRef.current?.focus();
  }, [mode]);

  const go = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setUnconfirmed(false);
    if (next !== 'signin') setNotice(null);
    setPassword('');
    setConfirm('');
  };

  const attempt = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFormError(null);
    try {
      await fn();
    } catch (error) {
      setFormError(messageOf(error));
      if (error instanceof AuthFailure && error.code === 'email_not_confirmed') setUnconfirmed(true);
    } finally {
      setBusy(false);
    }
  };

  const onSignIn = (e: FormEvent) => {
    e.preventDefault();
    const next = { email: validateEmail(email), password: password ? undefined : 'Digite sua senha.' };
    setErrors(next);
    if (next.email || next.password) return;
    setNotice(null);
    void attempt(() => auth.signIn(email.trim(), password));
  };

  const onSignUp = (e: FormEvent) => {
    e.preventDefault();
    const next = { email: validateEmail(email), ...validateNewPassword(password, confirm) };
    setErrors(next);
    if (next.email || next.password || next.confirm) return;
    void attempt(async () => {
      const { needsConfirmation } = await auth.signUp(email.trim(), password, redirectTo);
      if (needsConfirmation) go('sent_signup');
    });
  };

  const onForgot = (e: FormEvent) => {
    e.preventDefault();
    const next = { email: validateEmail(email) };
    setErrors(next);
    if (next.email) return;
    void attempt(async () => {
      await auth.requestPasswordReset(email.trim(), redirectTo);
      go('sent_reset');
    });
  };

  const resend = () =>
    void attempt(async () => {
      await auth.resendConfirmation(email.trim(), redirectTo);
      setNotice('Enviamos um novo link de confirmação.');
      setFormError(null);
    });

  const alert = formError ? (
    <div role="alert" className={styles.alert}>
      {formError}
    </div>
  ) : null;
  const status = notice ? (
    <div role="status" className={styles.success}>
      {notice}
    </div>
  ) : null;

  const emailField = (
    <Field label="E-mail" error={errors.email}>
      <input
        ref={emailRef}
        className="control"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </Field>
  );

  if (mode === 'sent_signup' || mode === 'sent_reset') {
    const signup = mode === 'sent_signup';
    return (
      <AuthLayout title="Confira seu e-mail">
        <div className={styles.brand} aria-hidden="true">
          <MailCheck size={40} color="var(--color-primary)" />
        </div>
        <p className={styles.subtitle}>
          {signup ? (
            <>
              Se <strong>{email.trim()}</strong> ainda não tiver conta, enviamos um link para confirmar o cadastro. Abra o
              link e depois entre com sua senha.
            </>
          ) : (
            <>
              Se existir uma conta com <strong>{email.trim()}</strong>, enviamos um link para escolher uma nova senha.
            </>
          )}
        </p>
        <p className={styles.note}>Não chegou? Veja a caixa de spam ou aguarde alguns minutos.</p>
        {alert}
        {status}
        {signup ? (
          <Button variant="secondary" onClick={resend} disabled={busy} aria-busy={busy}>
            Reenviar link de confirmação
          </Button>
        ) : null}
        <div className={styles.links}>
          <button type="button" className={styles.linkButton} onClick={() => go('signin')}>
            Voltar para entrar
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'forgot') {
    return (
      <AuthLayout title="Esqueci minha senha" subtitle="Informe seu e-mail e enviaremos um link para criar uma nova senha.">
        <form className={styles.form} onSubmit={onForgot} noValidate>
          {emailField}
          {alert}
          <Button type="submit" variant="primary" className={styles.submit} disabled={busy} aria-busy={busy}>
            {busy ? 'Enviando…' : 'Enviar link'}
          </Button>
        </form>
        <div className={styles.links}>
          <button type="button" className={styles.linkButton} onClick={() => go('signin')}>
            Voltar para entrar
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'signup') {
    return (
      <AuthLayout title="Criar conta" subtitle="Suas tarefas ficam salvas na conta e aparecem em todos os seus aparelhos.">
        <form className={styles.form} onSubmit={onSignUp} noValidate>
          {emailField}
          <Field label="Senha" error={errors.password} hint="Pelo menos 8 caracteres, com letras e números.">
            <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Repita a senha" error={errors.confirm}>
            <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {alert}
          <Button
            type="submit"
            variant="primary"
            icon={<UserPlus size={18} />}
            className={styles.submit}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Criando…' : 'Criar conta'}
          </Button>
        </form>
        <hr className={styles.divider} />
        <div className={styles.links}>
          <span className={styles.note}>Já tem conta?</span>
          <button type="button" className={styles.linkButton} onClick={() => go('signin')}>
            Entrar
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Entrar" subtitle="Organize o dia com clareza, em qualquer aparelho.">
      <form className={styles.form} onSubmit={onSignIn} noValidate>
        {status}
        {emailField}
        <Field label="Senha" error={errors.password}>
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {alert}
        {unconfirmed ? (
          <Button variant="secondary" onClick={resend} disabled={busy}>
            Reenviar link de confirmação
          </Button>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          icon={<LogIn size={18} />}
          className={styles.submit}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <div className={styles.links}>
        <button type="button" className={styles.linkButton} onClick={() => go('forgot')}>
          Esqueci minha senha
        </button>
      </div>
      <hr className={styles.divider} />
      <div className={styles.links}>
        <span className={styles.note}>Ainda não tem conta?</span>
        <button type="button" className={styles.linkButton} onClick={() => go('signup')}>
          Criar conta
        </button>
      </div>
    </AuthLayout>
  );
}

/** Link de e-mail com token: confirma só após um toque (protege contra leitores de link automáticos). */
export function VerifyLinkScreen({ tokenHash, type }: { tokenHash: string; type: 'email' | 'recovery' }) {
  const { auth, clearIntent } = useAuth();
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recovery = type === 'recovery';

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.verifyLink(tokenHash, type);
      if (!recovery) feedback.success('E-mail confirmado. Bem-vindo ao Clareia!');
      clearIntent();
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={recovery ? 'Redefinir senha' : 'Confirmar e-mail'}
      subtitle={recovery ? 'Toque para continuar e escolher uma nova senha.' : 'Toque no botão para ativar sua conta.'}
    >
      {error ? (
        <div role="alert" className={styles.alert}>
          {error}
        </div>
      ) : null}
      <Button variant="primary" className={styles.submit} onClick={() => void confirm()} disabled={busy} aria-busy={busy}>
        {busy ? 'Confirmando…' : recovery ? 'Continuar' : 'Confirmar e-mail'}
      </Button>
      <div className={styles.links}>
        <button type="button" className={styles.linkButton} onClick={clearIntent}>
          Ir para a tela de entrada
        </button>
      </div>
    </AuthLayout>
  );
}

/** Depois do link de redefinição: escolher a nova senha. */
export function NewPasswordScreen() {
  const { auth, endRecovery } = useAuth();
  const feedback = useFeedback();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = validateNewPassword(password, confirm);
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    setError(null);
    try {
      await auth.updatePassword(password);
      feedback.success('Senha alterada. Você já está conectado.');
      endRecovery();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Escolha uma nova senha">
      <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Nova senha" error={errors.password} hint="Pelo menos 8 caracteres, com letras e números.">
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Repita a nova senha" error={errors.confirm}>
          <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error ? (
          <div role="alert" className={styles.alert}>
            {error}
          </div>
        ) : null}
        <Button type="submit" variant="primary" className={styles.submit} disabled={busy} aria-busy={busy}>
          {busy ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  );
}
