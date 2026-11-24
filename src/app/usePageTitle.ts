import { useEffect } from 'react';
import { setPageTitle } from './documentTitle';

export function usePageTitle(title: string): void {
  useEffect(() => {
    setPageTitle(`${title} · Clareia`);
  }, [title]);
}
