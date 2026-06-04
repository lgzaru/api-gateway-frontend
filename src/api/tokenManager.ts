// In-memory access token — never persisted to avoid XSS
let _accessToken: string | null = null

export const getAccessToken = (): string | null => _accessToken
export const setAccessToken = (token: string): void => { _accessToken = token }
export const clearAccessToken = (): void => { _accessToken = null }

// Refresh token lives in localStorage (7-day lifetime)
const RT_KEY = 'pus_rt'
export const getRefreshToken = (): string | null => localStorage.getItem(RT_KEY)
export const setRefreshToken = (token: string): void => localStorage.setItem(RT_KEY, token)
export const clearRefreshToken = (): void => localStorage.removeItem(RT_KEY)

export const clearAll = (): void => {
  clearAccessToken()
  clearRefreshToken()
}
