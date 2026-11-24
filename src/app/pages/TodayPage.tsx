import { Sparkles, Sun } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatLongDate } from '../../domain/dates';
import { classifyToday, countCompletedOn } from '../../domain/today';
import { MAX_FOCUS } from '../../domain/types';
import { QuickAddTask } from '../../features/tasks/QuickAddTask';
import { TaskGroup } from '../../features/tasks/TaskGroup';
import { useData } from '../DataContext';
import { useToday } from '../TodayContext';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

export function TodayPage() {
  usePageTitle('Hoje');
  const today = useToday();
  const { tasks } = useData();
  const groups = useMemo(() => classifyToday(tasks, today), [tasks, today]);
  const completedToday = useMemo(() => countCompletedOn(tasks, today), [tasks, today]);

  const isEmpty =
    groups.focus.length + groups.overdue.length + groups.forToday.length + groups.replan.length === 0;
  const firstUse = tasks.length === 0;
  const completedLabel = `${completedToday} ${completedToday === 1 ? 'concluída' : 'concluídas'} hoje`;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Hoje"
        subtitle={
          <>
            {capitalize(formatLongDate(today))} · <span className={styles.counter}>{completedLabel}</span>
          </>
        }
      />
      <QuickAddTask target={{ listId: null, planToday: true, label: 'Hoje' }} autoFocus={firstUse} />

      {firstUse ? (
        <EmptyState title="Comece com a sua primeira tarefa" icon={<Sparkles size={32} />}>
          <p>
            Escreva acima o que você precisa fazer e pressione Enter. Só o título é necessário; datas, listas e etapas
            ficam para quando você precisar.
          </p>
        </EmptyState>
      ) : isEmpty ? (
        <EmptyState title="Nada pendente para hoje" icon={<Sun size={32} />}>
          <p>
            Seu dia está livre. Use a captura acima para planejar algo, escolha tarefas na Entrada ou em Próximas, ou
            aproveite o descanso.
          </p>
        </EmptyState>
      ) : (
        <div className={styles.page}>
          {groups.focus.length === 0 ? (
            <p className={styles.tip}>
              Escolha até {MAX_FOCUS} tarefas para o foco do dia: abra o menu de uma tarefa e use “Focar hoje”.
            </p>
          ) : null}
          {groups.focus.length > 0 ? (
            <TaskGroup
              title="Em foco"
              tone="focus"
              tasks={groups.focus}
              description={`${groups.focus.length} de ${MAX_FOCUS} vagas de foco usadas.`}
            />
          ) : null}
          {groups.overdue.length > 0 ? (
            <TaskGroup title="Prazo passou" tone="danger" tasks={groups.overdue} />
          ) : null}
          {groups.forToday.length > 0 ? <TaskGroup title="Para hoje" tasks={groups.forToday} /> : null}
          {groups.replan.length > 0 ? (
            <TaskGroup
              title="Replanejar"
              tone="warning"
              tasks={groups.replan}
              description="Você tinha planejado estas tarefas para antes de hoje. Escolha uma nova data em Fazer em ou foque hoje."
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
