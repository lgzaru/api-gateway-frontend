import client from './client'
import type { AxiosResponse } from 'axios'

export type VersionStatus = 'ACTIVE' | 'DEPRECATED' | 'SUNSET'

export interface VersionEntry {
  id: string
  proxyApiId: string
  version: string
  status: VersionStatus
  deprecatedAt: string | null
  sunsetAt: string | null
  migrationGuide: string | null
  createdAt: string
}

export interface DeprecationNotice {
  id: string
  versionId: string
  sentTo: string[]
  sentAt: string
  message: string
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export const listVersions = (proxyApiId: string, params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<VersionEntry>>> =>
  client.get('/tag/versions', { params: { proxyApiId, ...params } })

export const registerVersion = (data: {
  version: string
  proxyApiId: string
}): Promise<AxiosResponse<VersionEntry>> =>
  client.post('/tag/versions', data)

export const deprecateVersion = (id: string, data: {
  deprecatedAt: string
  sunsetAt?: string
  migrationGuide?: string
}): Promise<AxiosResponse<VersionEntry>> =>
  client.put(`/tag/versions/${id}/deprecate`, data)

export const sunsetVersion = (id: string): Promise<AxiosResponse<VersionEntry>> =>
  client.put(`/tag/versions/${id}/sunset`)

export const deleteVersion = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/versions/${id}`)

export const listNotices = (versionId: string, params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<DeprecationNotice>>> =>
  client.get(`/tag/versions/${versionId}/notices`, { params })

export const sendNotice = (versionId: string, data: {
  recipients: string[]
  message: string
}): Promise<AxiosResponse<DeprecationNotice>> =>
  client.post(`/tag/versions/${versionId}/notices`, data)
