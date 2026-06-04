import client from './client'
import type { AxiosResponse } from 'axios'

export type ClientStatus = 'ACTIVE' | 'REVOKED'

export interface ClientCredential {
  id: string
  clientId: string
  name: string
  description: string | null
  status: ClientStatus
  permissions: string[]
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
}

export interface ClientCreated {
  id: string
  clientId: string
  clientSecret: string
  name: string
  status: ClientStatus
  createdAt: string
}

export interface ClientRotated {
  clientId: string
  newClientSecret: string
}

export const listClients = (): Promise<AxiosResponse<ClientCredential[]>> =>
  client.get('/clients')

export const listPartnerClients = (partnerId: string): Promise<AxiosResponse<ClientCredential[]>> =>
  client.get(`/tag/partners/${partnerId}/clients`)

export const getClient = (id: string): Promise<AxiosResponse<ClientCredential>> =>
  client.get(`/clients/${id}`)

export const createClient = (data: {
  name: string
  description?: string
  permissions?: string[]
  expiresAt?: string
}): Promise<AxiosResponse<ClientCreated>> =>
  client.post('/clients', data)

export const createPartnerClient = (
  partnerId: string,
  data: { name: string; description?: string; permissions?: string[]; expiresAt?: string }
): Promise<AxiosResponse<ClientCreated>> =>
  client.post(`/tag/partners/${partnerId}/clients`, data)

export const updateClient = (
  id: string,
  data: { name?: string; description?: string; permissions?: string[] }
): Promise<AxiosResponse<ClientCredential>> =>
  client.put(`/clients/${id}`, data)

export const rotateSecret = (id: string): Promise<AxiosResponse<ClientRotated>> =>
  client.post(`/clients/${id}/rotate`)

export const revokeClient = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/clients/${id}`)
