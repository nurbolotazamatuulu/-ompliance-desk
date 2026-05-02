import api from './client'

export const clientsApi = {
  list: (params?: {
    client_type?: string
    status?: string
    risk_level?: string
    search?: string
    is_resident?: boolean
    manager_code?: string
    is_high_risk_country?: boolean
    contract_date_from?: string
    contract_date_to?: string
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

  listDirectors: (id: number) => api.get(`/clients/${id}/directors`),
  createDirector: (id: number, data: Record<string, any>) => api.post(`/clients/${id}/directors`, data),
  updateDirector: (id: number, directorId: number, data: Record<string, any>) =>
    api.patch(`/clients/${id}/directors/${directorId}`, data),
  deleteDirector: (id: number, directorId: number) => api.delete(`/clients/${id}/directors/${directorId}`),

  listRepresentatives: (id: number) => api.get(`/clients/${id}/representatives`),
  createRepresentative: (id: number, data: Record<string, any>) => api.post(`/clients/${id}/representatives`, data),
  updateRepresentative: (id: number, repId: number, data: Record<string, any>) =>
    api.patch(`/clients/${id}/representatives/${repId}`, data),
  deleteRepresentative: (id: number, repId: number) => api.delete(`/clients/${id}/representatives/${repId}`),

  updateStatus: (id: number, status: string, notes?: string) =>
    api.patch(`/clients/${id}/status`, { status, notes }),

  archive: (id: number, reason?: string) =>
    api.delete(`/clients/${id}`, { params: reason ? { reason } : {} }),

  restore: (id: number) => api.post(`/clients/${id}/restore`),

  deletePermanent: (id: number) => api.delete(`/clients/${id}/permanent`),

  listArchived: () => api.get('/clients/archived'),

  deactivate: (id: number) => api.delete(`/clients/${id}`),
}
