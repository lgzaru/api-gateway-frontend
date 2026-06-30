import client from './client'
import type { AxiosResponse } from 'axios'

export type BillingSourceType = 'PROXY_API' | 'SMS_APPLICATION'
export type BillingStatus     = 'DRAFT' | 'FINALISED' | 'INVOICED' | 'VOID'
export type BillingType       = 'POST_PAYMENT' | 'PREPAYMENT'
export type InvoiceStatus     = 'DRAFT' | 'SENT' | 'PAID' | 'VOID'
export type PrepaymentStatus  = 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED'

export interface RateCard {
  id: string
  name: string
  sourceType: BillingSourceType
  proxyApiId: string | null
  applicationId: string | null
  partnerId: string | null
  bundleId: string | null
  pricePer1000Requests: number
  monthlyFlatFee: number | null
  currency: string
  effectiveFrom: string
  effectiveTo: string | null
  createdAt: string
}

export interface BillingRecord {
  id: string
  partnerId: string | null
  bundleId: string | null
  sourceType: BillingSourceType
  proxyApiId: string | null
  applicationId: string | null
  rateCardId: string
  periodStart: string
  periodEnd: string
  requestCount: number
  totalAmount: number
  currency: string
  status: BillingStatus
  billingType: BillingType
  zwgRate: number | null
  usdSplitPct: number
  zwgSplitPct: number
  usdDue: number | null
  zwgDue: number | null
  prepaymentId: string | null
  finalizedAt: string | null
  createdAt: string
}

export interface BillingInvoice {
  id: string
  invoiceNumber: string
  partnerId: string
  applicationId: string | null
  periodStart: string
  periodEnd: string
  subtotalZwg: number
  subtotalUsd: number
  zwgRate: number | null
  usdSplitPct: number
  zwgSplitPct: number
  usdDue: number | null
  zwgDue: number | null
  vatPct: number
  vatZwg: number | null
  vatUsd: number | null
  billToName: string | null
  billToEmail: string | null
  billToPhone: string | null
  dueDate: string | null
  billFromName: string | null
  billFromEmail: string | null
  billFromPhone: string | null
  billFromWebsite: string | null
  invoiceEmail: string | null
  notes: string | null
  status: InvoiceStatus
  sentAt: string | null
  billingRecordIds: string[]
  createdAt: string
}

export interface SmsPrepayment {
  id: string
  partnerId: string
  applicationId: string
  allocatedSms: number
  usedSms: number
  remainingSms: number
  prepaidZwg: number | null
  prepaidUsd: number | null
  zwgRate: number | null
  usdSplitPct: number
  zwgSplitPct: number
  validFrom: string
  validTo: string | null
  status: PrepaymentStatus
  notes: string | null
  invoiceId: string | null
  createdAt: string
}

export interface SmsBillingConfig {
  id: string
  applicationId: string
  billingEnabled: boolean
  rateCardId: string | null
  invoiceEmail: string | null
  currency: string
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

// ── Rate Cards ────────────────────────────────────────────────────────────────

export const listRateCards = (params: {
  proxyApiId?: string
  bundleId?: string
  sourceType?: BillingSourceType
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<RateCard>>> =>
  client.get('/tag/billing/rate-cards', { params })

export const createRateCard = (data: {
  name: string
  sourceType?: BillingSourceType
  proxyApiId?: string
  applicationId?: string
  partnerId?: string
  bundleId?: string
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

// ── Billing Records ───────────────────────────────────────────────────────────

export const listBillingRecords = (params: {
  partnerId?: string
  bundleId?: string
  applicationId?: string
  sourceType?: BillingSourceType
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<BillingRecord>>> =>
  client.get('/tag/billing/records', { params })

export const createBillingRecord = (data: {
  partnerId?: string
  bundleId?: string
  sourceType?: BillingSourceType
  proxyApiId?: string
  applicationId?: string
  usageCount?: number
  rateCardId?: string
  periodStart: string
  periodEnd: string
  billingType?: BillingType
  zwgRate?: number
  usdSplitPct?: number
  zwgSplitPct?: number
  prepaymentId?: string
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

// ── SMS Billing Config ────────────────────────────────────────────────────────

export const listSmsBillingConfigs = (params?: {
  enabledOnly?: boolean
}): Promise<AxiosResponse<SmsBillingConfig[]>> =>
  client.get('/tag/billing/sms-config', { params })

export const getSmsBillingConfig = (applicationId: string): Promise<AxiosResponse<SmsBillingConfig>> =>
  client.get(`/tag/billing/sms-config/${applicationId}`)

export const upsertSmsBillingConfig = (
  applicationId: string,
  data: { billingEnabled?: boolean; rateCardId?: string | null; invoiceEmail?: string; currency?: string }
): Promise<AxiosResponse<SmsBillingConfig>> =>
  client.put(`/tag/billing/sms-config/${applicationId}`, data)

export const deleteSmsBillingConfig = (applicationId: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/billing/sms-config/${applicationId}`)

// ── Invoices ──────────────────────────────────────────────────────────────────

export const listInvoices = (params?: {
  partnerId?: string
  applicationId?: string
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<BillingInvoice>>> =>
  client.get('/tag/billing/invoices', { params })

export const createInvoice = (data: {
  partnerId: string
  applicationId?: string
  periodStart: string
  periodEnd: string
  billingRecordIds: string[]
  zwgRate?: number
  usdSplitPct?: number
  zwgSplitPct?: number
  vatPct?: number
  billToName?: string
  billToEmail?: string
  billToPhone?: string
  dueDate?: string
  billFromName?: string
  billFromEmail?: string
  billFromPhone?: string
  billFromWebsite?: string
  invoiceEmail?: string
  notes?: string
}): Promise<AxiosResponse<BillingInvoice>> =>
  client.post('/tag/billing/invoices', data)

export const updateInvoiceParties = (id: string, data: {
  billToName?: string
  billToEmail?: string
  billToPhone?: string
  billFromName?: string
  billFromEmail?: string
  billFromPhone?: string
  billFromWebsite?: string
}): Promise<AxiosResponse<BillingInvoice>> =>
  client.patch(`/tag/billing/invoices/${id}/parties`, data)

export const sendInvoice  = (id: string): Promise<AxiosResponse<BillingInvoice>> =>
  client.post(`/tag/billing/invoices/${id}/send`)

export const markInvoicePaid = (id: string): Promise<AxiosResponse<BillingInvoice>> =>
  client.post(`/tag/billing/invoices/${id}/paid`)

export const voidInvoice  = (id: string): Promise<AxiosResponse<BillingInvoice>> =>
  client.post(`/tag/billing/invoices/${id}/void`)

// ── Prepayments ───────────────────────────────────────────────────────────────

export const listPrepayments = (params?: {
  partnerId?: string
  applicationId?: string
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<SmsPrepayment>>> =>
  client.get('/tag/billing/prepayments', { params })

export const createPrepayment = (data: {
  partnerId: string
  applicationId: string
  allocatedSms: number
  pricePerSmsZwg: number
  zwgRate?: number
  usdSplitPct?: number
  zwgSplitPct?: number
  validFrom: string
  validTo?: string
  notes?: string
}): Promise<AxiosResponse<SmsPrepayment>> =>
  client.post('/tag/billing/prepayments', data)
