import type { ReactNode } from 'react'

type TagColor = 'green' | 'red' | 'orange' | 'blue' | 'accent' | 'muted'

interface TagProps {
  color?:    TagColor
  children?: ReactNode
  dot?:      boolean
  style?:    React.CSSProperties
}

export default function Tag({ color = 'muted', children, dot, style }: TagProps) {
  return (
    <span className={`tag tag-${color}`} style={style}>
      {dot && (
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'currentColor', flexShrink: 0,
          display: 'inline-block',
        }} />
      )}
      {children}
    </span>
  )
}
