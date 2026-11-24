import { Eye, EyeOff } from 'lucide-react';
import { useState, type InputHTMLAttributes } from 'react';
import styles from './AuthScreen.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** Campo de senha com botão para mostrar/ocultar. Recebe id e aria-* do `Field`. */
export function PasswordInput(props: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.passwordWrap}>
      <input {...props} type={visible ? 'text' : 'password'} className="control" />
      <button
        type="button"
        className={styles.reveal}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
