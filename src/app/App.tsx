import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { ConfirmProvider } from './ConfirmContext';
import { backend } from '../backend';
import { LegacyImportPrompt } from '../features/account/LegacyImport';
import { PomodoroProvider } from '../features/pomodoro/PomodoroContext';
import { AuthGate } from './AuthGate';
import { EditorProvider } from './EditorContext';
import { ErrorBoundary } from './ErrorBoundary';
import { FeedbackProvider } from './feedback';
import { AllPage } from './pages/AllPage';
import { CompletedPage } from './pages/CompletedPage';
import { InboxPage } from './pages/InboxPage';
import { ListPage } from './pages/ListPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';
import { TrashPage } from './pages/TrashPage';
import { UpcomingPage } from './pages/UpcomingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TodayProvider } from './TodayContext';
import { useLayoutMode } from './useLayoutMode';

export function App() {
  useLayoutMode();
  return (
    <ErrorBoundary>
      <FeedbackProvider>
        <AuthGate backend={backend}>
          <TodayProvider>
            <HashRouter>
              <ConfirmProvider>
                <EditorProvider>
                  <PomodoroProvider>
                    <AppShell>
                      <Routes>
                        <Route path="/" element={<Navigate to="/hoje" replace />} />
                        <Route path="/hoje" element={<TodayPage />} />
                        <Route path="/entrada" element={<InboxPage />} />
                        <Route path="/proximas" element={<UpcomingPage />} />
                        <Route path="/todas" element={<AllPage />} />
                        <Route path="/listas/:id" element={<ListPage />} />
                        <Route path="/busca" element={<SearchPage />} />
                        <Route path="/concluidas" element={<CompletedPage />} />
                        <Route path="/lixeira" element={<TrashPage />} />
                        <Route path="/configuracoes" element={<SettingsPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Routes>
                    </AppShell>
                  </PomodoroProvider>
                </EditorProvider>
              </ConfirmProvider>
            </HashRouter>
          </TodayProvider>
          <LegacyImportPrompt />
        </AuthGate>
      </FeedbackProvider>
    </ErrorBoundary>
  );
}
