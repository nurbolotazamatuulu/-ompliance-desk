import api from './client'

export const clientsApi = {
  list: (params?: {
    client_type?: string
    status?: string
    risk_level?: string
    search?: string
  }) => api.get('/clients', { params }),

  get: (id: number) => api.get(`/clients/${id}`),

  create: (data: {
    client_type: string
    contract_number?: string
    contract_date?: string
    manager_code?: string
  }) => api.post('/clients', data),

  updateIndividual: (id: number, data: Record<string, any>) =>
    api.patch(`/clients/${id}/individual`, data),

  updateLegal: (id: number, data: Record<string, any>) =>
    api.patch(`/clients/${id}/legal`, data),

  updateStatus: (id: number, status: string, notes?: string) =>
    api.patch(`/clients/${id}/status`, { status, notes }),

  deactivate: (id: number) => api.delete(`/clients/${id}`),
}
