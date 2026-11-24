import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import styles from './DataContext.module.css';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro inesperado na interface', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={styles.centered}>
        <div className={styles.errorBox} role="alert">
          <h1>Algo deu errado</h1>
          <p>
            Ocorreu um erro inesperado ao mostrar esta tela. Suas tarefas continuam guardadas neste navegador; nada foi
            apagado.
          </p>
          <p className={styles.detail}>Detalhe técnico: {this.state.error.message}</p>
          <Button variant="primary" onClick={() => this.setState({ error: null })}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }
}
