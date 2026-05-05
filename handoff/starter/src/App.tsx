import { Outlet } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';

/**
 * Корневой layout приложения комплаенс-офицера.
 *
 * Боковое меню фиксированной ширины + правая колонка со sticky-header
 * и роутинг-outlet'ом. Личный кабинет клиента (/portal) использует
 * собственный layout — см. routes.tsx.
 */
export function App() {
  return (
    <div className="min-h-screen flex bg-bg text-text">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <Header />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
