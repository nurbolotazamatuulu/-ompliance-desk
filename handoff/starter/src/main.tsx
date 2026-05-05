import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import { routes } from './routes';
import './styles/tokens.css';
import './styles/index.css';

// Восстанавливаем тему из localStorage до маунта, чтобы не моргало
const savedTheme = localStorage.getItem('cd:theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;

const router = createBrowserRouter(routes);

/**
 * QueryClient defaults (Stage 2 Phase A — locked decision Q5):
 * - staleTime: Infinity — данные считаются свежими до явной invalidation.
 *   Compliance officer работает long-form, не нужны фоновые refetch'и.
 * - gcTime: 5min — освобождать неиспользуемый кэш после 5 минут.
 * - retry: 1 — один retry на network blip.
 * - refetchOnWindowFocus: false — нет мерцаний при переключении вкладок.
 * - refetchOnReconnect: true — после disconnect refresh нужен.
 *
 * Per-query overrides: Дашборд queue (`useDashboardQueue`) — единственное явное
 * исключение с refetchInterval: 60000 (Phase D).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <RouterProvider router={router} />
      </NuqsAdapter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
);
