import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientCard from './pages/ClientCard'
import Sanctions from './pages/Sanctions'
import UBOs from './pages/UBOs'
import PEP from './pages/PEP'
import IPDS from './pages/IPDS'
import Documents from './pages/Documents'
import Transactions from './pages/Transactions'
import Regulations from './pages/Regulations'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

// Защищённый роут — если не авторизован, редиректит на /login
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

// Заглушка для страниц которые ещё не разработаны
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <p className="text-[#d4a843] text-4xl mb-3">⚙</p>
        <h2 className="text-white font-semibold">{title}</h2>
        <p className="text-[#6b7280] text-sm mt-1">Модуль в разработке</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />

          {/* Этап 2 */}
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientCard />} />
          <Route path="ubos" element={<UBOs />} />
          <Route path="sof" element={<IPDS />} />
          <Route path="pep" element={<PEP />} />

          {/* Этап 3 */}
          <Route path="sanctions" element={<Sanctions />} />
          <Route path="sumsub" element={<ComingSoon title="Sumsub" />} />

          {/* Этап 4+ */}
          <Route path="documents" element={<Documents />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="reports" element={<Reports />} />
          <Route path="regulations" element={<Regulations />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
