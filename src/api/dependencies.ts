import client from './client'
import type { AxiosResponse } from 'axios'

export type DependencyType = 'REQUIRED' | 'OPTIONAL' | 'FALLBACK'

export interface Dependency {
  id: string
  sourceApiId: string
  targetApiId: string
  dependencyType: DependencyType
  criticalPath: boolean
  healthCheckUrl: string | null
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ImpactAnalysis {
  apiId: string
  directDependants: number
  criticalPathDependants: number
  affectedApiIds: string[]
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export const listDependencies = (params?: { sourceApiId?: string; page?: number; size?: number }): Promise<AxiosResponse<PageResponse<Dependency>>> =>
  client.get('/tag/dependencies', { params })

export const getDependency = (id: string): Promise<AxiosResponse<Dependency>> =>
  client.get(`/tag/dependencies/${id}`)

export const createDependency = (data: {
  sourceApiId: string
  targetApiId: string
  dependencyType?: DependencyType
  criticalPath?: boolean
  healthCheckUrl?: string
  notes?: string
}): Promise<AxiosResponse<Dependency>> =>
  client.post('/tag/dependencies', data)

export const updateDependency = (id: string, data: {
  dependencyType?: DependencyType
  criticalPath?: boolean
  healthCheckUrl?: string
  notes?: string
}): Promise<AxiosResponse<Dependency>> =>
  client.patch(`/tag/dependencies/${id}`, data)

export const deleteDependency = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/dependencies/${id}`)

export const getImpactAnalysis = (apiId: string): Promise<AxiosResponse<ImpactAnalysis>> =>
  client.get(`/tag/dependencies/impact/${apiId}`)
