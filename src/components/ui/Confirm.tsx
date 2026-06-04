import { useState, type ReactNode, cloneElement, isValidElement, type ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'
import Btn from './Btn'

interface ConfirmProps {
  title?:       string
  description?: string
  onConfirm:    () => void
  children:     ReactNode
  danger?:      boolean
  loading?:     boolean
}

export default function Confirm({ title = 'Are you sure?', description, onConfirm, children, danger, loading }: ConfirmProps) {
  const [open, setOpen] = useState(false)

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<{ onClick?: () => void }>, {
        onClick: () => setOpen(true),
      })
    : children

  if (!open) return <>{trigger}</>

  return (
    <>
      {trigger}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          animation: 'fade-in 0.15s both',
        }}
        onClick={e => e.target === e.currentTarget && setOpen(false)}
      >
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: '24px',
          width: 360,
          animation: 'scale-in 0.18s var(--ease-snappy) both',
        }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <AlertTriangle size={20} color={danger ? 'var(--red)' : 'var(--orange)'} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt-1)', marginBottom: 4 }}>{title}</div>
              {description && <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{description}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn
              variant={danger ? 'danger' : 'primary'}
              size="sm"
              loading={loading}
              onClick={() => { onConfirm(); setOpen(false) }}
            >
              Confirm
            </Btn>
          </div>
        </div>
      </div>
    </>
  )
}
