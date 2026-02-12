import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { ViewSkeleton } from '@/components/molecules/ViewSkeleton';
import { AppShell } from '@/components/organisms/AppShell';
import { ErrorBoundary } from '@/components/organisms/ErrorBoundary';
import { queryClient } from '@/shared/api/queryClient';
import { useViewStore } from '@/stores/viewStore';
import '@/i18n';
import './styles/globals.css';

// ---------------------------------------------------------------------------
// Lazy-loaded views — each chunk is fetched on demand
// ---------------------------------------------------------------------------

const HomePage = lazy(() => import('@/features/home/components/HomePage'));
const OllamaChatView = lazy(() => import('@/features/chat/components/OllamaChatView'));
const AgentsView = lazy(() => import('@/features/agents/components/AgentsView'));
const HistoryView = lazy(() => import('@/features/history/components/HistoryView'));
const SettingsView = lazy(() => import('@/features/settings/components/SettingsView'));

// ---------------------------------------------------------------------------
// ViewRouter — maps the current view id to the correct lazy component
// ---------------------------------------------------------------------------

function ViewRouter() {
  const currentView = useViewStore((s) => s.currentView);
  switch (currentView) {
    case 'home':
      return <HomePage />;
    case 'chat':
      return <OllamaChatView />;
    case 'agents':
      return <AgentsView />;
    case 'history':
      return <HistoryView />;
    case 'settings':
      return <SettingsView />;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AppShell>
          <Suspense fallback={<ViewSkeleton />}>
            <ViewRouter />
          </Suspense>
        </AppShell>
      </ErrorBoundary>
      <Toaster
        position="bottom-right"
        theme="dark"
        richColors
        toastOptions={{
          style: {
            background: 'var(--matrix-bg-secondary)',
            border: '1px solid var(--matrix-accent)',
            color: 'var(--matrix-text-primary)',
          },
        }}
      />
    </QueryClientProvider>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
