import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'

interface ReadOnlyFieldProps { value: ReactNode; copyable?: boolean }

export function ReadOnlyField({ value }: ReadOnlyFieldProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--txt-2)' }}>
      <Lock size={11} style={{ opacity: 0.5 }} />
      {value}
    </span>
  )
}
