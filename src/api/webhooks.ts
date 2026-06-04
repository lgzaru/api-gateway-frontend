import client from './client'
import type { AxiosResponse } from 'axios'

export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'FAILED'
export type DeliveryStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING'

export interface WebhookSubscription {
  id: string
  ownerId: string
  name: string
  targetUrl: string
  eventTypes: string[]
  status: SubscriptionStatus
  lastDeliveryAt: string | null
  lastDeliveryStatus: string | null
  createdAt: string
}

export interface WebhookDelivery {
  id: string
  subscriptionId: string
  eventType: string
  status: DeliveryStatus
  attemptCount: number
  deliveredAt: string | null
  responseCode: number | null
  errorMessage: string | null
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listSubscriptions = (params: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<WebhookSubscription>>> =>
  client.get('/tag/webhooks/subscriptions', { params })

export const createSubscription = (data: {
  name: string
  targetUrl: string
  eventTypes: string[]
}): Promise<AxiosResponse<WebhookSubscription>> =>
  client.post('/tag/webhooks/subscriptions', data)

export const updateSubscription = (
  id: string,
  data: { name?: string; targetUrl?: string; eventTypes?: string[]; status?: SubscriptionStatus }
): Promise<AxiosResponse<WebhookSubscription>> =>
  client.put(`/tag/webhooks/subscriptions/${id}`, data)

export const deleteSubscription = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/webhooks/subscriptions/${id}`)

export const listDeliveries = (
  subscriptionId: string,
  params: { page?: number; size?: number }
): Promise<AxiosResponse<PageResponse<WebhookDelivery>>> =>
  client.get(`/tag/webhooks/subscriptions/${subscriptionId}/deliveries`, { params })
