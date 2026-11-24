import * as Dialog from '@radix-ui/react-dialog';
import { CalendarDays, Inbox, Menu, MoreHorizontal, Plus, Search, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, matchPath, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import dialogStyles from '../components/ui/Dialog.module.css';
import { todayLocal } from '../domain/dates';
import { useEditor } from './EditorContext';
import { routes } from './routes';
import { BrandMark, Sidebar } from './Sidebar';
import { useLayoutMode } from './useLayoutMode';
import styles from './AppShell.module.css';

/** Padrões razoáveis para "Nova tarefa" no cabeçalho conforme a tela atual. */
function useNewTaskDefaults() {
  const { pathname } = useLocation();
  return () => {
    const list = matchPath('/listas/:id', pathname);
    if (list?.params.id) return { listId: list.params.id };
    if (pathname === routes.today) return { plannedDate: todayLocal() };
    return {};
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const mode = useLayoutMode();
  const { openNewTask } = useEditor();
  const defaults = useNewTaskDefaults();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Ao navegar, leva o foco à região principal (padrão de aplicações de página única).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('[role="dialog"], [role="alertdialog"]')) return;
      mainRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const newTaskButton = (
    <Button
      variant="primary"
      icon={<Plus size={18} />}
      onClick={(e) => openNewTask({ defaults: defaults(), origin: e.currentTarget })}
    >
      Nova tarefa
    </Button>
  );

  return (
    <div className={`${styles.shell} ${styles[mode]}`}>
      <a href="#main-content" className={styles.skip} onClick={(e) => {
        e.preventDefault();
        mainRef.current?.focus();
      }}>
        Ir para o conteúdo
      </a>

      {mode === 'desktop' ? (
        <aside className={styles.sidebar}>
          <div className={styles.sidebarBrand}>
            <BrandMark />
          </div>
          <Sidebar />
        </aside>
      ) : null}

      <div className={styles.column}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            {mode === 'tablet' ? (
              <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
                <Dialog.Trigger asChild>
                  <Button variant="secondary" icon={<Menu size={20} />} aria-label="Abrir menu de navegação">
                    Menu
                  </Button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className={dialogStyles.overlay} />
                  <Dialog.Content className={styles.drawer} aria-describedby={undefined}>
                    <div className={styles.drawerHeader}>
                      <Dialog.Title asChild>
                        <span>
                          <BrandMark />
                        </span>
                      </Dialog.Title>
                      <Dialog.Close asChild>
                        <Button variant="ghost" iconOnly aria-label="Fechar menu" icon={<X size={22} />} />
                      </Dialog.Close>
                    </div>
                    <Sidebar label="Menu de navegação" onNavigate={() => setMenuOpen(false)} />
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            ) : null}
            {mode !== 'desktop' ? <BrandMark /> : null}
            <div className={styles.headerSpacer} />
            {mode === 'mobile' ? (
              <NavLink
                to={routes.search}
                aria-label="Buscar"
                className={({ isActive }) => `${styles.appBarAction} ${isActive ? styles.appBarActionActive : ''}`}
              >
                <Search size={22} aria-hidden="true" />
              </NavLink>
            ) : (
              newTaskButton
            )}
          </div>
        </header>

        <main id="main-content" ref={mainRef} tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>

      {mode === 'mobile' ? (
        <>
          <div className={styles.fab}>{newTaskButton}</div>
          <MobileNav />
        </>
      ) : null}
    </div>
  );
}

function MobileNav() {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = [routes.today, routes.inbox, routes.upcoming] as const;
  const moreActive = !primary.some((p) => pathname === p);

  const item = (to: string, label: string, icon: ReactNode) => (
    <NavLink
      to={to}
      className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );

  return (
    <nav aria-label="Navegação principal" className={styles.bottomNav}>
      {item(routes.today, 'Hoje', <Sun size={22} />)}
      {item(routes.inbox, 'Entrada', <Inbox size={22} />)}
      {item(routes.upcoming, 'Próximas', <CalendarDays size={22} />)}
      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Trigger asChild>
          <button type="button" className={`${styles.tab} ${moreActive ? styles.tabActive : ''}`}>
            <span aria-hidden="true">
              <MoreHorizontal size={22} />
            </span>
            <span>Mais</span>
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className={dialogStyles.overlay} />
          <Dialog.Content className={styles.sheet} aria-describedby={undefined}>
            <div className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.drawerHeader}>
              <Dialog.Title className={styles.sheetTitle}>Mais</Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" iconOnly aria-label="Fechar" icon={<X size={22} />} />
              </Dialog.Close>
            </div>
            <div className={styles.sheetBody}>
              <Sidebar label="Mais" onNavigate={() => setMoreOpen(false)} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </nav>
  );
}
