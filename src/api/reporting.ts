import client from './client'
import type { AxiosResponse } from 'axios'

export type ExportStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
export type BackupStatus = 'ACTIVE' | 'PENDING_RESTORE' | 'RESTORED' | 'FAILED'

export interface ReportSchedule {
  id: string
  name: string
  reportType: string
  cronExpression: string
  format: string
  recipients: string[]
  enabled: boolean
  createdBy: string
  createdAt: string
}

export interface ReportExport {
  id: string
  reportType: string
  format: string
  status: ExportStatus
  fileUrl: string | null
  errorMessage: string | null
  requestedBy: string
  requestedAt: string
  completedAt: string | null
}

export interface ConfigBackup {
  id: string
  description: string | null
  status: BackupStatus
  createdBy: string
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listSchedules = (params: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<ReportSchedule>>> =>
  client.get('/tag/reports/schedules', { params })

export const createSchedule = (data: {
  name: string
  reportType: string
  cronExpression: string
  format: string
  recipients: string[]
  enabled: boolean
}): Promise<AxiosResponse<ReportSchedule>> =>
  client.post('/tag/reports/schedules', data)

export const updateSchedule = (
  id: string,
  data: Partial<ReportSchedule>
): Promise<AxiosResponse<ReportSchedule>> =>
  client.put(`/tag/reports/schedules/${id}`, data)

export const deleteSchedule = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/reports/schedules/${id}`)

export const listExports = (params: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<ReportExport>>> =>
  client.get('/tag/reports/exports', { params })

export const generateReport = (data: {
  reportType: string
  format: string
  parameters?: Record<string, unknown>
}): Promise<AxiosResponse<ReportExport>> =>
  client.post('/tag/reports/exports', data)

export const downloadExport = (id: string): string =>
  `/api/v1/pus/reports/exports/${id}/download`

export const listBackups = (params: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<ConfigBackup>>> =>
  client.get('/tag/reports/backups', { params })

export const createBackup = (data: {
  description?: string
}): Promise<AxiosResponse<ConfigBackup>> =>
  client.post('/tag/reports/backups', data)

export const restoreBackup = (id: string): Promise<AxiosResponse<ConfigBackup>> =>
  client.post(`/tag/reports/backups/${id}/restore`)

export const downloadBackup = (id: string): string =>
  `/api/v1/pus/reports/backups/${id}/download`
