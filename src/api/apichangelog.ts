import client from './client'
import type { AxiosResponse } from 'axios'

export type ChangeType = 'FEATURE' | 'BUGFIX' | 'DEPRECATION' | 'BREAKING_CHANGE' | 'MAINTENANCE' | 'SECURITY' | 'CONFIGURATION'
export type ChangeSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface ApiChangelogEntry {
  id: string
  apiId: string | null
  versionId: string | null
  title: string
  description: string | null
  changeType: ChangeType
  severity: ChangeSeverity
  affectedVersions: string[]
  notificationSent: boolean
  publishedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export const listChangelog = (params?: { apiId?: string; page?: number; size?: number }): Promise<AxiosResponse<PageResponse<ApiChangelogEntry>>> =>
  client.get('/tag/api-changelog', { params })

export const getChangelogEntry = (id: string): Promise<AxiosResponse<ApiChangelogEntry>> =>
  client.get(`/tag/api-changelog/${id}`)

export const createChangelogEntry = (data: {
  apiId?: string
  versionId?: string
  title: string
  description?: string
  changeType: ChangeType
  severity: ChangeSeverity
  affectedVersions?: string[]
}): Promise<AxiosResponse<ApiChangelogEntry>> =>
  client.post('/tag/api-changelog', data)

export const updateChangelogEntry = (id: string, data: {
  title?: string
  description?: string
  changeType?: ChangeType
  severity?: ChangeSeverity
  affectedVersions?: string[]
}): Promise<AxiosResponse<ApiChangelogEntry>> =>
  client.patch(`/tag/api-changelog/${id}`, data)

export const publishChangelogEntry = (id: string): Promise<AxiosResponse<ApiChangelogEntry>> =>
  client.post(`/tag/api-changelog/${id}/publish`)

export const deleteChangelogEntry = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/api-changelog/${id}`)
