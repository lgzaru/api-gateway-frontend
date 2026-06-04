import client from './client'

export type IceEngineStatus = 'ACTIVE' | 'INACTIVE'
export type IceEngineEnvironment = 'prod' | 'dev' | 'sandbox'

export interface IceEngineApi {
  id: string
  name: string
  description: string | null
  sqlScript: string
  generatedApiUrl: string
  hasApiKey: boolean
  status: IceEngineStatus
  environment: IceEngineEnvironment
  rateLimit: number
  rateLimitWindow: number
  currentVersion: number
  registeredBy: string | null
  createdAt: string
  updatedAt: string
}

export interface RegisterApiResponse {
  id: string
  name: string
  generatedApiUrl: string
  apiKey: string
  status: IceEngineStatus
  environment: IceEngineEnvironment
  currentVersion: number
  createdAt: string
}

export interface TokenRenewResponse {
  apiId: string
  newApiKey: string
  renewedAt: string
}

export interface VersionSummary {
  id: string
  versionNumber: number
  changeNote: string | null
  createdBy: string | null
  createdAt: string
  restoredFrom: number | null
}

export interface VersionDetail extends VersionSummary {
  apiId: string
  sqlScript: string
}

export interface IceEngineConfig {
  prodOracleUrl: string | null
  devOracleUrl: string | null
  sandboxOracleUrl: string | null
  activeEnvironment: string | null
  activeOracleUrl: string | null
  poolMaxSize: string | null
}

export interface IceEnginePageResponse {
  content: IceEngineApi[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

// Config
export function getIceEngineConfig() {
  return client.get<IceEngineConfig>('/tag/iceengine/config')
}

export function updateIceEngineConfig(data: Partial<IceEngineConfig> & { activeEnvironment?: string }) {
  return client.put<IceEngineConfig>('/tag/iceengine/config', data)
}

// API CRUD
export function listIceEngineApis(params?: { page?: number; size?: number }) {
  return client.get<IceEnginePageResponse>('/tag/iceengine/apis', { params })
}

export function getIceEngineApi(id: string) {
  return client.get<IceEngineApi>(`/tag/iceengine/apis/${id}`)
}

export function registerIceEngineApi(data: {
  name: string
  description?: string
  sqlScript: string
  environment?: IceEngineEnvironment
  rateLimit?: number
  rateLimitWindow?: number
  changeNote?: string
}) {
  return client.post<RegisterApiResponse>('/tag/iceengine/apis', data)
}

export function updateIceEngineApi(id: string, data: {
  name?: string
  description?: string
  sqlScript: string
  rateLimit?: number
  rateLimitWindow?: number
  changeNote: string
}) {
  return client.put<IceEngineApi>(`/tag/iceengine/apis/${id}`, data)
}

export function deleteIceEngineApi(id: string) {
  return client.delete<void>(`/tag/iceengine/apis/${id}`)
}

export function changeIceEngineApiStatus(id: string, status: IceEngineStatus) {
  return client.patch<IceEngineApi>(`/tag/iceengine/apis/${id}/status`, { status })
}

// Token management
export function renewIceEngineToken(id: string) {
  return client.post<TokenRenewResponse>(`/tag/iceengine/apis/${id}/renew-token`)
}

// Version history
export function listIceEngineVersions(id: string) {
  return client.get<VersionSummary[]>(`/tag/iceengine/apis/${id}/versions`)
}

export function getIceEngineVersion(id: string, versionNumber: number) {
  return client.get<VersionDetail>(`/tag/iceengine/apis/${id}/versions/${versionNumber}`)
}

export function restoreIceEngineVersion(id: string, versionNumber: number, changeNote?: string) {
  return client.post<IceEngineApi>(`/tag/iceengine/apis/${id}/versions/${versionNumber}/restore`, { changeNote })
}
