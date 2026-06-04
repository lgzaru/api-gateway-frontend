import client from './client'

export interface KongSyncLog {
  id: string
  proxyApiId: string
  action: string
  status: string
  kongServiceId: string | null
  kongRouteId: string | null
  errorMessage: string | null
  createdAt: string
}

export interface KongPageResponse {
  content: KongSyncLog[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export function listKongLogs(params?: { proxyApiId?: string; page?: number; size?: number }) {
  return client.get<KongPageResponse>('/tag/kong/logs', { params })
}

export function syncApiToKong(proxyApiId: string) {
  return client.post<KongSyncLog>('/tag/kong/sync', { proxyApiId })
}

export function deleteFromKong(proxyApiId: string) {
  return client.delete<KongSyncLog>(`/tag/kong/sync/${proxyApiId}`)
}
