import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, Shield, Users, UserCog, ScrollText, ClipboardCheck,
  Lock, Layers, Activity, CheckCircle2,
  ChevronRight, BarChart3, AlertCircle, TrendingUp, Gauge,
} from 'lucide-react'
import { useQuery }    from '@tanstack/react-query'
import { useAuth }     from '../context/AuthContext'
import { useTheme }    from '../context/ThemeContext'
import { listApis, getHealthSummary } from '../api/proxy'
import { getDashboardMetrics, type ApiMetrics } from '../api/governance'
import { listPartners }               from '../api/partners'
import { listPending, type Approval } from '../api/approvals'
import { listAuditLogs, type AuditLogEntry } from '../api/audit'
import { listUsers }                  from '../api/users'
import { getServerTime }              from '../api/platform'

// ── Active modules ────────────────────────────────────────────────────────────

interface ActiveModuleDef {
  key: string; label: string; color: string; path: string
  permission: string | null; description: string; icon: ReactNode
}

const ACTIVE_MODULES: ActiveModuleDef[] = [
  { key: 'proxy',      label: 'API Proxy',     color: '#324dff', path: '/proxy',      permission: 'PROXY:READ',       icon: <Zap size={20} />,            description: 'Route and manage API traffic through Kong gateway'  },
  { key: 'governance', label: 'API Policies',  color: '#ef4444', path: '/governance', permission: 'GOVERNANCE:TOKEN', icon: <Shield size={20} />,         description: 'Rate limits, access tokens, and API governance'     },
  { key: 'partners',   label: 'Partners',      color: '#8b5cf6', path: '/partners',   permission: 'PARTNER:READ',     icon: <Users size={20} />,          description: 'Partner onboarding, IP allowlists, and access'      },
  { key: 'users',      label: 'Users & Roles', color: '#f59e0b', path: '/users',      permission: null,               icon: <UserCog size={20} />,        description: 'Platform users, role assignments, and permissions'  },
  { key: 'approvals',  label: 'Approvals',     color: '#06b6d4', path: '/approvals',  permission: null,               icon: <ClipboardCheck size={20} />, description: 'Review and process pending approval requests'       },
  { key: 'audit',      label: 'Audit Log',     color: '#10b981', path: '/audit',      permission: null,               icon: <ScrollText size={20} />,     description: 'Immutable audit trail for all platform actions'     },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}


function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtMs(ms: number | null): string {
  return ms ? `${ms}ms` : '—'
}

// ── useCountUp ────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === 0) { setValue(0); return }
    let id: number
    const start = performance.now()
    const tick  = (now: number) => {
      const t    = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(ease * target))
      if (t < 1) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [target, duration])
  return value
}

// ── RingProgress ──────────────────────────────────────────────────────────────

function RingProgress({ pct, size = 78, stroke = 5, color, trackColor }: {
  pct: number; size?: number; stroke?: number; color: string; trackColor: string
}) {
  const r    = (size - stroke * 2) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s var(--ease-snappy)', filter: `drop-shadow(0 0 7px ${color}b0)` }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>{Math.round(pct)}%</span>
        <span style={{ fontSize: 8, color: 'var(--txt-3)', letterSpacing: '0.6px', marginTop: 2, textTransform: 'uppercase' }}>Access</span>
      </div>
    </div>
  )
}

// ── StatItem ──────────────────────────────────────────────────────────────────

function StatItem({ label, value, color, last }: { label: string; value: number; color: string; last?: boolean }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0 12px', borderRight: last ? 'none' : '1px solid var(--divider)' }}>
      <span style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.8px', textShadow: `0 0 16px ${color}50` }}>{value}</span>
      <span style={{ fontSize: 9, color: 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>{label}</span>
    </div>
  )
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, label, right, color }: {
  icon: ReactNode; label: string; right?: ReactNode; color: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${color}15`, border: `1px solid ${color}28`, borderRadius: 6, padding: '3px 9px' }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.4px', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
      {right && <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>{right}</span>}
    </div>
  )
}

// ── KpiCard (compact) ─────────────────────────────────────────────────────────

function KpiCard({ icon, value, label, sublabel, color, suffix, alert, onClick }: {
  icon: ReactNode; value: number; label: string
  sublabel?: string; color: string; suffix?: string
  alert?: boolean; onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const displayed = useCountUp(value)
  const isAlert   = alert && value > 0

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 'var(--r-lg)',
        border: `1px solid ${isAlert ? color + '60' : hovered ? color + '50' : 'var(--border)'}`,
        background: isAlert ? `${color}08` : hovered ? `${color}05` : 'var(--surface)',
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden', position: 'relative',
        boxShadow: hovered ? `0 6px 24px ${color}18, 0 0 0 1px ${color}20` : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'border-color var(--dur-normal) var(--ease-snappy), box-shadow var(--dur-normal) var(--ease-snappy), transform var(--dur-normal) var(--ease-snappy), background var(--dur-normal)',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color, opacity: hovered || isAlert ? 1 : 0.4, transition: 'opacity var(--dur-normal)' }} />
      <div style={{ padding: '12px 14px 12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `radial-gradient(circle at 30% 30%, ${color}28, ${color}0c)`,
          border: `1px solid ${color}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color,
          boxShadow: hovered ? `0 0 10px ${color}25` : 'none',
          transition: 'box-shadow var(--dur-normal)',
        }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.8px' }}>
            {suffix ? `${displayed}${suffix}` : fmtNum(displayed)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 3, whiteSpace: 'nowrap' }}>{label}</div>
          {sublabel && <div style={{ fontSize: 10, color: 'var(--txt-3)', marginTop: 1 }}>{sublabel}</div>}
        </div>
      </div>
    </div>
  )
}

// ── ModuleAccessCard — compact horizontal row ─────────────────────────────────

function ModuleAccessCard({ mod, allowed, onClick }: {
  mod: ActiveModuleDef; allowed: boolean; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => allowed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 'var(--r-md)',
        border: `1px solid ${hovered ? mod.color + '50' : 'var(--border)'}`,
        background: hovered ? `${mod.color}05` : 'var(--surface)',
        cursor: allowed ? 'pointer' : 'not-allowed',
        opacity: allowed ? 1 : 0.5,
        overflow: 'hidden', position: 'relative',
        boxShadow: hovered ? `0 4px 14px ${mod.color}18` : 'none',
        transform: hovered ? 'translateY(-1px)' : 'none',
        transition: 'border-color var(--dur-normal) var(--ease-snappy), box-shadow var(--dur-normal) var(--ease-snappy), transform var(--dur-normal) var(--ease-snappy), background var(--dur-normal)',
      }}
    >
      {/* left accent bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: mod.color, opacity: hovered ? 1 : 0.35, transition: 'opacity var(--dur-normal)' }} />

      <div style={{ padding: '9px 12px 9px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: `radial-gradient(circle at 30% 30%, ${mod.color}28, ${mod.color}0c)`,
          border: `1px solid ${mod.color}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: mod.color,
          boxShadow: hovered ? `0 0 10px ${mod.color}28` : 'none', transition: 'box-shadow var(--dur-normal)',
        }}>{mod.icon}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-1)', letterSpacing: '-0.2px', lineHeight: 1 }}>{mod.label}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.description}</div>
        </div>

        {!allowed
          ? <Lock size={10} color="var(--txt-3)" style={{ flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ flexShrink: 0, color: hovered ? mod.color : 'var(--txt-3)', transform: hovered ? 'translateX(1px)' : 'none', transition: 'color var(--dur-normal), transform var(--dur-normal) var(--ease-snappy)' }} />
        }
      </div>
    </div>
  )
}

// ── ApiHealthPanel ────────────────────────────────────────────────────────────

function ApiHealthPanel({ summary, accent, navigate }: {
  summary: import('../api/proxy').HealthSummaryResponse | undefined
  accent: string
  navigate: (to: string) => void
}) {
  const total    = summary?.totalApis ?? 0
  const up       = summary?.upCount ?? 0
  const degraded = summary?.degradedCount ?? 0
  const down     = summary?.downCount ?? 0
  const unknown  = summary?.unknownCount ?? 0
  const allClear = total > 0 && up === total && unknown === 0
  const problematic = summary?.degradedOrDown ?? []

  const bars: { label: string; count: number; color: string }[] = [
    { label: 'Up',       count: up,       color: '#10b981' },
    { label: 'Degraded', count: degraded, color: '#f59e0b' },
    { label: 'Down',     count: down,     color: '#ef4444' },
    { label: 'Unknown',  count: unknown,  color: '#6b7280' },
  ]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <SectionHeader icon={<BarChart3 size={11} />} label="API Health" color="#10b981"
        right={total > 0 ? <span style={{ fontSize: 10, color: 'var(--txt-3)' }}>{total} monitored</span> : undefined}
      />

      {/* Status tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 12 }}>
        {bars.map(b => {
          const active = b.count > 0
          return (
            <div key={b.label} style={{
              background: active ? `${b.color}12` : 'var(--surface-2)',
              border: `1px solid ${active ? b.color + '35' : 'var(--border)'}`,
              borderRadius: 8, padding: '8px 6px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: active ? b.color : 'var(--txt-3)', lineHeight: 1, letterSpacing: '-1px', textShadow: active ? `0 0 14px ${b.color}50` : 'none' }}>{b.count}</div>
              <div style={{ fontSize: 9, color: active ? b.color : 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 3, opacity: active ? 0.9 : 0.55 }}>{b.label}</div>
            </div>
          )
        })}
      </div>

      {/* Stacked bar */}
      {total > 0 && (
        <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 12, gap: 1 }}>
          {bars.filter(b => b.count > 0).map(b => (
            <div key={b.label} style={{ flex: b.count, background: b.color, transition: 'flex 0.8s var(--ease-snappy)', boxShadow: `0 0 6px ${b.color}60` }} />
          ))}
        </div>
      )}

      {/* Status body */}
      {total === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>No APIs monitored yet</span>
        </div>
      ) : allClear ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0' }}>
          <CheckCircle2 size={22} color="#10b981" style={{ opacity: 0.8 }} />
          <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>All systems operational</span>
        </div>
      ) : problematic.length > 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--txt-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Issues detected</span>
          {problematic.slice(0, 3).map(api => (
            <div key={api.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#ef444410', border: '1px solid #ef444428', borderRadius: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 5px #ef444480', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--txt-1)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{api.name}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Issue</span>
            </div>
          ))}
        </div>
      ) : unknown > 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0' }}>
          <AlertCircle size={20} color="#6b7280" style={{ opacity: 0.6 }} />
          <span style={{ fontSize: 12, color: 'var(--txt-3)', fontWeight: 500 }}>Health checks pending</span>
          <span style={{ fontSize: 10, color: 'var(--txt-3)', opacity: 0.7 }}>{unknown} API{unknown > 1 ? 's' : ''} not yet checked</span>
        </div>
      ) : null}

      <button onClick={() => navigate('/proxy')} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
        View all APIs <ChevronRight size={12} />
      </button>
    </div>
  )
}

// ── AuditFeedItem ─────────────────────────────────────────────────────────────

function auditMeta(entry: AuditLogEntry): { icon: ReactNode; color: string } {
  const t = (entry.entityType ?? '').toUpperCase()
  if (t.includes('PROXY') || t.includes('API'))    return { icon: <Zap size={10} />,            color: '#324dff' }
  if (t.includes('PARTNER'))                        return { icon: <Users size={10} />,          color: '#8b5cf6' }
  if (t.includes('USER'))                           return { icon: <UserCog size={10} />,        color: '#f59e0b' }
  if (t.includes('TOKEN') || t.includes('GOVERN')) return { icon: <Shield size={10} />,         color: '#ef4444' }
  if (t.includes('APPROVAL'))                      return { icon: <ClipboardCheck size={10} />, color: '#06b6d4' }
  return { icon: <Activity size={10} />, color: 'var(--txt-3)' }
}

function AuditFeedItem({ entry, last }: { entry: AuditLogEntry; last: boolean }) {
  const { icon, color } = auditMeta(entry)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: last ? 'none' : '1px solid var(--divider)' }}>
      <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--txt-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.action.replace(/_/g, ' ')}</div>
        <div style={{ fontSize: 10, color: 'var(--txt-3)', marginTop: 1 }}>{entry.actorUsername}</div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--txt-3)', flexShrink: 0 }}>{relativeTime(entry.createdAt)}</div>
    </div>
  )
}

// ── MetricsTable ──────────────────────────────────────────────────────────────

const API_COLORS = ['#324dff', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4']

function MetricsTable({ rows }: { rows: ApiMetrics[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '24px 0', color: 'var(--txt-3)' }}>
        <BarChart3 size={28} style={{ opacity: 0.25 }} />
        <span style={{ fontSize: 12 }}>No APIs registered yet</span>
      </div>
    )
  }

  const maxReq = Math.max(...rows.map(m => m.requestsLast24h), 1)
  const ENV_COLOR: Record<string, string> = { sandbox: '#7c3aed', prod: '#0891b2', dev: '#059669' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
      {rows.map((m, i) => {
        const color       = API_COLORS[i % API_COLORS.length]
        const barPct      = (m.requestsLast24h / maxReq) * 100
        const hasErrors   = m.errorCount > 0
        const hasLimits   = m.rateLimitTriggers > 0
        const statusColor = hasErrors ? '#ef4444' : '#10b981'

        // Error rate %
        const errRate = m.requestsLast24h > 0 ? (m.errorCount / m.requestsLast24h) * 100 : 0

        // Traffic trend: compare last-hour rate vs 24h average rate
        const avgHourlyRate = m.requestsLast24h / 24
        const trending = m.requestsLastHour > avgHourlyRate * 1.2 ? 'up'
          : m.requestsLastHour < avgHourlyRate * 0.8 && m.requestsLast24h > 0 ? 'down'
          : 'flat'

        return (
          <div key={m.proxyApiId} style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 12px 10px 14px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* colored left rule */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color, opacity: 0.9, borderRadius: '10px 0 0 10px' }} />

            {/* name + environment badge + request count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, boxShadow: `0 0 5px ${statusColor}80`, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.apiName}</span>
              {m.environment && (
                <span style={{
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                  color: ENV_COLOR[m.environment.toLowerCase()] ?? 'var(--txt-3)',
                  background: `${ENV_COLOR[m.environment.toLowerCase()] ?? 'var(--txt-3)'}18`,
                  border: `1px solid ${ENV_COLOR[m.environment.toLowerCase()] ?? 'var(--border)'}40`,
                  borderRadius: 4, padding: '1px 5px',
                }}>
                  {m.environment}
                </span>
              )}
              {/* trend arrow */}
              {trending !== 'flat' && (
                <span
                  title={trending === 'up'
                    ? `Traffic rising — ${fmtNum(m.requestsLastHour)} req this hour vs ${(avgHourlyRate).toFixed(1)} req/h 24h average`
                    : `Traffic falling — ${fmtNum(m.requestsLastHour)} req this hour vs ${(avgHourlyRate).toFixed(1)} req/h 24h average`}
                  style={{ fontSize: 11, fontWeight: 700, color: trending === 'up' ? '#10b981' : '#f59e0b', lineHeight: 1, cursor: 'help' }}
                >
                  {trending === 'up' ? '↑' : '↓'}
                </span>
              )}
              <span
                title={`${m.requestsLast24h.toLocaleString()} total requests in the last 24 hours · ${fmtNum(m.requestsLastHour)} in the last hour`}
                style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'monospace', letterSpacing: '-0.5px', cursor: 'help' }}
              >{fmtNum(m.requestsLast24h)}</span>
              <span style={{ fontSize: 9, color: 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>req</span>
            </div>

            {/* traffic bar */}
            <div style={{ height: 4, borderRadius: 2, background: 'var(--divider)', overflow: 'hidden', marginBottom: 7 }}>
              <div style={{
                height: '100%',
                width: `${barPct}%`,
                minWidth: m.requestsLast24h > 0 ? 4 : 0,
                background: `linear-gradient(90deg, ${color}, ${color}99)`,
                borderRadius: 2,
                transition: 'width 0.8s var(--ease-snappy)',
                boxShadow: `0 0 6px ${color}50`,
              }} />
            </div>

            {/* inline stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span title="Average upstream response time over the last 24 hours" style={{ fontSize: 10, color: 'var(--txt-3)', cursor: 'help' }}>
                Avg{' '}<span style={{ color: 'var(--txt-2)', fontWeight: 600, fontFamily: 'monospace' }}>{fmtMs(m.avgResponseTimeMs)}</span>
              </span>
              <span title={`${m.errorCount} failed requests (4xx / 5xx) in the last 24 hours`} style={{ fontSize: 10, color: 'var(--txt-3)', cursor: 'help' }}>
                Errors{' '}<span style={{ color: hasErrors ? '#ef4444' : 'var(--txt-3)', fontWeight: hasErrors ? 700 : 400, fontFamily: 'monospace' }}>{hasErrors ? m.errorCount : '—'}</span>
              </span>
              {m.requestsLast24h > 0 && (
                <span title={`Error rate — ${errRate.toFixed(2)}% of requests returned an error in the last 24 hours`} style={{ fontSize: 10, color: 'var(--txt-3)', cursor: 'help' }}>
                  Err%{' '}<span style={{ color: errRate > 5 ? '#ef4444' : errRate > 1 ? '#f59e0b' : 'var(--txt-3)', fontWeight: errRate > 1 ? 700 : 400, fontFamily: 'monospace' }}>
                    {errRate > 0 ? `${errRate.toFixed(1)}%` : '—'}
                  </span>
                </span>
              )}
              <span title={`${m.rateLimitTriggers} requests blocked by rate limiting in the last 24 hours`} style={{ fontSize: 10, color: 'var(--txt-3)', cursor: 'help' }}>
                Limits{' '}<span style={{ color: hasLimits ? '#f59e0b' : 'var(--txt-3)', fontWeight: hasLimits ? 700 : 400, fontFamily: 'monospace' }}>{hasLimits ? m.rateLimitTriggers : '—'}</span>
              </span>
              {m.requestsLastHour > 0 && (
                <span title={`${m.requestsLastHour} requests in the last hour`} style={{ marginLeft: 'auto', fontSize: 9, color: '#10b981', fontWeight: 700, background: '#10b98115', border: '1px solid #10b98130', borderRadius: 4, padding: '1px 6px', cursor: 'help' }}>
                  {fmtNum(m.requestsLastHour)}/h
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, can } = useAuth()
  const { isDark }    = useTheme()
  const navigate      = useNavigate()
  const [time, setTime] = useState(() => new Date())
  const offsetRef = useRef(0)

  // Sync offset from server on mount and every 5 minutes
  useEffect(() => {
    const sync = async () => {
      const before = Date.now()
      const serverNow = await getServerTime()
      const after = Date.now()
      // Correct for ~half the round-trip latency
      const rtt = after - before
      offsetRef.current = serverNow.getTime() + rtt / 2 - after
    }
    sync()
    const syncId = setInterval(sync, 5 * 60 * 1000)
    const tickId = setInterval(() => setTime(new Date(Date.now() + offsetRef.current)), 1000)
    return () => { clearInterval(syncId); clearInterval(tickId) }
  }, [])

  const accessible = ACTIVE_MODULES.filter(m => m.permission === null || can(m.permission))
  const locked     = ACTIVE_MODULES.length - accessible.length
  const pct        = (accessible.length / ACTIVE_MODULES.length) * 100

  const hour        = new Date().getHours()
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName   = (user?.fullName ?? user?.username ?? user?.email ?? '').split(' ')[0]
  const rawRole     = ((user?.roles ?? [])[0] ?? '').replace('ROLE_', '').toLowerCase()
  const roleDisplay = rawRole ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1) : ''
  const accent      = isDark ? '#818cf8' : '#324dff'
  const clock       = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: proxyPage } = useQuery({
    queryKey: ['dash-proxy'], staleTime: 30_000,
    queryFn:  () => listApis({ page: 0, size: 1 }),
    select:   r  => r.data,
  })
  const proxyTotal = proxyPage?.totalElements ?? 0

  const { data: healthSummary } = useQuery({
    queryKey: ['dash-health'], staleTime: 30_000,
    queryFn:  getHealthSummary,
    select:   r => r.data,
  })

  const { data: metricsData } = useQuery({
    queryKey: ['dash-metrics'], staleTime: 30_000,
    queryFn:  () => getDashboardMetrics(),
    select:   r => r.data,
  })
  const totalRequests    = metricsData?.reduce((s, m) => s + m.requestsLast24h, 0) ?? 0
  const totalReqLastHour = metricsData?.reduce((s, m) => s + m.requestsLastHour, 0) ?? 0
  const totalErrors      = metricsData?.reduce((s, m) => s + m.errorCount, 0) ?? 0
  const totalRateLimits  = metricsData?.reduce((s, m) => s + m.rateLimitTriggers, 0) ?? 0
  const avgMs = (() => {
    const valid = (metricsData ?? []).filter(m => m.avgResponseTimeMs !== null)
    if (!valid.length) return 0
    return Math.round(valid.reduce((s, m) => s + (m.avgResponseTimeMs ?? 0), 0) / valid.length)
  })()
  const metricsTop5 = [...(metricsData ?? [])].sort((a, b) => b.requestsLast24h - a.requestsLast24h).slice(0, 5)

  const { data: partnersPage } = useQuery({
    queryKey: ['dash-partners'], staleTime: 30_000,
    queryFn:  () => listPartners({ page: 0, size: 1 }),
    select:   r  => r.data,
  })
  const partnerCount = partnersPage?.totalElements ?? 0

  const { data: usersPage } = useQuery({
    queryKey: ['dash-users'], staleTime: 30_000,
    queryFn:  () => listUsers({ page: 0, size: 1 }),
    select:   r  => r.data,
  })
  const userCount = usersPage?.totalElements ?? 0

  const { data: approvalsPage } = useQuery({
    queryKey: ['dash-approvals'], staleTime: 30_000,
    queryFn:  () => listPending({ page: 0, size: 4 }),
    select:   r  => r.data,
  })
  const pendingCount = approvalsPage?.totalElements ?? 0
  const pendingItems = approvalsPage?.content ?? []

  const { data: auditPage } = useQuery({
    queryKey: ['dash-audit'], staleTime: 30_000,
    queryFn:  () => listAuditLogs({ page: 0, size: 5, sort: 'createdAt,desc' }),
    select:   r  => r.data,
  })
  const auditItems = auditPage?.content ?? []

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

      {/* ── Compact hero ──────────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 'var(--r-xl)', border: '1px solid var(--border)',
        background: isDark
          ? 'linear-gradient(135deg, #0d1528 0%, #111e3c 50%, #0a1020 100%)'
          : 'linear-gradient(135deg, #eef1ff 0%, #e8edff 50%, #f0f4ff 100%)',
        padding: '18px 24px', marginBottom: 12,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Aurora */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', borderRadius: 'inherit' }}>
          <div style={{ position: 'absolute', right: -60, top: -60, width: 300, height: 300, borderRadius: '50%', background: isDark ? 'radial-gradient(circle, rgba(50,77,255,0.22) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(50,77,255,0.14) 0%, transparent 70%)' }} />
          <div style={{ position: 'absolute', left: -40, bottom: -40, width: 240, height: 240, borderRadius: '50%', background: isDark ? 'radial-gradient(circle, rgba(16,185,129,0.13) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(16,185,129,0.09) 0%, transparent 70%)' }} />
          <div style={{ position: 'absolute', right: '40%', top: '10%', width: 180, height: 180, borderRadius: '50%', background: isDark ? 'radial-gradient(circle, rgba(139,92,246,0.11) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)' }} />
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {/* Left: identity */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>{greeting}</span>
              <span style={{ fontSize: 10, color: 'var(--txt-3)', fontFamily: 'monospace', letterSpacing: '0.5px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 7px' }}>{clock}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--txt-1)', letterSpacing: '-0.5px', lineHeight: 1 }}>{firstName}</h1>
              {roleDisplay && <span style={{ fontSize: 10, fontWeight: 700, color: accent, background: isDark ? 'rgba(50,77,255,0.15)' : 'rgba(50,77,255,0.1)', border: `1px solid ${accent}30`, borderRadius: 5, padding: '2px 8px' }}>{roleDisplay}</span>}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--txt-3)' }}>Ten Ten API Gateway (TAG) · API Gateway, Platform Monitoring &amp; Partner Management</p>
          </div>

          {/* Right: stats + ring */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
              <StatItem label="Accessible" value={accessible.length} color={accent}        />
              <StatItem label="Restricted"  value={locked}            color="#ef4444"       />
              <StatItem label="Total"        value={ACTIVE_MODULES.length} color="var(--txt-2)" />
              <StatItem label="Modules"      value={accessible.length} color="#10b981" last />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <RingProgress pct={pct} color={accent} trackColor={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'} />
              <span style={{ fontSize: 9, color: 'var(--txt-3)', letterSpacing: '0.3px' }}>Module access</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI grid: 4 × 2 ───────────────────────────────────────────────── */}
      <div className="stagger dash-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <KpiCard icon={<Zap size={15} />}         value={proxyTotal}      label="Registered APIs"    color="#324dff"  onClick={() => navigate('/proxy')}      />
        <KpiCard icon={<BarChart3 size={15} />}    value={totalRequests}   label="Requests / 24h"     color="#10b981"  onClick={() => navigate('/proxy')}      />
        <KpiCard icon={<Activity size={15} />}     value={totalReqLastHour} label="Requests / 1h"    color="#06b6d4"  onClick={() => navigate('/proxy')}      />
        <KpiCard icon={<TrendingUp size={15} />}   value={avgMs}           label="Avg Response"       color="#f59e0b"  suffix="ms"                            />
        <KpiCard icon={<AlertCircle size={15} />}  value={totalErrors}     label="Errors / 24h"       color="#ef4444"  alert                                  />
        <KpiCard icon={<Gauge size={15} />}        value={totalRateLimits} label="Rate Limit Hits"    color="#8b5cf6"                                         />
        <KpiCard icon={<Users size={15} />}        value={partnerCount}    label="Partners"           color="#8b5cf6"  onClick={() => navigate('/partners')}  />
        <KpiCard icon={<UserCog size={15} />}      value={userCount}       label="Platform Users"     color="#06b6d4"  onClick={() => navigate('/users')}     />
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="dash-body" style={{ display: 'grid', gridTemplateColumns: '1fr clamp(260px, 26vw, 400px)', gap: 14, marginBottom: 14, flex: 1 }}>

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          <div>
            <SectionHeader icon={<Layers size={11} />} label="Quick Access" color={accent}
              right={`${accessible.length} of ${ACTIVE_MODULES.length} accessible`}
            />
            <div className="stagger mod-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {ACTIVE_MODULES.map(mod => {
                const allowed = mod.permission === null || can(mod.permission)
                return <ModuleAccessCard key={mod.key} mod={mod} allowed={allowed} onClick={() => allowed && navigate(mod.path)} />
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0 }}>

            {/* API Traffic — 75% */}
            <div style={{ flex: 3, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <SectionHeader icon={<Activity size={11} />} label="API Traffic" color="#10b981" right="Last 24 hours" />
              <MetricsTable rows={metricsTop5} />
              <button onClick={() => navigate('/proxy')} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
                View all APIs <ChevronRight size={12} />
              </button>
            </div>

            {/* Approvals — 25% */}
            <div style={{ flex: 1, background: 'var(--surface)', border: `1px solid ${pendingCount > 0 ? '#f59e0b30' : 'var(--border)'}`, borderRadius: 'var(--r-lg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', minWidth: 160 }}>
              <SectionHeader
                icon={<ClipboardCheck size={11} />}
                label="Approvals"
                color="#f59e0b"
                right={pendingCount > 0 ? <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11 }}>{pendingCount}</span> : undefined}
              />
              {pendingItems.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <CheckCircle2 size={20} color="#10b981" style={{ opacity: 0.7 }} />
                  <span style={{ fontSize: 11, color: 'var(--txt-3)', textAlign: 'center' }}>No pending approvals</span>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
                  {pendingItems.map((item: Approval) => (
                    <div key={item.id} style={{ padding: '6px 8px', background: '#f59e0b08', border: '1px solid #f59e0b20', borderRadius: 7 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>
                        {item.actionType.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--txt-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.requestedBy}</div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => navigate('/approvals')} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, fontWeight: 600, padding: 0, fontFamily: 'inherit', flexShrink: 0 }}>
                View all <ChevronRight size={12} />
              </button>
            </div>

          </div>
        </div>

        {/* Right: feeds */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          <ApiHealthPanel summary={healthSummary} accent={accent} navigate={navigate} />

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 16px', flex: 1 }}>
            <SectionHeader icon={<ScrollText size={11} />} label="Audit Log" color="#10b981"
              right={<span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b98180' }} />Live</span>}
            />
            {auditItems.length === 0
              ? <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--txt-3)', fontSize: 12 }}>No recent events</div>
              : auditItems.map((e, i) => <AuditFeedItem key={e.id} entry={e} last={i === auditItems.length - 1} />)
            }
            <button onClick={() => navigate('/audit')} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
              View audit trail <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Health strip ──────────────────────────────────────────────────── */}
      {healthSummary && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--txt-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>API Health</span>
          <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
          {([
            { label: `${healthSummary.upCount} Up`,              color: '#10b981' },
            { label: `${healthSummary.degradedCount} Degraded`,  color: '#f59e0b' },
            { label: `${healthSummary.downCount} Down`,          color: '#ef4444' },
            { label: `${healthSummary.unknownCount} Unknown`,    color: 'var(--txt-3)' },
          ] as const).map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: color !== 'var(--txt-3)' ? `0 0 5px ${color}80` : 'none' }} />
              <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
            </div>
          ))}
          <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>{healthSummary.totalApis} APIs monitored</span>
        </div>
      )}

      <style>{`
        @media (min-width: 1500px) { .dash-kpi  { grid-template-columns: repeat(8,1fr) !important; } }
        @media (max-width: 1300px) { .dash-body { grid-template-columns: 1fr !important; } }
        @media (max-width: 1100px) { .dash-kpi  { grid-template-columns: repeat(4,1fr) !important; } .mod-grid { grid-template-columns: repeat(2,1fr) !important; } }
        @media (max-width: 800px)  { .dash-kpi  { grid-template-columns: repeat(2,1fr) !important; } }
        @media (max-width: 480px)  { .dash-kpi  { grid-template-columns: repeat(1,1fr) !important; } .mod-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}
