import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { login as apiLogin, verify2fa as apiVerify2fa, logout as apiLogout, refresh as apiRefresh } from '../api/auth'
import { setAccessToken, clearAll, getRefreshToken, setRefreshToken } from '../api/tokenManager'
import { useIdleTimer } from '../hooks/useIdleTimer'
import type { User } from '../types'

export type SessionExpiredReason = 'idle' | 'expired' | null

interface AuthContextType {
  user: User | null
  loading: boolean
  partialToken: string | null
  sessionExpiredReason: SessionExpiredReason
  login: (loginId: string, password: string) => Promise<{ twoFactorRequired: boolean }>
  verify2fa: (code: string) => Promise<void>
  logout: () => Promise<void>
  clearExpiredReason: () => void
  can: (permission: string) => boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [partialToken, setPartialToken] = useState<string | null>(null)
  const [sessionExpiredReason, setSessionExpiredReason] = useState<SessionExpiredReason>(null)

  // Ref so event handler always reads current user without stale closure
  const userRef = useRef(user)
  userRef.current = user

  useEffect(() => {
    const rt = getRefreshToken()
    if (!rt) { setLoading(false); return }
    apiRefresh(rt)
      .then(({ data }) => {
        setAccessToken(data.accessToken)
        setUser(decodeJwtUser(data.accessToken))
      })
      .catch(() => clearAll())
      .finally(() => setLoading(false))
  }, [])

  // Called by idle timer and tag:unauthorized handler — clears session and shows banner
  const expireSession = useCallback(async (reason: NonNullable<SessionExpiredReason>) => {
    if (!userRef.current) return  // already logged out — ignore race
    const rt = getRefreshToken()
    try { if (rt) await apiLogout(rt) } catch { /* ignore */ }
    clearAll()
    setUser(null)
    setPartialToken(null)
    setSessionExpiredReason(reason)
    navigate('/login', { replace: true })
  }, [navigate])

  // Idle timer — 30 min of no mouse/keyboard/click/touch → session expired
  useIdleTimer(!!user, () => expireSession('idle'))

  // JWT expired on the server — client.ts dispatched this after refresh failed
  useEffect(() => {
    const handler = () => { if (userRef.current) expireSession('expired') }
    window.addEventListener('tag:unauthorized', handler)
    return () => window.removeEventListener('tag:unauthorized', handler)
  }, [expireSession])

  const login = useCallback(async (loginId: string, password: string) => {
    const res = await apiLogin(loginId, password)
    const data = res.data
    if (res.status === 202 || data.twoFactorRequired) {
      setPartialToken(data.partialToken)
      return { twoFactorRequired: true }
    }
    setAccessToken(data.accessToken)
    setRefreshToken(data.refreshToken)
    setUser(data.user)
    setSessionExpiredReason(null)
    return { twoFactorRequired: false }
  }, [])

  const verify2fa = useCallback(async (code: string) => {
    if (!partialToken) throw new Error('No pending 2FA session')
    const { data } = await apiVerify2fa(partialToken, code)
    setAccessToken(data.accessToken)
    setRefreshToken(data.refreshToken)
    setUser(data.user)
    setPartialToken(null)
    setSessionExpiredReason(null)
  }, [partialToken])

  const logout = useCallback(async () => {
    const rt = getRefreshToken()
    try { if (rt) await apiLogout(rt) } catch { /* ignore */ }
    clearAll()
    setUser(null)
    setPartialToken(null)
    setSessionExpiredReason(null)
  }, [])

  const clearExpiredReason = useCallback(() => setSessionExpiredReason(null), [])

  const can = useCallback((permission: string) => {
    if (!user) return false
    const roles = user.roles ?? []
    if (roles.includes('ROLE_ADMIN')) return true
    const roleMap: Record<string, string[]> = {
      ROLE_IT:        ['PROXY', 'ICE', 'SMS', 'GOVERNANCE', 'VERSION', 'WEBHOOK', 'BILLING', 'REPORT', 'NOTIFY', 'PARTNER', 'INCIDENT', 'FLAG', 'BACKUP', 'SCRAPING', 'CATALOGUE'],
      ROLE_DEVELOPER: ['PROXY:READ', 'ICE', 'FLAG:READ', 'VERSION:READ', 'CHANGELOG:READ', 'CATALOGUE:READ'],
      ROLE_TESTER:    ['PROXY:READ', 'VERSION:READ', 'FLAG:READ', 'REPORT:READ'],
    }
    return roles.some(role =>
      (roleMap[role] ?? []).some(p => permission.startsWith(p))
    )
  }, [user])

  const isAdmin = user?.roles?.includes('ROLE_ADMIN') ?? false

  return (
    <AuthContext.Provider value={{ user, loading, partialToken, sessionExpiredReason, login, verify2fa, logout, clearExpiredReason, can, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

function decodeJwtUser(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return { id: payload.sub, roles: payload.roles ?? [], email: payload.email, username: payload.username }
  } catch {
    return null
  }
}
