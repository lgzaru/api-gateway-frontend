import client from './client'
import type { AxiosResponse } from 'axios'

export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED'
export type IncidentOrigin = 'MANUAL' | 'ALERT' | 'EXTERNAL'

export interface Incident {
  id: string
  title: string
  description: string
  severity: IncidentSeverity
  status: IncidentStatus
  origin: IncidentOrigin
  affectedApiIds: string[]
  startedAt: string
  resolvedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface IncidentUpdate {
  id: string
  incidentId: string
  message: string
  status: IncidentStatus
  authorId: string
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listIncidents = (params: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<Incident>>> =>
  client.get('/tag/incidents', { params })

export const getIncident = (id: string): Promise<AxiosResponse<Incident>> =>
  client.get(`/tag/incidents/${id}`)

export const createIncident = (data: {
  title: string
  description: string
  severity: IncidentSeverity
  status: IncidentStatus
  affectedApiIds: string[]
}): Promise<AxiosResponse<Incident>> =>
  client.post('/tag/incidents', data)

export const updateIncident = (
  id: string,
  data: Partial<Pick<Incident, 'title' | 'description' | 'severity' | 'status' | 'affectedApiIds'>>
): Promise<AxiosResponse<Incident>> =>
  client.patch(`/tag/incidents/${id}`, data)

export const deleteIncident = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/incidents/${id}`)

export const listIncidentUpdates = (id: string): Promise<AxiosResponse<IncidentUpdate[]>> =>
  client.get(`/tag/incidents/${id}/updates`)

export const addIncidentUpdate = (
  id: string,
  data: { message: string; status: IncidentStatus }
): Promise<AxiosResponse<IncidentUpdate>> =>
  client.post(`/tag/incidents/${id}/updates`, data)
