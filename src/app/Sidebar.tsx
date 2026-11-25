import {
  CalendarDays,
  CheckCheck,
  Inbox,
  ListTodo,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  Trash2,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { classifyToday, isPendingActive } from '../domain/today';
import { ColorDot } from '../features/lists/ColorDot';
import { useData } from './DataContext';
import { useEditor } from './EditorContext';
import { routes } from './routes';
import { useToday } from './TodayContext';
import styles from './Sidebar.module.css';

interface SidebarProps {
  onNavigate?: () => void;
  label?: string;
}

function NavItem({
  to,
  icon,
  children,
  count,
  onNavigate,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  count?: number | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <li>
      <NavLink
        to={to}
        onClick={onNavigate}
        className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
      >
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.label}>{children}</span>
        {count !== undefined && count > 0 ? (
          <>
            <span className={styles.count} aria-hidden="true">
              {count}
            </span>
            <span className="sr-only">
              , {count} {count === 1 ? 'pendente' : 'pendentes'}
            </span>
          </>
        ) : null}
      </NavLink>
    </li>
  );
}

export function BrandMark() {
  return (
    <span className={styles.brand}>
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <rect width="64" height="64" rx="16" fill="#206A4A" />
        <path d="M18 33l9 9 19-21" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={styles.brandName}>Clareia</span>
    </span>
  );
}

export function Sidebar({ onNavigate, label = 'Principal' }: SidebarProps) {
  const { tasks, lists } = useData();
  const today = useToday();
  const { openListEditor } = useEditor();

  const counts = useMemo(() => {
    const groups = classifyToday(tasks, today);
    const pending = tasks.filter(isPendingActive);
    const byList = new Map<string, number>();
    let inbox = 0;
    for (const t of pending) {
      if (t.listId === null) inbox += 1;
      else byList.set(t.listId, (byList.get(t.listId) ?? 0) + 1);
    }
    return {
      today: groups.focus.length + groups.overdue.length + groups.forToday.length + groups.replan.length,
      inbox,
      byList,
    };
  }, [tasks, today]);

  return (
    <nav aria-label={label} className={styles.nav}>
      <ul className={styles.group}>
        <NavItem to={routes.today} icon={<Sun size={20} />} count={counts.today} onNavigate={onNavigate}>
          Hoje
        </NavItem>
        <NavItem to={routes.inbox} icon={<Inbox size={20} />} count={counts.inbox} onNavigate={onNavigate}>
          Entrada
        </NavItem>
        <NavItem to={routes.upcoming} icon={<CalendarDays size={20} />} onNavigate={onNavigate}>
          Próximas
        </NavItem>
        <NavItem to={routes.all} icon={<ListTodo size={20} />} onNavigate={onNavigate}>
          Todas
        </NavItem>
        <NavItem to={routes.shopping} icon={<ShoppingCart size={20} />} onNavigate={onNavigate}>
          Compras
        </NavItem>
      </ul>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Listas</h2>
        {lists.length > 0 ? (
          <ul className={styles.group}>
            {lists.map((list) => (
              <NavItem
                key={list.id}
                to={routes.list(list.id)}
                icon={<ColorDot color={list.color} />}
                count={counts.byList.get(list.id)}
                onNavigate={onNavigate}
              >
                {list.name}
              </NavItem>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>Crie listas para áreas pessoais ou projetos.</p>
        )}
        <button
          type="button"
          className={styles.newList}
          onClick={(e) => {
            const origin = e.currentTarget;
            onNavigate?.();
            openListEditor(undefined, origin);
          }}
        >
          <Plus size={18} aria-hidden="true" /> Nova lista
        </button>
      </div>

      <ul className={`${styles.group} ${styles.secondary}`}>
        <NavItem to={routes.search} icon={<Search size={20} />} onNavigate={onNavigate}>
          Busca
        </NavItem>
        <NavItem to={routes.completed} icon={<CheckCheck size={20} />} onNavigate={onNavigate}>
          Concluídas
        </NavItem>
        <NavItem to={routes.trash} icon={<Trash2 size={20} />} onNavigate={onNavigate}>
          Lixeira
        </NavItem>
        <NavItem to={routes.settings} icon={<Settings size={20} />} onNavigate={onNavigate}>
          Configurações
        </NavItem>
      </ul>
    </nav>
  );
}
