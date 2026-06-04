import { useState } from 'react'
import type { AxiosError } from 'axios'
import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Alert } from '../components/ui'

export default function TwoFactorVerify() {
  const { verify2fa, partialToken } = useAuth()
  const navigate = useNavigate()
  const [code, setCode]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  if (!partialToken) { navigate('/login'); return null }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code'); return }
    setLoading(true)
    setError(null)
    try {
      await verify2fa(code)
      navigate('/')
    } catch (err) {
      const ae = err as AxiosError<{ message?: string }>
      setError(ae.response?.data?.message ?? 'Invalid or expired code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f1629 0%, #1a2744 50%, #0f1629 100%)',
    }}>
      <div style={{
        width: 400, background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
        padding: '48px 40px', backdropFilter: 'blur(20px)',
        animation: 'scale-in 0.25s var(--ease-snappy) both',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
            background: 'rgba(50,77,255,0.15)', border: '1px solid rgba(50,77,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={28} color="#6272ff" />
          </div>
          <h3 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Two-Factor Authentication</h3>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: 0 }}>
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        {error && <Alert type="error" title={error} style={{ marginBottom: 20 }} />}

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            autoFocus
            className="pus-input"
            style={{
              textAlign: 'center', letterSpacing: 12, fontSize: 26, fontWeight: 700,
              height: 56, background: 'rgba(255,255,255,0.06)',
              border: '1.5px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 12,
            }}
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="btn btn-primary btn-xl btn-block"
            style={{ borderRadius: 12 }}
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            className="btn btn-link btn-block"
            style={{ color: 'rgba(255,255,255,0.4)', justifyContent: 'center' }}
            onClick={() => navigate('/login')}
          >
            Back to login
          </button>
        </form>
      </div>
    </div>
  )
}
