import axios from 'axios'
import { getAccessToken, setAccessToken, getRefreshToken, clearAll } from './tokenManager'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Decode JWT exp claim (seconds) — returns true if expired or expiring within 30s
function isTokenExpired(token: string | null): boolean {
  if (!token) return true
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64))
    return (payload.exp ?? 0) * 1000 < Date.now() + 30_000
  } catch {
    return true
  }
}

// Single in-flight refresh promise — prevents parallel refresh storms
let refreshing: Promise<string> | null = null

function dispatchUnauthorized() {
  clearAll()
  window.dispatchEvent(new CustomEvent('tag:unauthorized'))
}

async function doRefresh(): Promise<string> {
  const rt = getRefreshToken()
  if (!rt) throw new Error('no refresh token')
  if (!refreshing) {
    refreshing = axios
      .post<{ accessToken: string }>('/api/v1/auth/refresh', { refreshToken: rt })
      .then(({ data }) => {
        setAccessToken(data.accessToken)
        return data.accessToken
      })
      .finally(() => { refreshing = null })
  }
  return refreshing
}

// Proactive: if the stored token is already expired before we send the request,
// refresh first so we don't waste a round-trip with a stale token.
client.interceptors.request.use(async (config) => {
  let token = getAccessToken()

  if (isTokenExpired(token)) {
    try {
      token = await doRefresh()
    } catch {
      dispatchUnauthorized()
      // Cancel the request rather than sending it with no token
      const ctrl = new AbortController()
      ctrl.abort()
      return { ...config, signal: ctrl.signal }
    }
  }

  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Reactive: on 401 or 403, retry once after a fresh token — but only when
// our local token is actually expired (avoids infinite retry on real 403s).
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const status: number | undefined = error.response?.status

    if ((status === 401 || status === 403) && !original._retry && isTokenExpired(getAccessToken())) {
      original._retry = true
      try {
        const newToken = await doRefresh()
        original.headers.Authorization = `Bearer ${newToken}`
        return client(original)
      } catch {
        dispatchUnauthorized()
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

export default client
