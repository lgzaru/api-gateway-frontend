import client from './client'
import type { AxiosResponse } from 'axios'

export type SlaScope = 'PLATFORM' | 'MODULE' | 'API' | 'PARTNER_BUNDLE'

export interface SlaConfig {
  id: string
  proxyApiId: string
  availabilityTarget: number
  latencyP95TargetMs: number
  latencyP99TargetMs: number
  scope: SlaScope
  measurementPeriod: string | null
  createdAt: string
}

export interface SlaRecord {
  id: string
  slaConfigId: string
  periodStart: string
  periodEnd: string
  availabilityPct: number
  latencyP95Ms: number | null
  latencyP99Ms: number | null
  breach: boolean
  computedAt: string
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export const getSlaConfig = (apiId: string): Promise<AxiosResponse<SlaConfig>> =>
  client.get(`/tag/monitoring/sla/apis/${apiId}`)

export const createOrUpdateSla = (data: {
  proxyApiId: string
  availabilityTarget: number
  latencyP95TargetMs?: number
  latencyP99TargetMs?: number
  scope?: SlaScope
  measurementPeriod?: string
}): Promise<AxiosResponse<SlaConfig>> =>
  client.post('/tag/monitoring/sla', data)

export const updateSla = (apiId: string, data: {
  availabilityTarget?: number
  latencyP95TargetMs?: number
  latencyP99TargetMs?: number
  scope?: SlaScope
  measurementPeriod?: string
}): Promise<AxiosResponse<SlaConfig>> =>
  client.patch(`/tag/monitoring/sla/apis/${apiId}`, data)

export const listSlaRecords = (apiId: string, params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<SlaRecord>>> =>
  client.get(`/tag/monitoring/sla/apis/${apiId}/records`, { params })
