import client from './client'
import type { AxiosResponse } from 'axios'

export type PartnerType = 'MINISTRY' | 'DEPARTMENT' | 'AGENCY' | 'PARASTATAL'
export type PartnerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
export type OnboardingStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

export interface Partner {
  id: string
  name: string
  shortCode: string
  email: string
  phone: string | null
  type: PartnerType
  status: PartnerStatus
  contractRef: string | null
  onboardingStep: string | null
  createdAt: string
}

export interface PartnerBundle {
  id: string
  partnerId: string
  name: string
  description: string | null
  apiIds: string[]
  rateLimitOverride: number | null
  createdAt: string
}

export interface OnboardingStep {
  id: string
  partnerId: string
  step: string
  status: OnboardingStatus
  notes: string | null
  completedBy: string | null
  completedAt: string | null
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listPartners = (params: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<Partner>>> =>
  client.get('/tag/partners', { params })

export const getPartner = (id: string): Promise<AxiosResponse<Partner>> =>
  client.get(`/tag/partners/${id}`)

export const createPartner = (data: {
  name: string
  shortCode: string
  email: string
  phone?: string
  type: PartnerType
  contractRef?: string
}): Promise<AxiosResponse<Partner>> =>
  client.post('/tag/partners', data)

export const updatePartner = (
  id: string,
  data: Partial<Pick<Partner, 'name' | 'email' | 'phone' | 'type' | 'status' | 'contractRef'>>
): Promise<AxiosResponse<Partner>> =>
  client.patch(`/tag/partners/${id}`, data)

export const deletePartner = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/partners/${id}`)

export const listAllBundles = (params: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<PartnerBundle>>> =>
  client.get('/tag/partners/bundles', { params })

export const listBundles = (
  partnerId: string,
  params: { page?: number; size?: number }
): Promise<AxiosResponse<PageResponse<PartnerBundle>>> =>
  client.get(`/tag/partners/${partnerId}/bundles`, { params })

export const createBundle = (
  partnerId: string,
  data: { name: string; description?: string; apiIds: string[]; rateLimitOverride?: number }
): Promise<AxiosResponse<PartnerBundle>> =>
  client.post(`/tag/partners/${partnerId}/bundles`, data)

export const updateBundle = (
  bundleId: string,
  data: { name?: string; description?: string; apiIds?: string[]; rateLimitOverride?: number }
): Promise<AxiosResponse<PartnerBundle>> =>
  client.put(`/tag/partners/bundles/${bundleId}`, data)

export const deleteBundle = (bundleId: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/partners/bundles/${bundleId}`)

export const getOnboardingHistory = (
  partnerId: string
): Promise<AxiosResponse<OnboardingStep[]>> =>
  client.get(`/tag/partners/${partnerId}/onboarding`)

export const addOnboardingStep = (
  partnerId: string,
  data: { step: string; status: OnboardingStatus; notes?: string }
): Promise<AxiosResponse<OnboardingStep>> =>
  client.post(`/tag/partners/${partnerId}/onboarding`, data)

// ── Workflow ──────────────────────────────────────────────────────────────────

export const getWorkflowHistory = (partnerId: string): Promise<AxiosResponse<OnboardingStep[]>> =>
  client.get(`/tag/partners/${partnerId}/workflow/history`)

export const getPendingWorkflows = (params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<OnboardingStep>>> =>
  client.get('/tag/workflow/pending', { params })

export const submitWorkflowStep = (
  partnerId: string,
  data: { step: string; status: OnboardingStatus; notes?: string }
): Promise<AxiosResponse<OnboardingStep>> =>
  client.post(`/tag/partners/${partnerId}/workflow/submit`, data)

export const approveWorkflowStep = (
  partnerId: string,
  stepId: string,
  notes?: string
): Promise<AxiosResponse<OnboardingStep>> =>
  client.post(`/tag/partners/${partnerId}/workflow/${stepId}/approve`, notes ? { notes } : {})

export const rejectWorkflowStep = (
  partnerId: string,
  stepId: string,
  notes?: string
): Promise<AxiosResponse<OnboardingStep>> =>
  client.post(`/tag/partners/${partnerId}/workflow/${stepId}/reject`, notes ? { notes } : {})

export const skipLegal = (partnerId: string): Promise<AxiosResponse<OnboardingStep>> =>
  client.post(`/tag/partners/${partnerId}/workflow/skip-legal`)

// ── IP Requests ───────────────────────────────────────────────────────────────

export type IpRequestAction = 'ADD' | 'REMOVE'
export type IpRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED'

export interface IpRequest {
  id: string
  partnerId: string
  ipCidr: string
  action: IpRequestAction
  status: IpRequestStatus
  reason: string | null
  reviewerId: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  requestedBy: string | null
  createdAt: string
  updatedAt: string
}

export const listIpRequests = (
  partnerId: string,
  params?: { page?: number; size?: number }
): Promise<AxiosResponse<PageResponse<IpRequest>>> =>
  client.get(`/tag/partners/${partnerId}/ip-requests`, { params })

export const createIpRequest = (
  partnerId: string,
  data: { ipCidr: string; action: IpRequestAction; reason?: string }
): Promise<AxiosResponse<IpRequest>> =>
  client.post(`/tag/partners/${partnerId}/ip-requests`, data)

export const reviewIpRequest = (
  id: string,
  data: { status: 'APPROVED' | 'REJECTED'; reviewNotes?: string }
): Promise<AxiosResponse<IpRequest>> =>
  client.patch(`/tag/ip-requests/${id}/review`, data)

export const getPendingIpRequests = (
  params?: { page?: number; size?: number }
): Promise<AxiosResponse<PageResponse<IpRequest>>> =>
  client.get('/tag/ip-requests/pending', { params })

export const deleteIpRequest = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/ip-requests/${id}`)

export const getEffectiveWhitelist = (
  partnerId: string
): Promise<AxiosResponse<string[]>> =>
  client.get(`/tag/partners/${partnerId}/ip-whitelist`)
