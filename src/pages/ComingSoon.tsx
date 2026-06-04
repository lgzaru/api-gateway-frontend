import { useNavigate } from 'react-router-dom'
import { Clock, ArrowLeft } from 'lucide-react'
import { Btn } from '../components/ui'

export default function ComingSoon({ title = 'Module Coming Soon' }: { title?: string }) {
  const navigate = useNavigate()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 400, gap: 16, textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Clock size={28} color="var(--blue)" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--txt-1)', margin: 0 }}>{title}</h2>
      <p style={{ color: 'var(--txt-3)', fontSize: 13, margin: 0 }}>This module is being built. Check back soon.</p>
      <Btn variant="secondary" size="sm" icon={<ArrowLeft size={13} />} onClick={() => navigate('/')}>
        Back to Dashboard
      </Btn>
    </div>
  )
}
