import client from './client'
import type { AxiosResponse } from 'axios'

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'

export interface PlatformUser {
  id: string
  username: string
  email: string
  fullName: string | null
  status: UserStatus
  roles: string[]          // role codes, e.g. ["ADMIN", "VIEWER"]
  twoFactorEnabled: boolean
  lastLogin: string | null
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export const listUsers = (params?: {
  page?: number
  size?: number
}): Promise<AxiosResponse<PageResponse<PlatformUser>>> =>
  client.get('/users', { params })

export const getUser = (id: string): Promise<AxiosResponse<PlatformUser>> =>
  client.get(`/users/${id}`)

export const createUser = (data: {
  username: string
  email: string
  fullName?: string
  password: string
  roleIds?: string[]
}): Promise<AxiosResponse<PlatformUser>> =>
  client.post('/users', data)

export const updateUser = (
  id: string,
  data: { email?: string; fullName?: string; status?: UserStatus }
): Promise<AxiosResponse<PlatformUser>> =>
  client.put(`/users/${id}`, data)

export const assignRoles = (
  id: string,
  roleIds: string[]
): Promise<AxiosResponse<PlatformUser>> =>
  client.post(`/users/${id}/roles`, { roleIds })

export const deleteUser = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/users/${id}`)
