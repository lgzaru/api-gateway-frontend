import client from './client'
import type { AxiosResponse } from 'axios'

export type NotificationType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  type: NotificationType
  read: boolean
  readAt: string | null
  entityType: string | null
  entityId: string | null
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listNotifications = (params: {
  unreadOnly?: boolean
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<Notification>>> =>
  client.get('/tag/notifications', { params })

export const getUnreadCount = (): Promise<AxiosResponse<{ userId: string; count: number }>> =>
  client.get('/tag/notifications/unread-count')

export const markAsRead = (id: string): Promise<AxiosResponse<Notification>> =>
  client.put(`/tag/notifications/${id}/read`)

export const markAllAsRead = (): Promise<AxiosResponse<void>> =>
  client.put('/tag/notifications/read-all')
