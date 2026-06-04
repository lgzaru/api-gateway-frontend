import type { ReactNode, CSSProperties, MouseEvent } from 'react'
import { Home } from 'lucide-react'
import { Link } from 'react-router-dom'

interface ModuleStat { label: string; value: string | number }

export interface ModuleMeta {
  label: string
  color: string
  iconEl: ReactNode
  description: string
  stats: ModuleStat[]
}

interface ModuleShellProps { module: ModuleMeta; extra?: ReactNode; children: ReactNode }

export default function ModuleShell({ module: mod, extra, children }: ModuleShellProps) {
  const cardStyle: CSSProperties = {
    background: 'var(--surface)', borderRadius: 'var(--r-md)', padding: '14px 16px',
    border: '1px solid var(--border)', borderLeft: `4px solid ${mod.color}`,
    transition: 'box-shadow 0.15s, transform 0.15s',
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 12, color: 'var(--txt-3)' }}>
        <Link to="/" style={{ color: 'var(--txt-3)', display: 'flex' }}><Home size={12} /></Link>
        <span>/</span>
        <span style={{ color: 'var(--txt-2)' }}>{mod.label}</span>
      </div>

      {/* Module header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{
            width: 50, height: 50, borderRadius: 13,
            background: mod.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: mod.color, fontSize: 24, border: `1px solid ${mod.color}25`,
          }}>
            {mod.iconEl}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--txt-1)', marginBottom: 2, letterSpacing: '-0.3px' }}>{mod.label}</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>{mod.description}</div>
          </div>
        </div>
        {extra}
      </div>

      {/* Stats grid */}
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {mod.stats.map(s => (
          <div
            key={s.label}
            style={cardStyle}
            onMouseEnter={(e: MouseEvent<HTMLDivElement>) => {
              e.currentTarget.style.boxShadow = `0 4px 16px ${mod.color}20`
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e: MouseEvent<HTMLDivElement>) => {
              e.currentTarget.style.boxShadow = ''
              e.currentTarget.style.transform = ''
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--txt-1)', lineHeight: 1, letterSpacing: '-0.5px' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {children}
    </div>
  )
}
