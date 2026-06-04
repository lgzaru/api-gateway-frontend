import type { CSSProperties } from 'react'

export type StatusColor = 'green' | 'amber' | 'red' | 'blue' | 'grey'

interface StatusDotProps {
  color: StatusColor
  label: string          // always provide for accessibility
  style?: CSSProperties
}

export function StatusDot({ color, label, style }: StatusDotProps) {
  return (
    <span
      className={`status-dot status-dot--${color}`}
      role="img"
      aria-label={label}
      style={style}
    />
  )
}
