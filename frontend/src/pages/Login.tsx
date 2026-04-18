import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { authApi } from '../api/client'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data } = await authApi.login(email, password)
      setAuth(data.access_token, data.user)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка входа. Проверьте данные.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center p-4">

      {/* Фоновая сетка */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#d4a843 1px, transparent 1px), linear-gradient(90deg, #d4a843 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      <div className="relative w-full max-w-md">

        {/* Логотип */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#d4a843]/10 border border-[#d4a843]/30 mb-4">
            <Shield className="w-8 h-8 text-[#d4a843]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            COMPLIANCE<span className="text-[#d4a843]">DESK</span>
          </h1>
          <p className="text-[#6b7280] text-sm mt-1">Система управления комплаенсом</p>
        </div>

        {/* Форма */}
        <div className="bg-[#111520] border border-[#1e2535] rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-6">Вход в систему</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-[#9ca3af] uppercase tracking-wider mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-4 py-3 text-white text-sm placeholder-[#374151] focus:outline-none focus:border-[#d4a843]/50 focus:ring-1 focus:ring-[#d4a843]/20 transition-colors"
                placeholder="officer@company.kg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9ca3af] uppercase tracking-wider mb-2">
                Пароль
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-4 py-3 pr-12 text-white text-sm placeholder-[#374151] focus:outline-none focus:border-[#d4a843]/50 focus:ring-1 focus:ring-[#d4a843]/20 transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-[#9ca3af] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 disabled:cursor-not-allowed text-[#0a0d14] font-bold py-3 rounded-lg text-sm uppercase tracking-widest transition-all duration-200"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        </div>

        <p className="text-center text-[#374151] text-xs mt-6">
          ComplianceDesk v1.0 · AML/CFT Platform
        </p>
      </div>
    </div>
  )
}
