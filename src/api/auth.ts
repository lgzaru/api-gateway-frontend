import axios from 'axios'
import type { AxiosResponse } from 'axios'
import client from './client'

export interface CurrentUser {
  id: string
  username: string
  email: string
  fullName: string | null
  status: string
  twoFactorEnabled: boolean
  roles: { id: string; code: string; name: string; description: string; permissionCount: number }[]
  directPermissions: string[]
  allPermissions: string[]
  lastLogin: string | null
  createdAt: string
  updatedAt: string
}

export const getMe = (): Promise<AxiosResponse<CurrentUser>> =>
  client.get('/auth/me')

export const login = (login: string, password: string) =>
  axios.post('/api/v1/auth/login', { login, password })

export const verify2fa = (partialToken: string, code: string) =>
  axios.post('/api/v1/auth/2fa/verify', { partialToken, code })

export const refresh = (refreshToken: string) =>
  axios.post('/api/v1/auth/refresh', { refreshToken })

export const logout = (refreshToken: string) =>
  client.post('/auth/logout', { refreshToken })

export const enrol2fa = () =>
  client.post('/auth/2fa/enrol')

export const confirm2fa = (code: string) =>
  client.post('/auth/2fa/confirm', { code })

export const disable2fa = (targetUserId?: string) =>
  client.delete('/auth/2fa/disable', { params: targetUserId ? { targetUserId } : {} })
