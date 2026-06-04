import client from './client'
import type { AxiosResponse } from 'axios'

export interface PlatformConfigResponse {
  prodDomain: string
  devDomain: string
  sandboxDomain: string
}

export const getPlatformConfig = (): Promise<AxiosResponse<PlatformConfigResponse>> =>
  client.get('/tag/platform/config')

export const updatePlatformConfig = (data: Partial<PlatformConfigResponse>): Promise<AxiosResponse<PlatformConfigResponse>> =>
  client.put('/tag/platform/config', data)

/** Returns the server's current time by reading the Date response header. */
export const getServerTime = async (): Promise<Date> => {
  const res = await client.head('/tag/platform/config')
  const serverDate = res.headers['date'] ? new Date(res.headers['date'] as string) : null
  return serverDate && !isNaN(serverDate.getTime()) ? serverDate : new Date()
}
