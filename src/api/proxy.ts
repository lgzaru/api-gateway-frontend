import client from './client'
import type { AxiosResponse } from 'axios'

export type ProxyStatus = 'ACTIVE' | 'INACTIVE'
export type ProxyEnvironment = 'prod' | 'dev' | 'sandbox'
export type HealthStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN'
export type TransformType = 'HEADER_INJECT' | 'HEADER_STRIP' | 'BODY_MASK' | 'BODY_FILTER' | 'STATUS_REMAP'
export type ReplayStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
export type UpstreamAuthType = 'NONE' | 'API_KEY' | 'BEARER_TOKEN' | 'OAUTH2_PASSWORD' | 'BASIC_AUTH'
export type ParameterSource = 'CALLER' | 'STATIC' | 'AUTO_UUID' | 'AUTO_TIMESTAMP'
export type ParameterType   = 'BODY' | 'QUERY'

export interface ProxyApiTag {
  id: string
  name: string
  description: string | null
  color: string
  createdAt: string
}

export interface ProxyApi {
  id: string
  name: string
  description: string | null
  internalBaseUrl: string
  publicPath: string
  authRequired: boolean
  status: ProxyStatus
  environment: ProxyEnvironment
  healthCheckUrl: string | null
  healthCheckIntervalSecs: number
  healthStatus: HealthStatus
  lastCheckedAt: string | null
  registeredBy: string | null
  createdAt: string
  updatedAt: string
  httpMethod: string | null
  requestBodyTemplate: string | null
  exposedDomain: string | null
  exposedPath: string | null
  builtIn: boolean
  upstreamAuthType: UpstreamAuthType
  upstreamAuthHeader: string | null
  upstreamAuthUrl: string | null
  upstreamAuthUsername: string | null
  upstreamClientId: string | null
  tags: string[]
}

export interface HealthHistoryEntry {
  id: string
  status: 'UP' | 'DOWN' | 'DEGRADED'
  responseTimeMs: number | null
  httpStatusCode: number | null
  errorMessage: string | null
  checkedAt: string
}

export interface HealthCheckResponse {
  proxyApiId: string
  apiName: string
  overallStatus: HealthStatus
  lastCheckedAt: string | null
  recentHistory: HealthHistoryEntry[]
}

export interface HealthSummaryResponse {
  totalApis: number
  upCount: number
  degradedCount: number
  downCount: number
  unknownCount: number
  degradedOrDown: ProxyApi[]
}

export interface RequestLog {
  id: string
  proxyApiId: string
  apiName: string
  method: string
  path: string
  clientIp: string
  statusCode: number | null
  responseTimeMs: number | null
  environment: string
  createdAt: string
  hasRequestBody: boolean
  hasResponseBody: boolean
}

export interface RequestLogBody {
  requestBody: string | null
  responseBody: string | null
}

export interface Transform {
  id: string
  proxyApiId: string
  name: string
  transformType: TransformType
  config: string
  enabled: boolean
  orderIndex: number
  createdAt: string
}

export interface SandboxMock {
  id: string
  proxyApiId: string
  path: string
  method: string
  responseStatus: number
  responseBody: string | null
  latencyMs: number
  priority: number
  enabled: boolean
  createdAt: string
}

export interface ReplayRecord {
  id: string
  proxyApiId: string
  originalLogId: string | null
  status: ReplayStatus
  responseStatus: number | null
  responseTimeMs: number | null
  responseBody: string | null
  createdAt: string
}

export interface ProxyParameter {
  id: string
  paramName: string
  paramSource: ParameterSource
  paramType: ParameterType
  staticValue: string | null
  required: boolean
  description: string | null
  orderIndex: number
  createdAt: string
}

export interface TestApiResponse {
  success: boolean
  statusCode: number
  responseTimeMs: number
  requestBodySent: string | null
  responseBody: string | null
  errorMessage: string | null
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

// ── Proxy API CRUD ─────────────────────────────────────────────────────────────

export const listApis = (params: { page?: number; size?: number; environment?: string }): Promise<AxiosResponse<PageResponse<ProxyApi>>> =>
  client.get('/tag/proxy/apis', { params })

export const getApi = (id: string): Promise<AxiosResponse<ProxyApi>> =>
  client.get(`/tag/proxy/apis/${id}`)

export interface UpstreamAuthFields {
  httpMethod?: string
  requestBodyTemplate?: string
  exposedDomain?: string
  exposedPath?: string
  upstreamAuthType?: UpstreamAuthType
  upstreamAuthHeader?: string
  upstreamAuthValue?: string
  upstreamAuthUrl?: string
  upstreamAuthUsername?: string
  upstreamAuthPassword?: string
  upstreamClientId?: string
  upstreamClientSecret?: string
}

export const registerApi = (data: {
  name: string
  description?: string
  internalBaseUrl: string
  publicPath: string
  authRequired: boolean
  environment: ProxyEnvironment
  healthCheckUrl?: string
  healthCheckIntervalSecs?: number
  tags?: string[]
} & UpstreamAuthFields): Promise<AxiosResponse<ProxyApi>> =>
  client.post('/tag/proxy/apis', data)

export const updateApi = (id: string, data: {
  name?: string
  description?: string
  internalBaseUrl?: string
  authRequired?: boolean
  environment?: ProxyEnvironment
  healthCheckUrl?: string | null
  healthCheckIntervalSecs?: number
  exposedDomain?: string
  exposedPath?: string
  tags?: string[]
} & UpstreamAuthFields): Promise<AxiosResponse<ProxyApi>> =>
  client.put(`/tag/proxy/apis/${id}`, data)

export const deleteApi = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/proxy/apis/${id}`)

export const changeApiStatus = (id: string, status: ProxyStatus): Promise<AxiosResponse<ProxyApi>> =>
  client.patch(`/tag/proxy/apis/${id}/status`, { status })

// ── Health ────────────────────────────────────────────────────────────────────

export const getApiHealth = (id: string): Promise<AxiosResponse<HealthCheckResponse>> =>
  client.get(`/tag/proxy/apis/${id}/health`)

export const triggerHealthCheck = (id: string): Promise<AxiosResponse<HealthHistoryEntry>> =>
  client.post(`/tag/proxy/apis/${id}/health/check`)

export const setHealthStatus = (id: string, status: HealthStatus): Promise<AxiosResponse<void>> =>
  client.patch(`/tag/proxy/apis/${id}/health/status`, { status })

export const getHealthSummary = (): Promise<AxiosResponse<HealthSummaryResponse>> =>
  client.get('/tag/proxy/health/summary')

// ── Request Logs ──────────────────────────────────────────────────────────────

export const getRequestLogs = (id: string, params: { page?: number; size?: number; search?: string }): Promise<AxiosResponse<PageResponse<RequestLog>>> =>
  client.get(`/tag/proxy/apis/${id}/logs`, { params })

export const getLogBody = (apiId: string, logId: string): Promise<AxiosResponse<RequestLogBody>> =>
  client.get(`/tag/proxy/apis/${apiId}/logs/${logId}/body`)

// ── Transforms ────────────────────────────────────────────────────────────────

export const listTransforms = (proxyApiId: string, params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<Transform>>> =>
  client.get(`/tag/proxy/${proxyApiId}/transforms`, { params })

export const createTransform = (proxyApiId: string, data: {
  name: string
  transformType: TransformType
  config: string
  orderIndex: number
}): Promise<AxiosResponse<Transform>> =>
  client.post(`/tag/proxy/${proxyApiId}/transforms`, data)

export const updateTransform = (proxyApiId: string, id: string, data: {
  config?: string
  enabled?: boolean
  orderIndex?: number
}): Promise<AxiosResponse<Transform>> =>
  client.put(`/tag/proxy/${proxyApiId}/transforms/${id}`, data)

export const deleteTransform = (proxyApiId: string, id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/proxy/${proxyApiId}/transforms/${id}`)

// ── Sandbox Mocks ─────────────────────────────────────────────────────────────

export const listMocks = (proxyApiId: string, params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<SandboxMock>>> =>
  client.get(`/tag/proxy/${proxyApiId}/mocks`, { params })

export const createMock = (proxyApiId: string, data: {
  path: string
  method: string
  responseStatus: number
  responseBody?: string
  responseHeaders?: string
  latencyMs?: number
  priority?: number
}): Promise<AxiosResponse<SandboxMock>> =>
  client.post(`/tag/proxy/${proxyApiId}/mocks`, data)

export const updateMock = (proxyApiId: string, id: string, data: {
  responseBody?: string
  responseHeaders?: string
  responseStatus?: number
  latencyMs?: number
  priority?: number
  enabled?: boolean
}): Promise<AxiosResponse<SandboxMock>> =>
  client.put(`/tag/proxy/${proxyApiId}/mocks/${id}`, data)

export const deleteMock = (proxyApiId: string, id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/proxy/${proxyApiId}/mocks/${id}`)

// ── Replays ───────────────────────────────────────────────────────────────────

export const listReplays = (proxyApiId: string, params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<ReplayRecord>>> =>
  client.get(`/tag/proxy/${proxyApiId}/replays`, { params })

export const triggerReplay = (proxyApiId: string, data: { originalLogId: string }): Promise<AxiosResponse<ReplayRecord>> =>
  client.post(`/tag/proxy/${proxyApiId}/replays`, data)

// ── Parameters ────────────────────────────────────────────────────────────────

export const listParameters = (apiId: string): Promise<AxiosResponse<ProxyParameter[]>> =>
  client.get(`/tag/proxy/apis/${apiId}/parameters`)

export const createParameter = (apiId: string, data: {
  paramName: string
  paramSource: ParameterSource
  paramType?: ParameterType
  staticValue?: string
  required: boolean
  description?: string
  orderIndex?: number
}): Promise<AxiosResponse<ProxyParameter>> =>
  client.post(`/tag/proxy/apis/${apiId}/parameters`, data)

export const updateParameter = (apiId: string, paramId: string, data: {
  paramSource?: ParameterSource
  staticValue?: string
  required?: boolean
  description?: string
  orderIndex?: number
}): Promise<AxiosResponse<ProxyParameter>> =>
  client.put(`/tag/proxy/apis/${apiId}/parameters/${paramId}`, data)

export const deleteParameter = (apiId: string, paramId: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/proxy/apis/${apiId}/parameters/${paramId}`)

// ── Test ──────────────────────────────────────────────────────────────────────

export const testApi = (apiId: string, callerParams: Record<string, unknown>): Promise<AxiosResponse<TestApiResponse>> =>
  client.post(`/tag/proxy/apis/${apiId}/test`, { callerParams })

// ── Tags ──────────────────────────────────────────────────────────────────────

export const listTags = (): Promise<AxiosResponse<ProxyApiTag[]>> =>
  client.get('/tag/proxy/tags')

export const createTag = (data: { name: string; description?: string; color?: string }): Promise<AxiosResponse<ProxyApiTag>> =>
  client.post('/tag/proxy/tags', data)

export const updateTag = (id: string, data: { name?: string; description?: string; color?: string }): Promise<AxiosResponse<ProxyApiTag>> =>
  client.patch(`/tag/proxy/tags/${id}`, data)

export const deleteTag = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/proxy/tags/${id}`)
