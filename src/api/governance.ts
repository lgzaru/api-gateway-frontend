import client from './client'
import type { AxiosResponse } from 'axios'

// ── Rate Limit ────────────────────────────────────────────────────────────────

export type RateLimitScope = 'GLOBAL' | 'PER_IP' | 'PER_TOKEN'
export type ThrottleStrategy = 'REJECT' | 'QUEUE'
export type RateEnforcer = 'TAG' | 'KONG'

export interface RateLimitConfig {
  id: string
  proxyApiId: string
  apiName: string
  requestLimit: number
  windowSeconds: number
  scope: RateLimitScope
  throttleStrategy: ThrottleStrategy
  burstAllowance: number
  enabled: boolean
  enforcer: RateEnforcer
}

// ── Blacklist ─────────────────────────────────────────────────────────────────

export interface BlacklistEntry {
  id: string
  proxyApiId: string | null
  apiName: string
  ipAddress: string
  reason: string | null
  expiresAt: string | null
  createdBy: string | null
  createdAt: string
  active: boolean
}

// ── CORS ──────────────────────────────────────────────────────────────────────

export interface CorsConfig {
  id: string
  proxyApiId: string
  apiName: string
  allowedOrigins: string[]
  allowedMethods: string[]
  allowedHeaders: string[]
  exposedHeaders: string[]
  allowCredentials: boolean
  maxAgeSeconds: number
  enabled: boolean
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export interface ApiMetrics {
  proxyApiId: string
  apiName: string
  environment: string | null
  requestsLast24h: number
  requestsLastHour: number
  avgResponseTimeMs: number | null
  errorCount: number
  rateLimitTriggers: number
}

// ── Access Tokens ─────────────────────────────────────────────────────────────

export type AccessTokenStatus = 'ACTIVE' | 'REVOKED'

export interface AccessToken {
  id: string
  proxyApiId: string
  apiName: string
  name: string
  tokenPrefix: string
  description: string | null
  status: AccessTokenStatus
  expiresAt: string | null
  lastUsedAt: string | null
  createdBy: string | null
  createdAt: string
}

export interface AccessTokenCreated {
  id: string
  token: string
  tokenPrefix: string
  expiresAt: string | null
}

// ── Scraping Prevention ───────────────────────────────────────────────────────

export interface UaBlocklistEntry {
  id: string
  pattern: string
  reason: string | null
  enabled: boolean
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

// ── API functions ─────────────────────────────────────────────────────────────

export const getRateLimit = (apiId: string): Promise<AxiosResponse<RateLimitConfig>> =>
  client.get(`/tag/governance/apis/${apiId}/rate-limit`)

export const updateRateLimit = (
  apiId: string,
  data: { requestLimit?: number; windowSeconds?: number; scope?: RateLimitScope; throttleStrategy?: ThrottleStrategy; burstAllowance?: number; enabled?: boolean; enforcer?: RateEnforcer }
): Promise<AxiosResponse<void>> =>
  client.put(`/tag/governance/apis/${apiId}/rate-limit`, data)

export const getBlacklist = (apiId: string): Promise<AxiosResponse<BlacklistEntry[]>> =>
  client.get(`/tag/governance/apis/${apiId}/blacklist`)

export const addBlacklist = (
  apiId: string,
  data: { ipAddress: string; reason?: string }
): Promise<AxiosResponse<BlacklistEntry>> =>
  client.post(`/tag/governance/apis/${apiId}/blacklist`, data)

export const removeBlacklist = (apiId: string, entryId: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/governance/apis/${apiId}/blacklist/${entryId}`)

export const getCors = (apiId: string): Promise<AxiosResponse<CorsConfig>> =>
  client.get(`/tag/governance/apis/${apiId}/cors`)

export const updateCors = (
  apiId: string,
  data: Partial<Pick<CorsConfig, 'allowedOrigins' | 'allowedMethods' | 'allowedHeaders' | 'exposedHeaders' | 'allowCredentials' | 'maxAgeSeconds'>>
): Promise<AxiosResponse<CorsConfig>> =>
  client.put(`/tag/governance/apis/${apiId}/cors`, data)

export const getApiMetrics = (apiId: string): Promise<AxiosResponse<ApiMetrics>> =>
  client.get(`/tag/governance/apis/${apiId}/metrics`)

export const getDashboardMetrics = (params?: { environment?: string }): Promise<AxiosResponse<ApiMetrics[]>> =>
  client.get('/tag/governance/monitoring/dashboard', { params })

// Access Tokens
export const listAccessTokens = (
  apiId: string,
  params?: { page?: number; size?: number }
): Promise<AxiosResponse<PageResponse<AccessToken>>> =>
  client.get(`/tag/governance/apis/${apiId}/tokens`, { params })

export const createAccessToken = (
  apiId: string,
  data: { name: string; description?: string; expiresAt?: string }
): Promise<AxiosResponse<AccessTokenCreated>> =>
  client.post(`/tag/governance/apis/${apiId}/tokens`, data)

export const revokeAccessToken = (apiId: string, tokenId: string): Promise<AxiosResponse<void>> =>
  client.post(`/tag/governance/apis/${apiId}/tokens/${tokenId}/revoke`)

export const rotateAccessToken = (
  apiId: string,
  tokenId: string
): Promise<AxiosResponse<AccessTokenCreated>> =>
  client.post(`/tag/governance/apis/${apiId}/tokens/${tokenId}/rotate`)

// Scraping Prevention
export const listScrapingBlocklist = (): Promise<AxiosResponse<UaBlocklistEntry[]>> =>
  client.get('/tag/governance/scraping/blocklist')

export const addToScrapingBlocklist = (
  data: { pattern: string; reason?: string }
): Promise<AxiosResponse<UaBlocklistEntry>> =>
  client.post('/tag/governance/scraping/blocklist', data)

export const toggleScrapingBlocklistEntry = (id: string): Promise<AxiosResponse<UaBlocklistEntry>> =>
  client.patch(`/tag/governance/scraping/blocklist/${id}/toggle`)

export const removeFromScrapingBlocklist = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/governance/scraping/blocklist/${id}`)
