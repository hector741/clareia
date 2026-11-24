import { Bell, BellOff, RotateCcw, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import styles from './Pomodoro.module.css';
import pageStyles from '../../app/pages/page.module.css';
import { DEFAULT_PREFS, PREF_LIMITS, type PomodoroPrefs } from './model';
import { notificationPermission, requestNotifications, type NotifyPermission } from './notify';
import { usePomodoro } from './PomodoroContext';
import type { BellResult } from './sound';

type MinuteKey = keyof typeof PREF_LIMITS;

const FIELDS: { key: MinuteKey; label: string; unit: string }[] = [
  { key: 'focusMinutes', label: 'Foco', unit: 'minutos' },
  { key: 'shortBreakMinutes', label: 'Pausa curta', unit: 'minutos' },
  { key: 'longBreakMinutes', label: 'Pausa longa', unit: 'minutos' },
  { key: 'longBreakEvery', label: 'Pausa longa a cada', unit: 'Pomodoros' },
];

function MinuteField({ name, prefs, onSave }: { name: (typeof FIELDS)[number]; prefs: PomodoroPrefs; onSave(v: number): void }) {
  const limits = PREF_LIMITS[name.key];
  const [text, setText] = useState(String(prefs[name.key]));
  const [error, setError] = useState<string | undefined>();
  const [synced, setSynced] = useState(prefs[name.key]);
  if (synced !== prefs[name.key]) {
    setSynced(prefs[name.key]);
    setText(String(prefs[name.key]));
    setError(undefined);
  }

  const onChange = (value: string) => {
    setText(value);
    const n = Number(value);
    if (value.trim() === '' || !Number.isInteger(n) || n < limits.min || n > limits.max) {
      setError(`Use um número inteiro de ${limits.min} a ${limits.max}.`);
      return;
    }
    setError(undefined);
    setSynced(n);
    onSave(n);
  };

  return (
    <Field label={`${name.label} (${name.unit})`} error={error}>
      <input
        className="control"
        type="number"
        inputMode="numeric"
        min={limits.min}
        max={limits.max}
        step={1}
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

const NOTIFY_TEXT: Record<NotifyPermission, string> = {
  unsupported:
    'Este navegador não oferece notificações aqui. No iPhone, elas só funcionam com o Clareia adicionado à Tela de Início.',
  default: 'Receba um aviso do sistema quando o tempo acabar com o Clareia em outra aba ou minimizado.',
  granted: 'Notificações permitidas neste navegador.',
  denied:
    'As notificações estão bloqueadas para este site. Para ativar, libere a permissão nas configurações do navegador (ícone ao lado do endereço). O aviso na tela e o som continuam funcionando.',
};

const BELL_TEXT: Partial<Record<BellResult, string>> = {
  blocked: 'O navegador bloqueou o som. Clique de novo em "Ouvir o sino" ou em qualquer lugar da página.',
  unsupported: 'Este navegador não reproduz o som. O aviso na tela continua aparecendo.',
};

export function PomodoroSettings() {
  const { prefs, setPrefs, previewBell } = usePomodoro();
  const [permission, setPermission] = useState<NotifyPermission>(notificationPermission);
  const [bellResult, setBellResult] = useState<BellResult | null>(null);
  const [asking, setAsking] = useState(false);
  const volumePct = Math.round(prefs.volume * 100);
  const notificationsOn = prefs.notifications && permission === 'granted';

  const enableNotifications = async () => {
    setAsking(true);
    const result = await requestNotifications();
    setAsking(false);
    setPermission(result);
    setPrefs({ notifications: result === 'granted' });
  };

  const changedDurations = FIELDS.some((f) => prefs[f.key] !== DEFAULT_PREFS[f.key]);

  return (
    <section className={pageStyles.card} aria-labelledby="pomodoro-title">
      <h2 id="pomodoro-title">Pomodoro</h2>
      <p>
        Use o botão de temporizador em uma tarefa para iniciar uma sessão de foco. Ao fim de cada sessão o Clareia
        pergunta se a tarefa foi concluída; nada é concluído automaticamente.
      </p>

      <div className={styles.settingsGrid}>
        {FIELDS.map((f) => (
          <MinuteField key={f.key} name={f} prefs={prefs} onSave={(v) => setPrefs({ [f.key]: v })} />
        ))}
      </div>
      {changedDurations ? (
        <div>
          <Button
            variant="ghost"
            icon={<RotateCcw size={16} />}
            onClick={() =>
              setPrefs({
                focusMinutes: DEFAULT_PREFS.focusMinutes,
                shortBreakMinutes: DEFAULT_PREFS.shortBreakMinutes,
                longBreakMinutes: DEFAULT_PREFS.longBreakMinutes,
                longBreakEvery: DEFAULT_PREFS.longBreakEvery,
              })
            }
          >
            Voltar aos tempos padrão (25, 5 e 15 min)
          </Button>
        </div>
      ) : null}
      <p className={styles.status}>Novos tempos valem a partir da próxima sessão.</p>

      <h3>Som</h3>
      <div className={styles.inline}>
        <Field label={`Volume do sino: ${volumePct}%`}>
          <input
            className={styles.range}
            type="range"
            min={0}
            max={100}
            step={5}
            value={volumePct}
            aria-valuetext={`${volumePct}%`}
            disabled={prefs.muted}
            onChange={(e) => setPrefs({ volume: Number(e.target.value) / 100 })}
          />
        </Field>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={prefs.muted} onChange={(e) => setPrefs({ muted: e.target.checked })} />
          Silenciar o sino
        </label>
        <Button
          variant="secondary"
          icon={<Volume2 size={18} />}
          onClick={() => void previewBell().then(setBellResult)}
        >
          Ouvir o sino
        </Button>
      </div>
      {bellResult && BELL_TEXT[bellResult] ? (
        <p className={styles.statusWarn} role="status">
          {BELL_TEXT[bellResult]}
        </p>
      ) : null}
      <p className={styles.status}>O aviso na tela aparece sempre, com ou sem som.</p>

      <h3>Notificações</h3>
      <p className={permission === 'denied' ? styles.statusWarn : styles.status} role="status">
        {notificationsOn ? 'Notificações ativadas: você será avisado quando o tempo acabar.' : NOTIFY_TEXT[permission]}
      </p>
      {permission === 'default' || (permission === 'granted' && !prefs.notifications) ? (
        <div>
          <Button
            variant="secondary"
            icon={<Bell size={18} />}
            onClick={() => void enableNotifications()}
            disabled={asking}
            aria-busy={asking}
          >
            Ativar notificações
          </Button>
        </div>
      ) : null}
      {notificationsOn ? (
        <div>
          <Button variant="ghost" icon={<BellOff size={18} />} onClick={() => setPrefs({ notifications: false })}>
            Desativar notificações
          </Button>
        </div>
      ) : null}

      <h3>Limitações</h3>
      <ul className={pageStyles.bullets}>
        <li>O alarme só toca com o Clareia aberto, numa aba ou no app instalado. Com o navegador fechado, nada toca.</li>
        <li>
          Se a aba ficar em segundo plano, o navegador pode atrasar o aviso em alguns segundos. O tempo continua certo,
          porque é calculado pelo horário de término.
        </li>
        <li>
          Se o tempo acabar com a página fechada, o aviso aparece uma vez quando você voltar, sem tocar o sino.
        </li>
        <li>Os tempos, o volume e as notificações valem para este aparelho.</li>
      </ul>
    </section>
  );
}
