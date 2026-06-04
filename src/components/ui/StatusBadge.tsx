import type { ReactNode, CSSProperties } from 'react'
import type { StatusColor } from './StatusDot'
import { StatusDot } from './StatusDot'

interface StatusBadgeProps {
  color: StatusColor
  label: string
  dot?: boolean           // show a leading dot (default false)
  style?: CSSProperties
  children?: ReactNode
}

export function StatusBadge({ color, label, dot = false, style, children }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${color}`} style={style} aria-label={label}>
      {dot && <StatusDot color={color} label="" />}
      {children ?? label}
    </span>
  )
}
