import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Перехватчик запросов — автоматически добавляет токен в каждый запрос
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Перехватчик ответов
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    } else if (status === 403) {
      console.warn('Доступ запрещён:', error.config?.url)
    } else if (status >= 500) {
      console.error('Ошибка сервера:', status, error.config?.url, error.response?.data?.detail)
    }
    return Promise.reject(error)
  }
)

export default api

// Auth endpoints
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', new URLSearchParams({ username: email, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }),
  me: () => api.get('/auth/me'),
}
