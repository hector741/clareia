import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';
import { routes } from '../routes';
import { usePageTitle } from '../usePageTitle';
import styles from './page.module.css';

export function NotFoundPage() {
  usePageTitle('Página não encontrada');
  return (
    <div className={styles.page}>
      <EmptyState title="Página não encontrada" tone="danger">
        <p>Este endereço não existe no Clareia.</p>
        <p>
          <Link to={routes.today}>Ir para Hoje</Link>
        </p>
      </EmptyState>
    </div>
  );
}
