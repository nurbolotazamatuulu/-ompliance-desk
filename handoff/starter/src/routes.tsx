import { Navigate, type RouteObject } from 'react-router-dom';
import { App } from './App';
import ComponentsGallery from './features/_dev/ComponentsGallery';
import ClientsListPage from './features/clients-list/ClientsListPage';

// Эти placeholder'ы — заглушки. Phase C-E их заменяют на feature-страницы.
const Placeholder = ({ name }: { name: string }) => (
  <div className="p-8">
    <div className="cd-caps">stub</div>
    <h1 className="text-xl font-semibold mt-1">{name}</h1>
    <p className="text-text-mute mt-2">Реализация по spec/screens/.</p>
  </div>
);

const baseChildren: RouteObject[] = [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: 'dashboard',                element: <Placeholder name="Дашборд офицера" /> },
  { path: 'clients',                  element: <ClientsListPage /> },
  { path: 'clients/:id',              element: <Navigate to="anketa" replace /> },
  { path: 'clients/:id/anketa',       element: <Placeholder name="Карточка · Анкета" /> },
  { path: 'clients/:id/documents',    element: <Placeholder name="Карточка · Документы" /> },
  { path: 'clients/:id/ubo',          element: <Placeholder name="Карточка · УБО" /> },
  { path: 'clients/:id/scoring',      element: <Placeholder name="Карточка · Скоринг" /> },
  { path: 'clients/:id/sanctions',    element: <Placeholder name="Карточка · Санкции" /> },
  { path: 'clients/:id/bv',           element: <Placeholder name="Карточка · БВ" /> },
  { path: 'clients/:id/transactions', element: <Placeholder name="Карточка · Транзакции" /> },
  { path: 'clients/:id/history',      element: <Placeholder name="Карточка · История" /> },
  { path: 'onboarding/le/:id?/:step?', element: <Placeholder name="Онбординг ЮЛ" /> },
  { path: 'onboarding/pf/:id?/:step?', element: <Placeholder name="Онбординг ФЛ" /> },
  { path: 'admin/users',     element: <Placeholder name="Админ · Пользователи" /> },
  { path: 'admin/roles',     element: <Placeholder name="Админ · Роли" /> },
  { path: 'admin/audit',     element: <Placeholder name="Админ · Аудит-лог" /> },
  { path: 'admin/scoring',   element: <Placeholder name="Админ · Скоринг" /> },
];

// DEV-only: /_dev/components смонтирован вне App layout (full-page gallery).
// import.meta.env.DEV — в production-build (vite build) этот route отсутствует.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: '/_dev/components', element: <ComponentsGallery /> }]
  : [];

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: baseChildren,
  },
  ...devRoutes,
  { path: '/portal', element: <Placeholder name="Личный кабинет клиента" /> },
  { path: '*',        element: <Placeholder name="404" /> },
];
