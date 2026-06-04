import type { ReactNode, CSSProperties } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  style?: CSSProperties
}

export function PageHeader({ title, subtitle, actions, style }: PageHeaderProps) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: subtitle ? 'flex-start' : 'center',
        marginBottom: 16,
        ...style,
      }}
    >
      <div>
        <h2
          data-pus="page-title"
          style={{ margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.3 }}
        >
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  )
}
