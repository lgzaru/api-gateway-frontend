import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface DrawerProps {
  open:      boolean
  onClose:   () => void
  title?:    ReactNode
  width?:    number
  children?: ReactNode
  footer?:   ReactNode
}

export default function Drawer({ open, onClose, title, width = 480, children, footer }: DrawerProps) {
  const [closing, setClosing] = useState(false)

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 200)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && handleClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open && !closing) return null

  return createPortal(
    <>
      <div
        className="pus-drawer-backdrop"
        onClick={handleClose}
        style={{ opacity: closing ? 0 : 1, transition: 'opacity 0.2s' }}
      />
      <div
        className={`pus-drawer ${closing ? 'closing' : ''}`}
        style={{ width }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--txt-1)' }}>{title}</span>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--txt-3)', display: 'flex', padding: 4, borderRadius: 6,
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--txt-1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--txt-3)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8, justifyContent: 'flex-end',
            flexShrink: 0,
            background: 'var(--surface)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}
