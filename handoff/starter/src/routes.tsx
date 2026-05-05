import { Navigate, type RouteObject } from 'react-router-dom';
import { App } from './App';

// Эти placeholder'ы — заглушки. Claude Code, замени их на настоящие feature-страницы.
const Placeholder = ({ name }: { name: string }) => (
  <div className="p-8">
    <div className="cd-caps">stub</div>
    <h1 className="text-xl font-semibold mt-1">{name}</h1>
    <p className="text-text-mute mt-2">Реализация по spec/screens/.</p>
  </div>
);

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',                element: <Placeholder name="Дашборд офицера" /> },
      { path: 'clients',                  element: <Placeholder name="Реестр клиентов" /> },
      { path: 'clients/:id',              element: <Navigate to="anketa" replace /> },
      { path: 'clients/:id/anketa',       element: <Placeholder name="Карточка · Анкета" /> },
      { path: 'clients/:id/documents',    element: <Placeholder name="Карточка · Документы" /> },
      { path: 'clients/:id/ubo',          element: <Placeholder name="Карточка · УБО" /> },
      { path: 'clients/:id/scoring',      element: <Placeholder name="Карточка · Скоринг" /> },
      { path: 'clients/:id/sanctions',    element: <Placeholder name="Карточка · Санкции" /> },
      { path: 'clients/:id/transactions', element: <Placeholder name="Карточка · Транзакции" /> },
      { path: 'clients/:id/history',      element: <Placeholder name="Карточка · История" /> },
      { path: 'onboarding/le/:id?/:step?', element: <Placeholder name="Онбординг ЮЛ" /> },
      { path: 'onboarding/pf/:id?/:step?', element: <Placeholder name="Онбординг ФЛ" /> },
      { path: 'admin/users',     element: <Placeholder name="Админ · Пользователи" /> },
      { path: 'admin/roles',     element: <Placeholder name="Админ · Роли" /> },
      { path: 'admin/audit',     element: <Placeholder name="Админ · Аудит-лог" /> },
      { path: 'admin/scoring',   element: <Placeholder name="Админ · Скоринг" /> },
    ],
  },
  { path: '/portal', element: <Placeholder name="Личный кабинет клиента" /> },
  { path: '*',        element: <Placeholder name="404" /> },
];
