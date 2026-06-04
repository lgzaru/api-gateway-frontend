import { Loader2 } from 'lucide-react'

interface SpinProps {
  size?:     number
  fullscreen?: boolean
  tip?:      string
}

export default function Spin({ size = 20, fullscreen, tip }: SpinProps) {
  if (fullscreen) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', gap: 12, zIndex: 9998,
      }}>
        <Loader2 size={32} color="var(--accent)" style={{ animation: 'spin 0.8s linear infinite' }} />
        {tip && <span style={{ color: 'var(--txt-2)', fontSize: 13 }}>{tip}</span>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
      <Loader2 size={size} color="var(--accent)" style={{ animation: 'spin 0.8s linear infinite' }} />
      {tip && <span style={{ color: 'var(--txt-2)', fontSize: 13 }}>{tip}</span>}
    </div>
  )
}
