import client from './client'
import type { AxiosResponse } from 'axios'

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface Approval {
  id: string
  actionType: string
  entityType: string
  entityId: string
  status: ApprovalStatus
  requestedBy: string
  requestedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  reviewerNote: string | null
  expiresAt: string | null
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export const listPending = (params?: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<Approval>>> =>
  client.get('/approvals', { params })

export const getApproval = (id: string): Promise<AxiosResponse<Approval>> =>
  client.get(`/approvals/${id}`)

export const approveApproval = (id: string, note?: string): Promise<AxiosResponse<Approval>> =>
  client.post(`/approvals/${id}/approve`, null, { params: note ? { note } : undefined })

export const rejectApproval = (id: string, note?: string): Promise<AxiosResponse<Approval>> =>
  client.post(`/approvals/${id}/reject`, null, { params: note ? { note } : undefined })

export const cancelApproval = (id: string): Promise<AxiosResponse<Approval>> =>
  client.post(`/approvals/${id}/cancel`)
