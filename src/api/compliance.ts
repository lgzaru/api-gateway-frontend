import client from './client'
import type { AxiosResponse } from 'axios'

export type MaskType = 'FULL' | 'PARTIAL' | 'HASH' | 'TOKENIZE'
export type PurgeStrategy = 'DELETE' | 'ANONYMIZE'

export interface MaskingRule {
  id: string
  name: string
  fieldPattern: string
  maskType: MaskType
  samplePattern: string | null
  enabled: boolean
  createdAt: string
}

export interface RetentionPolicy {
  id: string
  entityType: string
  retentionDays: number
  purgeStrategy: PurgeStrategy
  enabled: boolean
  lastRunAt: string | null
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export const listMaskingRules = (params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<MaskingRule>>> =>
  client.get('/tag/compliance/masking-rules', { params })

export const createMaskingRule = (data: {
  name: string
  fieldPattern: string
  maskType: MaskType
  samplePattern?: string
}): Promise<AxiosResponse<MaskingRule>> =>
  client.post('/tag/compliance/masking-rules', data)

export const updateMaskingRule = (id: string, data: {
  fieldPattern?: string
  maskType?: MaskType
  samplePattern?: string
  enabled?: boolean
}): Promise<AxiosResponse<MaskingRule>> =>
  client.put(`/tag/compliance/masking-rules/${id}`, data)

export const deleteMaskingRule = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/compliance/masking-rules/${id}`)

export const applyMask = (id: string, value: string): Promise<AxiosResponse<{ masked: string }>> =>
  client.post(`/tag/compliance/masking-rules/${id}/apply`, { value })

export const listRetentionPolicies = (params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<RetentionPolicy>>> =>
  client.get('/tag/compliance/retention-policies', { params })

export const createRetentionPolicy = (data: {
  entityType: string
  retentionDays: number
  purgeStrategy: PurgeStrategy
}): Promise<AxiosResponse<RetentionPolicy>> =>
  client.post('/tag/compliance/retention-policies', data)

export const updateRetentionPolicy = (id: string, data: {
  retentionDays?: number
  purgeStrategy?: PurgeStrategy
  enabled?: boolean
}): Promise<AxiosResponse<RetentionPolicy>> =>
  client.put(`/tag/compliance/retention-policies/${id}`, data)

export const deleteRetentionPolicy = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/compliance/retention-policies/${id}`)
