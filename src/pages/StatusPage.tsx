import { CheckCircle2, AlertTriangle, XCircle, AlertCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getPlatformStatus, getActiveIncidents } from '../api/status'
import type { ActiveIncident } from '../api/status'
import { Tag, Alert, Spin } from '../components/ui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

type StatusLevel = 'operational' | 'degraded' | 'partial_outage' | 'major_outage'

const STATUS_META: Record<StatusLevel, {
  color: string
  icon: React.ReactNode
  label: string
  alertType: 'success' | 'info' | 'warning' | 'error'
  dotColor: string
}> = {
  operational:    { color: 'var(--green)',  icon: <CheckCircle2 size={20} />, label: 'All Systems Operational', alertType: 'success', dotColor: 'var(--green)' },
  degraded:       { color: 'var(--orange)', icon: <AlertCircle size={20} />,  label: 'Degraded Performance',    alertType: 'warning', dotColor: 'var(--orange)' },
  partial_outage: { color: 'var(--orange)', icon: <AlertTriangle size={20} />, label: 'Partial Outage',          alertType: 'warning', dotColor: 'var(--orange)' },
  major_outage:   { color: 'var(--red)',    icon: <XCircle size={20} />,      label: 'Major Outage',            alertType: 'error',   dotColor: 'var(--red)' },
}

const SEVERITY_TAG_COLOR: Record<string, 'red' | 'orange' | 'blue' | 'muted'> = {
  CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'muted',
}

const COMPONENTS = [
  { name: 'API Gateway',           description: 'Proxy routing and load balancing' },
  { name: 'Authentication Service', description: 'Login, 2FA, token management' },
  { name: 'SMS Gateway',           description: 'Outbound SMS delivery' },
  { name: 'Webhook Delivery',      description: 'Partner webhook notifications' },
  { name: 'Reporting Engine',      description: 'Scheduled reports and exports' },
  { name: 'Monitoring System',     description: 'Alert rules and metric ingestion' },
]

export default function StatusPage() {
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['platform-status'],
    queryFn: () => getPlatformStatus(),
    select: (res) => res.data,
    refetchInterval: 60_000,
  })

  const { data: incidents, isLoading: incidentsLoading } = useQuery({
    queryKey: ['active-incidents'],
    queryFn: () => getActiveIncidents(),
    select: (res) => res.data,
    refetchInterval: 60_000,
  })

  const level = (status?.status ?? 'operational') as StatusLevel
  const meta = STATUS_META[level] ?? STATUS_META.operational

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>Platform Status</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>
          Real-time health and incident visibility for partners
        </p>
      </div>

      {/* Overall Status Banner */}
      {statusLoading ? (
        <div style={{ marginBottom: 24 }}>
          <Spin tip="Loading status..." />
        </div>
      ) : (
        <Alert
          type={meta.alertType}
          title={meta.label}
          description={[
            status?.message,
            status?.updatedAt ? `Last updated ${dayjs(status.updatedAt).fromNow()}` : '',
          ].filter(Boolean).join(' · ')}
        />
      )}

      {/* Active Incidents */}
      {incidentsLoading ? (
        <div style={{ margin: '16px 0' }}>
          <Spin tip="Loading incidents..." />
        </div>
      ) : (incidents ?? []).length > 0 ? (
        <div
          className="card"
          style={{
            marginBottom: 24,
            borderColor: 'var(--orange)',
          }}
        >
          {/* Card header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 14, paddingBottom: 10,
            borderBottom: '1px solid var(--divider)',
          }}>
            <AlertTriangle size={15} style={{ color: 'var(--orange)' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--txt-1)' }}>Active Incidents</span>
            <span style={{
              background: 'var(--orange)', color: '#fff', borderRadius: 10,
              fontSize: 10, fontWeight: 700, padding: '0 6px', lineHeight: 1.7,
            }}>
              {(incidents ?? []).length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {(incidents ?? []).map((item: ActiveIncident, i: number) => (
              <div
                key={item.id ?? i}
                style={{
                  padding: '12px 0',
                  borderBottom: i < (incidents ?? []).length - 1 ? '1px solid var(--divider)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <Tag color={SEVERITY_TAG_COLOR[item.severity] ?? 'orange'}>{item.severity}</Tag>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--txt-1)' }}>{item.title}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, padding: '1px 8px', borderRadius: 10,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    color: 'var(--txt-2)',
                  }}>
                    {item.status}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>
                    Started {dayjs(item.startedAt).fromNow()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Component Status Grid */}
      <div className="card">
        <div style={{
          fontWeight: 600, fontSize: 14, color: 'var(--txt-1)',
          marginBottom: 12, paddingBottom: 10,
          borderBottom: '1px solid var(--divider)',
        }}>
          Component Status
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {COMPONENTS.map((comp, i) => (
            <div
              key={comp.name}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: i < COMPONENTS.length - 1 ? '1px solid var(--divider)' : 'none',
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--txt-1)' }}>{comp.name}</div>
                <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 1 }}>{comp.description}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: meta.dotColor,
                  display: 'inline-block',
                  boxShadow: level === 'operational' ? `0 0 0 3px color-mix(in srgb, ${meta.dotColor} 20%, transparent)` : undefined,
                }} />
                <span style={{ fontSize: 12, color: meta.color, fontWeight: 600 }}>
                  {level === 'operational' ? 'Operational' : meta.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>
          Status refreshes automatically every 60 seconds
        </span>
      </div>
    </div>
  )
}
