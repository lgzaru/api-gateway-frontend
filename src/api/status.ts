import client from './client'
import type { AxiosResponse } from 'axios'

export interface PlatformStatus {
  status: 'operational' | 'degraded' | 'partial_outage' | 'major_outage'
  message: string
  updatedAt: string
}

export interface ActiveIncident {
  id: string
  title: string
  severity: string
  status: string
  startedAt: string
}

export const getPlatformStatus = (): Promise<AxiosResponse<PlatformStatus>> =>
  client.get('/status')

export const getActiveIncidents = (): Promise<AxiosResponse<ActiveIncident[]>> =>
  client.get('/status/incidents')
