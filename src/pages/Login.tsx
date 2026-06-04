import { useState } from 'react'
import type { AxiosError } from 'axios'
import { useNavigate } from 'react-router-dom'
import { User, Lock, ArrowRight, Clock, ShieldOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Inp, Alert } from '../components/ui'

const LOGO = 'https://www.1010tech.io/wp-content/uploads/2022/07/cropped-site-image-1-270x270.png'
const HERO = 'https://www.1010tech.io/wp-content/uploads/2022/07/office-meeting.png'

function SessionBanner({ icon, color, title, message }: {
  icon: React.ReactNode
  color: string
  title: string
  message: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      background: 'rgba(255,255,255,0.07)',
      border: `1px solid ${color}40`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 12,
      padding: '12px 14px',
      marginBottom: 20,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{title}</div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.5 }}>{message}</div>
      </div>
    </div>
  )
}

export default function Login() {
  const { login, sessionExpiredReason, clearExpiredReason } = useAuth()
  const navigate   = useNavigate()
  const [loginId, setLoginId]   = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [errors, setErrors]     = useState<{ loginId?: string; password?: string }>({})

  const validate = () => {
    const e: typeof errors = {}
    if (!loginId.trim())  e.loginId  = 'Username or email is required'
    if (!password)        e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearExpiredReason()
    if (!validate()) return
    setLoading(true)
    setError(null)
    try {
      const result = await login(loginId, password)
      navigate(result.twoFactorRequired ? '/2fa' : '/')
    } catch (err) {
      const ae = err as AxiosError<{ message?: string; error?: string }>
      setError(ae.response?.data?.message ?? ae.response?.data?.error ?? 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>

      {/* Left hero */}
      <div className="hide-mobile" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <img src={HERO} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(6,10,20,0.82) 0%, rgba(12,22,50,0.72) 50%, rgba(6,10,20,0.88) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 52px 52px' }}>
          <img src={LOGO} alt="1010 Tech" style={{ width: 52, height: 52, borderRadius: 13, objectFit: 'contain', marginBottom: 22, boxShadow: '0 4px 16px rgba(50,77,255,0.35)' }} />
          <h2 style={{ color: '#fff', fontSize: 30, fontWeight: 700, margin: '0 0 12px', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            Ten Ten API Gateway
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: 15, margin: '0 0 32px', lineHeight: 1.65, maxWidth: 360 }}>
            TAG — API Gateway, Platform Monitoring &amp; Partner Management
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <img src={LOGO} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'contain', opacity: 0.7 }} />
            <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>© {new Date().getFullYear()} Ten Ten Technology</span>
          </div>
        </div>
      </div>

      {/* Right form — data-theme="dark" locks CSS vars to dark tokens since this panel is always dark */}
      <div
        data-theme="dark"
        style={{
          width: 460, flexShrink: 0,
          background: 'linear-gradient(180deg, #0b1022 0%, #0f1629 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 48px', minHeight: '100vh',
        }}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>

          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <img src={LOGO} alt="1010 Tech" style={{ width: 60, height: 60, borderRadius: 16, objectFit: 'contain', marginBottom: 18, boxShadow: '0 4px 20px rgba(50,77,255,0.4)' }} />
            <h3 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.3px' }}>Sign in</h3>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>to Ten Ten API Gateway (TAG)</span>
          </div>

          {sessionExpiredReason === 'idle' && (
            <SessionBanner
              icon={<Clock size={16} />}
              color="#f59e0b"
              title="Session Expired"
              message="You were signed out due to inactivity. Please sign in again to continue."
            />
          )}

          {sessionExpiredReason === 'expired' && (
            <SessionBanner
              icon={<ShieldOff size={16} />}
              color="#ef4444"
              title="Session Ended"
              message="Your session is no longer valid. Please sign in again to continue."
            />
          )}

          {error && <Alert type="error" title={error} style={{ marginBottom: 20 }} />}

          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Inp
              label="Username or email"
              prefix={<User size={14} />}
              type="text"
              value={loginId}
              onChangeValue={setLoginId}
              placeholder="Username or email"
              error={errors.loginId}
              autoFocus
              style={{ height: 40 }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Inp
                label="Password"
                prefix={<Lock size={14} />}
                type="password"
                value={password}
                onChangeValue={setPassword}
                placeholder="Password"
                error={errors.password}
                style={{ height: 40 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { /* TODO: implement forgot password flow */ }}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 500,
                    color: 'var(--accent)',
                  }}
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-xl btn-block"
              style={{ marginTop: 8, borderRadius: 12 }}
            >
              {loading ? 'Signing in…' : <><span>Sign in</span><ArrowRight size={16} /></>}
            </button>
          </form>

          <div style={{ marginTop: 32, textAlign: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>Secure access · Ten Ten Technology</span>
          </div>
        </div>
      </div>
    </div>
  )
}
