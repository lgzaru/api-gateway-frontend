import client from './client'
import type { AxiosResponse } from 'axios'

export type ConditionType = 'ERROR_RATE' | 'LATENCY_P95' | 'LATENCY_P99' | 'REQUEST_COUNT' | 'AVAILABILITY'
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type AlertInstanceStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'

export interface AlertRule {
  id: string
  proxyApiId: string
  name: string
  conditionType: ConditionType
  threshold: number
  windowMinutes: number
  severity: AlertSeverity
  notificationChannels: string[]
  enabled: boolean
  createdAt: string
}

export interface AlertInstance {
  id: string
  ruleId: string
  status: AlertInstanceStatus
  triggeredAt: string
  resolvedAt: string | null
  acknowledgedAt: string | null
  details: string | null
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listAlertRules = (params: {
  proxyApiId: string
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<AlertRule>>> =>
  client.get('/tag/monitoring/alerts/rules', { params })

export const createAlertRule = (data: {
  proxyApiId: string
  name: string
  conditionType: ConditionType
  threshold: number
  windowMinutes: number
  severity: AlertSeverity
  notificationChannels: string[]
  enabled: boolean
}): Promise<AxiosResponse<AlertRule>> =>
  client.post('/tag/monitoring/alerts/rules', data)

export const updateAlertRule = (
  id: string,
  data: Partial<AlertRule>
): Promise<AxiosResponse<AlertRule>> =>
  client.patch(`/tag/monitoring/alerts/rules/${id}`, data)

export const deleteAlertRule = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/monitoring/alerts/rules/${id}`)

export const listAlertInstances = (
  ruleId: string,
  params: { page?: number; size?: number }
): Promise<AxiosResponse<PageResponse<AlertInstance>>> =>
  client.get(`/tag/monitoring/alerts/rules/${ruleId}/instances`, { params })

export const listOpenAlerts = (params: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<AlertInstance>>> =>
  client.get('/tag/monitoring/alerts/open', { params })

export const acknowledgeAlert = (
  id: string,
  notes?: string
): Promise<AxiosResponse<AlertInstance>> =>
  client.post(`/tag/monitoring/alerts/instances/${id}/acknowledge`, notes ? { notes } : undefined)

export const resolveAlert = (id: string): Promise<AxiosResponse<AlertInstance>> =>
  client.post(`/tag/monitoring/alerts/instances/${id}/resolve`)
