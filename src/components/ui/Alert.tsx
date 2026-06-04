import type { ReactNode } from 'react'
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react'
import { useState } from 'react'

type AlertType = 'info' | 'success' | 'warning' | 'error'

const ICONS: Record<AlertType, ReactNode> = {
  info:    <Info size={15} />,
  success: <CheckCircle2 size={15} />,
  warning: <AlertTriangle size={15} />,
  error:   <XCircle size={15} />,
}

interface AlertProps {
  type?:        AlertType
  title?:       string
  description?: string
  closable?:    boolean
  style?:       React.CSSProperties
  children?:    ReactNode
}

export default function Alert({
  type = 'info',
  title,
  description,
  closable,
  style,
  children,
}: AlertProps) {
  const [closed, setClosed] = useState(false)
  if (closed) return null

  return (
    <div className={`pus-alert pus-alert-${type}`} style={style}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{ICONS[type]}</span>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: description ? 2 : 0 }}>{title}</div>}
        {description && <div style={{ opacity: 0.85 }}>{description}</div>}
        {children}
      </div>
      {closable && (
        <button
          type="button"
          onClick={() => setClosed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'currentColor', opacity: 0.6, display: 'flex', padding: 2 }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
