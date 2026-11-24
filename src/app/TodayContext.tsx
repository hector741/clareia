import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { msUntilNextLocalMidnight, todayLocal } from '../domain/dates';

const TodayContext = createContext<string>(todayLocal());

export function useToday(): string {
  return useContext(TodayContext);
}

/**
 * Mantém a data local atual. Recalcula na virada do dia, ao voltar para a aba
 * e periodicamente (cobre suspensão do aparelho e mudança de fuso/relógio).
 */
export function TodayProvider({ children }: { children: ReactNode }) {
  const [today, setToday] = useState(() => todayLocal());

  useEffect(() => {
    const refresh = () => setToday((current) => {
      const next = todayLocal();
      return next === current ? current : next;
    });

    let midnightTimer = 0;
    const scheduleMidnight = () => {
      window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(() => {
        refresh();
        scheduleMidnight();
      }, msUntilNextLocalMidnight() + 250);
    };
    scheduleMidnight();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        scheduleMidnight();
      }
    };
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.clearTimeout(midnightTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);

  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>;
}
