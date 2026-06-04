import client from './client'
import type { AxiosResponse } from 'axios'

export interface FeatureFlag {
  id: string
  name: string
  description: string
  enabled: boolean
  rolloutPercentage: number
  environments: string[]
  partnerIds: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface FlagEvaluation {
  name: string
  enabled: boolean
  reason: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listFlags = (params: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<FeatureFlag>>> =>
  client.get('/tag/flags', { params })

export const getFlagById = (id: string): Promise<AxiosResponse<FeatureFlag>> =>
  client.get(`/tag/flags/${id}`)

export const getFlagByName = (name: string): Promise<AxiosResponse<FeatureFlag>> =>
  client.get(`/tag/flags/by-name/${name}`)

export const evaluateFlag = (
  name: string,
  environment?: string,
  partnerId?: string
): Promise<AxiosResponse<FlagEvaluation>> =>
  client.get(`/tag/flags/evaluate/${name}`, { params: { environment, partnerId } })

export const createFlag = (data: {
  name: string
  description: string
  enabled: boolean
  rolloutPercentage: number
  environments: string[]
  partnerIds: string[]
}): Promise<AxiosResponse<FeatureFlag>> =>
  client.post('/tag/flags', data)

export const updateFlag = (
  id: string,
  data: Partial<FeatureFlag>
): Promise<AxiosResponse<FeatureFlag>> =>
  client.patch(`/tag/flags/${id}`, data)

export const deleteFlag = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/flags/${id}`)
