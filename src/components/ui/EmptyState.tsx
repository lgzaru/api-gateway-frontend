import type { ReactNode } from 'react'
import Btn from './Btn'

interface EmptyStateProps {
  icon:     ReactNode
  message:  string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 16px', color: 'var(--txt-3)' }}>
      <span style={{ fontSize: 32, opacity: 0.5 }}>{icon}</span>
      <p style={{ fontSize: 13, margin: 0, textAlign: 'center', color: 'var(--txt-3)' }}>{message}</p>
      {action && <Btn variant="primary" size="sm" onClick={action.onClick}>{action.label}</Btn>}
    </div>
  )
}
