import client from './client'
import type { AxiosResponse } from 'axios'

export type BillingStatus = 'DRAFT' | 'FINALISED' | 'VOID'

export interface RateCard {
  id: string
  name: string
  proxyApiId: string | null
  partnerId: string | null
  pricePer1000Requests: number
  monthlyFlatFee: number | null
  currency: string
  effectiveFrom: string
  effectiveTo: string | null
  createdAt: string
}

export interface BillingRecord {
  id: string
  partnerId: string
  proxyApiId: string
  rateCardId: string
  periodStart: string
  periodEnd: string
  requestCount: number
  totalAmount: number
  currency: string
  status: BillingStatus
  finalizedAt: string | null
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listRateCards = (params: {
  proxyApiId?: string
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<RateCard>>> =>
  client.get('/tag/billing/rate-cards', { params })

export const createRateCard = (data: {
  name: string
  proxyApiId?: string
  partnerId?: string
  pricePer1000Requests: number
  monthlyFlatFee?: number
  currency: string
  effectiveFrom: string
  effectiveTo?: string
}): Promise<AxiosResponse<RateCard>> =>
  client.post('/tag/billing/rate-cards', data)

export const updateRateCard = (
  id: string,
  data: Partial<RateCard>
): Promise<AxiosResponse<RateCard>> =>
  client.put(`/tag/billing/rate-cards/${id}`, data)

export const deleteRateCard = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/billing/rate-cards/${id}`)

export const listBillingRecords = (params: {
  partnerId?: string
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<BillingRecord>>> =>
  client.get('/tag/billing/records', { params })

export const createBillingRecord = (data: {
  partnerId: string
  proxyApiId: string
  rateCardId: string
  periodStart: string
  periodEnd: string
}): Promise<AxiosResponse<BillingRecord>> =>
  client.post('/tag/billing/records', data)

export const finaliseRecord = (id: string): Promise<AxiosResponse<BillingRecord>> =>
  client.post(`/tag/billing/records/${id}/finalise`)

// ── Billing Summaries ─────────────────────────────────────────────────────────

export type BillingSummaryStatus = 'DRAFT' | 'FINALIZED' | 'VOID'

export interface BillingSummary {
  id: string
  partnerId: string
  periodYear: number
  periodMonth: number
  totalRequests: number
  totalAmount: number
  currency: string
  status: BillingSummaryStatus
  finalizedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BillingConfig {
  id: string
  partnerId: string
  billingEnabled: boolean
  invoiceEmail: string | null
  currency: string
  bundleItems: string[]
  createdAt: string
  updatedAt: string
}

export const listBillingSummaries = (
  partnerId: string,
  params?: { page?: number; size?: number }
): Promise<AxiosResponse<PageResponse<BillingSummary>>> =>
  client.get('/tag/billing/summaries', { params: { partnerId, ...params } })

export const generateBillingSummary = (data: {
  partnerId: string
  periodYear: number
  periodMonth: number
}): Promise<AxiosResponse<BillingSummary>> =>
  client.post('/tag/billing/summaries/generate', data)

export const finalizeBillingSummary = (id: string): Promise<AxiosResponse<BillingSummary>> =>
  client.post(`/tag/billing/summaries/${id}/finalize`)

export const getBillingConfig = (partnerId: string): Promise<AxiosResponse<BillingConfig>> =>
  client.get(`/tag/billing/config/${partnerId}`)

export const upsertBillingConfig = (
  partnerId: string,
  data: { billingEnabled?: boolean; invoiceEmail?: string; currency?: string; bundleItems?: string[] }
): Promise<AxiosResponse<BillingConfig>> =>
  client.put(`/tag/billing/config/${partnerId}`, data)
