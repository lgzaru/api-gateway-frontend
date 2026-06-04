import client from './client'
import type { AxiosResponse } from 'axios'

export interface AuditLogEntry {
  id: string
  actorId: string
  actorUsername: string
  action: string
  entityType: string
  entityId: string
  beforeValue: string | null
  afterValue: string | null
  ipAddress: string
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listAuditLogs = (params: {
  entityType?: string
  entityId?: string
  page?: number
  size?: number
  sort?: string
}): Promise<AxiosResponse<PageResponse<AuditLogEntry>>> =>
  client.get('/tag/audit', { params })

export const listAuditByActor = (
  actorId: string,
  params: { page?: number; size?: number }
): Promise<AxiosResponse<PageResponse<AuditLogEntry>>> =>
  client.get(`/tag/audit/actor/${actorId}`, { params })

export const verifyAuditChecksum = (
  id: string
): Promise<AxiosResponse<{ valid: boolean }>> =>
  client.get(`/tag/audit/${id}/verify`)
