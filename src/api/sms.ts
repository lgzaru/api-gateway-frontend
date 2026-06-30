import axios from 'axios'
import type { AxiosResponse } from 'axios'

// ── localStorage keys ─────────────────────────────────────────────────────────

const URL_KEY   = 'sms_gw_url'
const TOKEN_KEY = 'sms_gw_token'
const USER_KEY  = 'sms_gw_user'
const PASS_KEY  = 'sms_gw_pass'

// Default uses the Vite dev proxy (/sms-proxy). In production configure nginx to
// proxy /sms-proxy → https://sms.1010tech.io, or override in the SMS Config tab.
export const getSmsGatewayUrl = () => {
  const stored = localStorage.getItem(URL_KEY)
  // Migrate old direct-URL entries to the proxy path so CORS is avoided.
  if (!stored || stored === 'https://sms.1010tech.io') {
    localStorage.setItem(URL_KEY, '/sms-proxy')
    return '/sms-proxy'
  }
  return stored
}
export const getSmsGatewayToken = () => localStorage.getItem(TOKEN_KEY) ?? ''
export const getSmsGatewayUser  = () => localStorage.getItem(USER_KEY)  ?? ''
export const getSmsGatewayPass  = () => localStorage.getItem(PASS_KEY)  ?? ''
export const setSmsGatewayUrl   = (v: string) => localStorage.setItem(URL_KEY, v)
export const setSmsGatewayToken = (v: string) => localStorage.setItem(TOKEN_KEY, v)
export const setSmsGatewayUser  = (v: string) => localStorage.setItem(USER_KEY, v)
export const setSmsGatewayPass  = (v: string) => localStorage.setItem(PASS_KEY, v)

// Per-application token storage (keyed by applicationId)
export const getAppToken = (appId: string) => localStorage.getItem(`sms_app_token_${appId}`) ?? ''
export const setAppToken = (appId: string, token: string) => localStorage.setItem(`sms_app_token_${appId}`, token)

function smsAxios(baseURL: string) {
  return axios.create({ baseURL, headers: { 'Content-Type': 'application/json' } })
}

// ── Models ────────────────────────────────────────────────────────────────────

export interface SmsApplication {
  id: number
  applicationId: string
  applicationName: string
  description: string
  status: 'ACTIVE' | 'INACTIVE' | 'DISABLED'
  maxLimit: number
  smsCount: number
  senderId: string
  priority: number
  email: string
  monthlyLimitNotification: boolean
  createdAt: string
  tokenDisabled: boolean
}

export interface RegisterRequest {
  applicationName: string
  description: string
  maxLimit: string
  senderId: string
  email: string
  priority: number
}

export interface RegisterResponse {
  applicationId: string
  token?: string
  Token?: string
}

export interface SmsRequest {
  txGuid: string
  applicationId: string
  cell: string
  message: string
}

export interface SmsLogEntry {
  id: number
  applicationId: string
  smsLogId: string
  msgId: string
  cell: string
  msg: string
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
  first: boolean
  last: boolean
}

export interface BulkSmsPayload {
  applicationId: string
  message: string
  cells: string[]
}

export interface BulkSmsResponse {
  total: number
  successful: number
  failed: number
  results: Record<string, string>
}

export interface GatewayHealth {
  status: string
  service: string
  version: string
  timestamp: string
  totalApplications: number
}

export interface GatewayStats {
  totalApps: number
  activeApps: number
  inactiveApps: number
  revokedApps: number
  totalSmsThisMonth: number
  totalCapacity: number
  remainingCapacity: number
  utilizationPct: number
  nearLimitCount: number
  atLimitCount: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const SENDER_IDS = [
  { value: '001', label: '001 – TenTen' },
  { value: '002', label: '002 – CvrBooking' },
  { value: '003', label: '003 – BridgeFee' },
  { value: '004', label: '004 – Bkng ZimPks (Gikko)' },
  { value: '005', label: '005 – Bkngs ZimPks (Econet)' },
  { value: '006', label: '006 – ZBC LIC' },
  { value: '008', label: '008 – Custom' },
]

export const PRIORITIES = [
  { value: '1', label: '1 – HIGH (OTP / immediate)' },
  { value: '2', label: '2 – MEDIUM (notifications, 2 min delay)' },
  { value: '3', label: '3 – LOW (queued)' },
]

// response code → human description (from official spec)
export const SMS_CODES: Record<string, string> = {
  '000': 'SMS submitted to queue or sent successfully',
  '111': 'Application not found',
  '222': 'Not authorized',
  '333': 'Reached monthly limit',
  '444': 'Application deactivated',
  '555': 'SMS service offline',
  '666': 'Invalid number format — gateway accepts Zim numbers only',
  '888': 'Invalid txGuid',
  '999': 'txGuid required',
}

export function isSmsSuccess(code?: string) {
  return code === '000'
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const registerApplication = (
  data: RegisterRequest,
  basicAuth: string,
  baseURL: string,
): Promise<AxiosResponse<RegisterResponse>> =>
  smsAxios(baseURL).post('/api/v1/tenten/register', data, {
    headers: { Authorization: `Basic ${basicAuth}` },
  })

export const getAllApplications = (
  token: string,
  baseURL: string,
): Promise<AxiosResponse<SmsApplication[]>> =>
  smsAxios(baseURL).get('/api/v1/tenten/all', {
    headers: { Authorization: `Bearer ${token}` },
  })

export const updateApplication = (
  id: number,
  data: Partial<Omit<SmsApplication, 'id' | 'applicationId' | 'smsCount' | 'createdAt'>>,
  token: string,
  baseURL: string,
): Promise<AxiosResponse<SmsApplication>> =>
  smsAxios(baseURL).put(`/api/v1/tenten/update/${id}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  })

export const deleteApplication = (
  id: number,
  token: string,
  baseURL: string,
): Promise<AxiosResponse<Record<string, string>>> =>
  smsAxios(baseURL).delete(`/api/v1/tenten/delete/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

export const toggleApplicationStatus = (
  id: number,
  token: string,
  baseURL: string,
): Promise<AxiosResponse<Record<string, string>>> =>
  smsAxios(baseURL).patch(`/api/v1/tenten/change-status/${id}`, null, {
    headers: { Authorization: `Bearer ${token}` },
  })

// Tokens expire in 12 months (jwt.expiry.months=12 in prod). applicationId is the UUID (not numeric id).
export const renewAccessToken = (
  applicationId: string,
  token: string,
  baseURL: string,
): Promise<AxiosResponse<{ Token?: string; expiresAt?: string; Error?: string }>> =>
  smsAxios(baseURL).get('/api/v1/tenten/renewAccessToken', {
    params: { applicationId },
    headers: { Authorization: `Bearer ${token}` },
  })

export const sendSms = (
  data: SmsRequest,
  token: string,
  baseURL: string,
): Promise<AxiosResponse<Record<string, string>>> =>
  smsAxios(baseURL).post('/api/v1/tenten/sendSMS', data, {
    headers: { Authorization: `Bearer ${token}` },
  })

export const sendBulkSms = (
  data: BulkSmsPayload,
  token: string,
  baseURL: string,
): Promise<AxiosResponse<BulkSmsResponse>> =>
  smsAxios(baseURL).post('/api/v1/tenten/sendBulkSMS', data, {
    headers: { Authorization: `Bearer ${token}` },
  })

export interface DispatchStatus {
  txGuid: string
  status: 'QUEUED' | 'DISPATCHED' | 'FAILED'
  applicationId: string
  cell: string
  priority: number
  queuedAt: string
  dispatchedAt: string | null
}

export const getDispatchStatus = (
  txGuid: string,
  token: string,
  baseURL: string,
): Promise<AxiosResponse<DispatchStatus>> =>
  smsAxios(baseURL).get(`/api/v1/tenten/status/${txGuid}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

export const getLogs = (
  params: { applicationId?: string; cell?: string; from?: string; to?: string; page?: number; size?: number },
  token: string,
  baseURL: string,
): Promise<AxiosResponse<PageResponse<SmsLogEntry>>> =>
  smsAxios(baseURL).get('/api/v1/tenten/logs', {
    params: { page: 0, size: 20, ...params },
    headers: { Authorization: `Bearer ${token}` },
  })

export const gatewayHealth = (
  baseURL: string,
): Promise<AxiosResponse<GatewayHealth>> =>
  smsAxios(baseURL).get('/api/v1/tenten/health')

export const getGatewayStats = (
  token: string,
  baseURL: string,
): Promise<AxiosResponse<GatewayStats>> =>
  smsAxios(baseURL).get('/api/v1/tenten/stats', {
    headers: { Authorization: `Bearer ${token}` },
  })

export const disableApplicationToken = (
  id: number,
  token: string,
  baseURL: string,
): Promise<AxiosResponse<Record<string, string>>> =>
  smsAxios(baseURL).patch(`/api/v1/tenten/disable-token/${id}`, null, {
    headers: { Authorization: `Bearer ${token}` },
  })

// ── Monthly Usage ─────────────────────────────────────────────────────────────

export interface MonthlyUsageResponse {
  applicationId: string
  year: number
  month: number
  smsCount: number
  capturedAt: string | null
  source: 'ARCHIVE' | 'LOG_COUNT'
}

export interface MonthlyUsageHistoryEntry {
  id: number
  applicationId: string
  year: number
  month: number
  smsCount: number
  capturedAt: string
}

export const getMonthlyUsage = (
  applicationId: string,
  year: number,
  month: number,
  token: string,
  baseURL: string,
): Promise<AxiosResponse<MonthlyUsageResponse>> =>
  smsAxios(baseURL).get('/api/v1/tenten/monthly-usage', {
    params: { applicationId, year, month },
    headers: { Authorization: `Bearer ${token}` },
  })

export const getUsageHistory = (
  applicationId: string,
  token: string,
  baseURL: string,
): Promise<AxiosResponse<MonthlyUsageHistoryEntry[]>> =>
  smsAxios(baseURL).get('/api/v1/tenten/monthly-usage/history', {
    params: { applicationId },
    headers: { Authorization: `Bearer ${token}` },
  })
