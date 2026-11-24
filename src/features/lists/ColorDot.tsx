import type { ListColor } from '../../domain/types';
import styles from './ColorDot.module.css';

/** Marcador decorativo; o nome da lista/cor sempre aparece em texto ao lado. */
export function ColorDot({ color }: { color: ListColor }) {
  return <span className={`${styles.dot} ${styles[color]}`} aria-hidden="true" />;
}
