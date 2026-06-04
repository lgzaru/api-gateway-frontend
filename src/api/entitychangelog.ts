import client from './client'

export interface ChangelogEntry {
  id: string
  entityType: string
  entityId: string
  action: string
  actorId: string
  changes: string | null
  createdAt: string
}

export interface ChangelogPageResponse {
  content: ChangelogEntry[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export function listChangelogByEntity(entityType: string, entityId: string, params?: { page?: number; size?: number }) {
  return client.get<ChangelogPageResponse>(`/tag/changelog/entity/${entityType}/${entityId}`, { params })
}

export function listChangelogByActor(actorId: string, params?: { page?: number; size?: number }) {
  return client.get<ChangelogPageResponse>(`/tag/changelog/actor/${actorId}`, { params })
}
