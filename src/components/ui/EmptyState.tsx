import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'danger';
}

export function EmptyState({ title, children, icon, action, tone = 'default' }: EmptyStateProps) {
  return (
    <div className={`${styles.empty} ${tone === 'danger' ? styles.danger : ''}`}>
      {icon ? <div className={styles.icon} aria-hidden="true">{icon}</div> : null}
      <h2 className={styles.title}>{title}</h2>
      {children ? <div className={styles.text}>{children}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
