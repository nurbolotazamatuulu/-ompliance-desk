import {
  ArrowLeftRight,
  Calculator,
  FileText,
  FileUser,
  GitBranch,
  History,
  Shield,
  Users,
} from 'lucide-react';
import { Navigate, type RouteObject } from 'react-router-dom';
import { App } from './App';
import ComponentsGallery from './features/_dev/ComponentsGallery';
import ClientsListPage from './features/clients-list/ClientsListPage';
import DashboardPage from './features/dashboard/DashboardPage';
import ClientCardPage from './features/client-card/ClientCardPage';
import TabPlaceholder from './features/client-card/TabPlaceholder';

// Эти placeholder'ы — заглушки. Phase C-E их заменяют на feature-страницы.
const Placeholder = ({ name }: { name: string }) => (
  <div className="p-8">
    <div className="cd-caps">stub</div>
    <h1 className="text-xl font-semibold mt-1">{name}</h1>
    <p className="text-text-mute mt-2">Реализация по spec/screens/.</p>
  </div>
);

// ClientCard — 8 tabs nested под parent ClientCardPage. Phase E1: все 8 —
// generic TabPlaceholder; Phase E2/E3 заменят отдельные tab-роуты на
// реальные feature-страницы (Анкета ФЛ/ЮЛ/БВ + Скоринг + Санкции).
//   /anketa       → Phase E2a/E2b
//   /scoring      → Phase E3
//   /sanctions    → Phase E3
//   /bv           → Phase E2c
//   /documents    → Stage 3
//   /ubo          → Stage 4
//   /transactions → Stage 8 backend
//   /history      → Stage 3
const clientCardChildren: RouteObject[] = [
  { index: true, element: <Navigate to="anketa" replace /> },
  {
    path: 'anketa',
    element: (
      <TabPlaceholder
        icon={FileUser}
        title="Анкета"
        subtitle="Идентификация ФЛ/ЮЛ согласно Положению о CDD (Приложения 1–2)"
      />
    ),
  },
  {
    path: 'scoring',
    element: (
      <TabPlaceholder
        icon={Calculator}
        title="Скоринг"
        subtitle="4-блочная модель A+B+C+D с детализацией сработавших правил"
      />
    ),
  },
  {
    path: 'sanctions',
    element: (
      <TabPlaceholder
        icon={Shield}
        title="Санкции"
        subtitle="Совпадения и разрешение через диалог обоснования"
      />
    ),
  },
  {
    path: 'bv',
    element: (
      <TabPlaceholder
        icon={Users}
        title="БВ"
        subtitle="Бенефициарные владельцы (16-вариантный controlBasis)"
      />
    ),
  },
  {
    path: 'documents',
    element: (
      <TabPlaceholder
        icon={FileText}
        title="Документы"
        subtitle="Загрузка и трекинг документов клиента"
      />
    ),
  },
  {
    path: 'ubo',
    element: (
      <TabPlaceholder
        icon={GitBranch}
        title="УБО"
        subtitle="Граф контроля и юридическая структура"
      />
    ),
  },
  {
    path: 'transactions',
    element: (
      <TabPlaceholder
        icon={ArrowLeftRight}
        title="Транзакции"
        subtitle="Реестр операций + KYT-граф"
      />
    ),
  },
  {
    path: 'history',
    element: (
      <TabPlaceholder
        icon={History}
        title="История"
        subtitle="Аудит-лог действий по клиенту"
      />
    ),
  },
];

const baseChildren: RouteObject[] = [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: 'dashboard',                element: <DashboardPage /> },
  { path: 'clients',                  element: <ClientsListPage /> },
  { path: 'clients/:id',              element: <ClientCardPage />, children: clientCardChildren },
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
