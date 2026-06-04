import client from './client'
import type { AxiosResponse } from 'axios'

export interface CatalogueEntry {
  id: string
  proxyApiId: string
  version: string
  endpointCount: number
  deprecated: boolean
  published: boolean
  createdAt: string
  updatedAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listCatalogueEntries = (
  apiId: string,
  params: { page?: number; size?: number }
): Promise<AxiosResponse<PageResponse<CatalogueEntry>>> =>
  client.get(`/tag/catalogue/apis/${apiId}/entries`, { params })

export const getCatalogueEntry = (id: string): Promise<AxiosResponse<CatalogueEntry>> =>
  client.get(`/tag/catalogue/entries/${id}`)

export const publishEntry = (
  apiId: string,
  data: {
    version: string
    title: string
    description?: string
    openApiSpec?: string
    tags?: string[]
  }
): Promise<AxiosResponse<CatalogueEntry>> =>
  client.post(`/tag/catalogue/apis/${apiId}/entries`, data)

export const updateEntry = (
  id: string,
  data: Partial<CatalogueEntry>
): Promise<AxiosResponse<CatalogueEntry>> =>
  client.patch(`/tag/catalogue/entries/${id}`, data)

export const deleteEntry = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/catalogue/entries/${id}`)
