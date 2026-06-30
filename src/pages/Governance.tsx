import { useState, useEffect } from 'react'
import { copyToClipboard } from '../utils/clipboard'
import {
  BarChart2, Shield, EyeOff, Settings2, Plus, Trash2,
  RotateCcw, Copy, Key, Activity, AlertTriangle,
  Zap, Clock, TrendingUp, CheckCircle2,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDashboardMetrics, getBlacklist, addBlacklist, removeBlacklist,
  getRateLimit, updateRateLimit, getCors, updateCors,
  listAccessTokens, createAccessToken, revokeAccessToken, rotateAccessToken, deleteAccessToken,
  listScrapingBlocklist, addToScrapingBlocklist, removeFromScrapingBlocklist, toggleScrapingBlocklistEntry,
} from '../api/governance'
import type { ApiMetrics, BlacklistEntry, AccessToken, UaBlocklistEntry, RateLimitScope, ThrottleStrategy, RateEnforcer } from '../api/governance'
import { getApi } from '../api/proxy'
import { getPlatformConfig } from '../api/platform'
import {
  Btn, Inp, Switch, Spin, Tbl, Tabs, Modal, Drawer, Confirm, toast,
} from '../components/ui'
import type { Column, TabItem } from '../components/ui'
import dayjs from 'dayjs'

// ── Small stat card ─────────────────────────────────────────────────────────

function StatCard({
  label, value, subtext, accent, icon, borderColor,
}: {
  label: string
  value: string | number
  subtext?: string
  accent?: string
  icon?: React.ReactNode
  borderColor?: string
}) {
  const color = borderColor ?? 'var(--accent)'
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '18px 20px 16px',
      display: 'flex', flexDirection: 'column', gap: 12,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -24, right: -24, width: 90, height: 90,
        borderRadius: '50%',
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--txt-3)' }}>
          {label}
        </span>
        {icon && (
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color, flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: accent ?? 'var(--txt-1)', lineHeight: 1, letterSpacing: '-1px' }}>
        {value}
      </div>
      {subtext && <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: -4 }}>{subtext}</div>}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${color} 0%, transparent 100%)`,
        opacity: 0.55,
      }} />
    </div>
  )
}


// ── Token status badge ──────────────────────────────────────────────────────

function TokenStatus({ status }: { status: string }) {
  const active = status === 'ACTIVE'
  return (
    <span style={{
      display: 'inline-block',
      background: active ? 'var(--green-dim)' : 'var(--red-dim)',
      color: active ? 'var(--green)' : 'var(--red)',
      border: `1px solid ${active ? 'var(--green)' : 'var(--red)'}`,
      borderRadius: 'var(--r-sm)',
      padding: '2px 8px', fontSize: 10, fontWeight: 800,
      textTransform: 'uppercase', opacity: 0.9,
    }}>
      {status}
    </span>
  )
}

// ── Form field row ──────────────────────────────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-2)' }}>
        {label}
        {hint && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--txt-3)', fontWeight: 400 }}>— {hint}</span>}
      </label>
      {children}
    </div>
  )
}

// ── Tag input (comma-separated values displayed as pills) ───────────────────

function TagInput({ value, onChange, placeholder }: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [input, setInput] = useState('')

  function commit(raw: string) {
    const trimmed = raw.trim().replace(/,$/, '')
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
    setInput('')
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
      padding: '6px 10px', background: 'var(--surface-2)',
      minHeight: 38,
    }}>
      {value.map(v => (
        <span
          key={v}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', padding: '1px 8px',
            fontSize: 12, color: 'var(--txt-1)',
          }}
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(value.filter(x => x !== v))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', padding: 0, lineHeight: 1, fontSize: 12 }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(input) }
          if (e.key === 'Backspace' && !input && value.length > 0) onChange(value.slice(0, -1))
        }}
        onBlur={() => input.trim() && commit(input)}
        placeholder={value.length === 0 ? placeholder : ''}
        style={{
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: 12, color: 'var(--txt-1)', flex: 1, minWidth: 80,
        }}
      />
    </div>
  )
}

// ── Rate limit form state ───────────────────────────────────────────────────

interface RateLimitForm {
  requestLimit: string
  windowSeconds: string
  scope: RateLimitScope
  throttleStrategy: ThrottleStrategy
  burstAllowance: string
  enabled: boolean
  enforcer: RateEnforcer
}

// ── CORS form state ─────────────────────────────────────────────────────────

interface CorsForm {
  allowedOrigins: string[]
  allowedMethods: string[]
  allowedHeaders: string[]
  allowCredentials: boolean
  maxAgeSeconds: string
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']

// ── Create token form state ─────────────────────────────────────────────────

interface TokenForm {
  name: string
  description: string
  expiresAt: string
}

// ── Per-API right pane sub-content ──────────────────────────────────────────

function RateLimitPane({
  selectedApiId,
  qc,
}: { selectedApiId: string; qc: ReturnType<typeof useQueryClient> }) {
  const { data, isLoading } = useQuery({
    queryKey: ['rate-limit', selectedApiId],
    queryFn: () => getRateLimit(selectedApiId),
    enabled: !!selectedApiId,
    select: (res) => res?.data,
  })

  const [form, setForm] = useState<RateLimitForm>({
    requestLimit: '', windowSeconds: '', scope: 'GLOBAL',
    throttleStrategy: 'REJECT', burstAllowance: '', enabled: true, enforcer: 'TAG',
  })
  const [initialised, setInitialised] = useState(false)

  // Sync from API once
  if (data && !initialised) {
    setInitialised(true)
    setForm({
      requestLimit: String(data.requestLimit ?? ''),
      windowSeconds: String(data.windowSeconds ?? ''),
      scope: data.scope ?? 'GLOBAL',
      throttleStrategy: data.throttleStrategy ?? 'REJECT',
      burstAllowance: String(data.burstAllowance ?? ''),
      enabled: data.enabled ?? true,
      enforcer: data.enforcer ?? 'TAG',
    })
  }

  const mutation = useMutation({
    mutationFn: (d: Parameters<typeof updateRateLimit>[1]) => updateRateLimit(selectedApiId, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rate-limit', selectedApiId] }); toast.success('Rate limit updated') },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Failed to update rate limit'
      // 409 = Kong enforcer requested but Kong not synced — show as actionable warning
      if (err?.response?.status === 409) toast.warning(msg)
      else toast.error(msg)
    },
  })

  function handleSave() {
    mutation.mutate({
      requestLimit: Number(form.requestLimit),
      windowSeconds: Number(form.windowSeconds),
      scope: form.scope,
      throttleStrategy: form.throttleStrategy,
      burstAllowance: form.burstAllowance ? Number(form.burstAllowance) : undefined,
      enabled: form.enabled,
      enforcer: form.enforcer,
    })
  }

  if (isLoading) return <div style={{ padding: 24 }}><Spin tip="Loading…" /></div>

  const hasConfig = !!data
  const isKongEnforced = data?.enforcer === 'KONG'
  const kongMultiplier = isKongEnforced ? 1 : 5
  const kongMinute = (hasConfig && data.enabled && data.requestLimit && data.windowSeconds)
    ? Math.ceil((data.requestLimit + (data.burstAllowance ?? 0)) * kongMultiplier * 60 / data.windowSeconds)
    : null

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
      {/* Summary strip */}
      {hasConfig && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap',
        }}>
          {[
            { label: 'Limit', value: data.enabled ? `${data.requestLimit} req / ${data.windowSeconds}s` : '—' },
            { label: 'Burst', value: data.burstAllowance ? `+${data.burstAllowance}` : '0' },
            { label: 'Scope', value: (data.scope ?? '—').replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) },
            { label: 'Kong Cap', value: kongMinute != null ? `${kongMinute} req/min` : 'disabled' },
            { label: 'Enforcer', value: data.enforcer ?? 'TAG' },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)', padding: '6px 12px', fontSize: 12,
              display: 'flex', flexDirection: 'column', gap: 1,
            }}>
              <span style={{ fontSize: 10, color: 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
              <span style={{ fontWeight: 700, color: data.enabled ? 'var(--txt-1)' : 'var(--txt-3)', fontSize: 13 }}>{value}</span>
            </div>
          ))}
          <div style={{
            background: data.enabled ? 'var(--green-dim)' : 'var(--surface-2)',
            border: `1px solid ${data.enabled ? 'var(--green)' : 'var(--border)'}`,
            borderRadius: 'var(--r-sm)', padding: '6px 14px', fontSize: 11,
            color: data.enabled ? 'var(--green)' : 'var(--txt-3)', fontWeight: 800,
            letterSpacing: '0.5px', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center',
          }}>
            {data.enabled ? '● Enabled' : '○ Disabled'}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 560 }}>
        <FieldRow label="Request Limit" hint="max requests in window">
          <input
            type="number" min={1} className="pus-input" placeholder="e.g. 100"
            value={form.requestLimit}
            onChange={e => setForm(f => ({ ...f, requestLimit: e.target.value }))}
          />
        </FieldRow>
        <FieldRow label="Window (seconds)" hint="duration of the window">
          <input
            type="number" min={1} className="pus-input" placeholder="e.g. 60"
            value={form.windowSeconds}
            onChange={e => setForm(f => ({ ...f, windowSeconds: e.target.value }))}
          />
        </FieldRow>
        <FieldRow label="Scope" hint="global / per-IP / per-token">
          <select
            className="pus-select"
            value={form.scope}
            onChange={e => setForm(f => ({ ...f, scope: e.target.value as RateLimitScope }))}
          >
            <option value="GLOBAL">Global</option>
            <option value="PER_IP">Per IP</option>
            <option value="PER_TOKEN">Per Token</option>
          </select>
        </FieldRow>
        <FieldRow label="Throttle Strategy" hint="reject returns 429; queue holds">
          <select
            className="pus-select"
            value={form.throttleStrategy}
            onChange={e => setForm(f => ({ ...f, throttleStrategy: e.target.value as ThrottleStrategy }))}
          >
            <option value="REJECT">Reject (429)</option>
            <option value="QUEUE">Queue</option>
          </select>
        </FieldRow>
        <FieldRow label="Burst Allowance" hint="extra requests above limit">
          <input
            type="number" min={0} className="pus-input" placeholder="e.g. 20"
            value={form.burstAllowance}
            onChange={e => setForm(f => ({ ...f, burstAllowance: e.target.value }))}
          />
        </FieldRow>
        <FieldRow label="Enabled">
          <div style={{ paddingTop: 6 }}>
            <Switch
              checked={form.enabled}
              onChange={v => setForm(f => ({ ...f, enabled: v }))}
            />
          </div>
        </FieldRow>
        <FieldRow label="Enforcer" hint="who enforces the limit">
          <select
            className="pus-select"
            value={form.enforcer}
            onChange={e => setForm(f => ({ ...f, enforcer: e.target.value as RateEnforcer }))}
          >
            <option value="TAG">TAG (app layer)</option>
            <option value="KONG">Kong (entry point)</option>
          </select>
        </FieldRow>
      </div>
      {/* Enforcer explanation */}
      <div style={{ margin: '10px 0 4px', padding: '8px 12px', borderRadius: 6, fontSize: 11, lineHeight: 1.6, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--txt-3)', maxWidth: 540 }}>
        {form.enforcer === 'KONG'
          ? <><strong style={{ color: 'var(--txt-2)' }}>Kong enforcer:</strong> Kong rejects at the gateway before reaching TAG. 429s are tracked in Kong Manager only. Kong cap = configured limit (no multiplier). Use for auth endpoints or public-facing APIs.</>
          : <><strong style={{ color: 'var(--txt-2)' }}>TAG enforcer:</strong> TAG app layer enforces the limit and logs all 429s to the Governance dashboard. Kong acts as a safety net at 5× the configured limit. Use for proxy APIs.</>
        }
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
        <Btn variant="primary" size="sm" loading={mutation.isPending} onClick={handleSave}>
          Save Rate Limit
        </Btn>
      </div>
    </div>
  )
}

function BlacklistPane({
  selectedApiId,
  qc,
}: { selectedApiId: string; qc: ReturnType<typeof useQueryClient> }) {
  const [ipAddress, setIpAddress] = useState('')
  const [reason, setReason] = useState('')
  const [ipError, setIpError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['blacklist', selectedApiId],
    queryFn: () => getBlacklist(selectedApiId),
    enabled: !!selectedApiId,
    select: (res) => res?.data,
  })

  const addMutation = useMutation({
    mutationFn: (d: { ipAddress: string; reason?: string }) => addBlacklist(selectedApiId, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blacklist', selectedApiId] })
      setIpAddress(''); setReason('')
      toast.success('IP added to blacklist')
    },
    onError: () => toast.error('Failed to add IP'),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeBlacklist(selectedApiId, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blacklist', selectedApiId] }); toast.success('IP removed') },
    onError: () => toast.error('Failed to remove IP'),
  })

  function handleAdd() {
    if (!ipAddress.trim()) { setIpError('Required'); return }
    setIpError('')
    addMutation.mutate({ ipAddress: ipAddress.trim(), reason: reason.trim() || undefined })
  }

  const columns: Column<BlacklistEntry>[] = [
    {
      key: 'ip', title: 'IP / CIDR',
      render: (row) => (
        <code style={{
          fontFamily: 'monospace', fontSize: 12,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 5, padding: '3px 8px', color: 'var(--txt-1)',
          display: 'inline-block',
        }}>
          {row.ipAddress}
        </code>
      ),
    },
    {
      key: 'reason', title: 'Reason',
      render: (row) => <span style={{ color: 'var(--txt-2)', fontSize: 13 }}>{row.reason ?? '—'}</span>,
    },
    {
      key: 'actions', title: '', width: 60,
      render: (row) => (
        <Confirm
          title="Remove IP"
          description={`Remove ${row.ipAddress} from the blacklist?`}
          danger
          onConfirm={() => removeMutation.mutate(row.id)}
        >
          <Btn variant="danger" size="sm" iconOnly icon={<Trash2 size={13} />} />
        </Confirm>
      ),
    },
  ]

  const blockedCount = data?.length ?? 0

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: 12 }}>
      {/* Add form card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding: '12px 14px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <AlertTriangle size={12} color="var(--txt-3)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Block an IP or CIDR Range
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: '0 0 220px' }}>
            <Inp
              label="IP / CIDR"
              placeholder="e.g. 10.0.0.0/24"
              value={ipAddress}
              onChangeValue={v => { setIpAddress(v); setIpError('') }}
              error={ipError}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Inp
              label="Reason (optional)"
              placeholder="Why is this IP blocked?"
              value={reason}
              onChangeValue={setReason}
            />
          </div>
          <div style={{ paddingBottom: ipError ? 20 : 0 }}>
            <Btn
              variant="danger"
              size="sm"
              icon={<Plus size={13} />}
              loading={addMutation.isPending}
              onClick={handleAdd}
            >
              Block IP
            </Btn>
          </div>
        </div>
      </div>

      {/* Section header + table */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Blocked Entries
          </span>
          <span style={{
            background: blockedCount > 0 ? 'var(--red-dim)' : 'transparent',
            color: blockedCount > 0 ? 'var(--red)' : 'var(--txt-3)',
            border: `1px solid ${blockedCount > 0 ? 'var(--red)' : 'var(--border)'}`,
            borderRadius: 9, padding: '0px 6px', fontSize: 11, fontWeight: 700,
          }}>
            {blockedCount}
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Tbl
            columns={columns}
            data={data ?? []}
            rowKey="id"
            loading={isLoading}
            emptyText="No IPs blocked"
          />
        </div>
      </div>
    </div>
  )
}

function CorsPane({
  selectedApiId,
  qc,
}: { selectedApiId: string; qc: ReturnType<typeof useQueryClient> }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cors', selectedApiId],
    queryFn: () => getCors(selectedApiId),
    enabled: !!selectedApiId,
    select: (res) => res?.data,
  })

  const [form, setForm] = useState<CorsForm>({
    allowedOrigins: [], allowedMethods: [], allowedHeaders: [],
    allowCredentials: false, maxAgeSeconds: '',
  })
  const [initialised, setInitialised] = useState(false)

  if (data && !initialised) {
    setInitialised(true)
    setForm({
      allowedOrigins: data.allowedOrigins ?? [],
      allowedMethods: data.allowedMethods ?? [],
      allowedHeaders: data.allowedHeaders ?? [],
      allowCredentials: data.allowCredentials ?? false,
      maxAgeSeconds: String(data.maxAgeSeconds ?? ''),
    })
  }

  const mutation = useMutation({
    mutationFn: (d: Parameters<typeof updateCors>[1]) => updateCors(selectedApiId, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cors', selectedApiId] }); toast.success('CORS config updated') },
    onError: () => toast.error('Failed to update CORS'),
  })

  function handleSave() {
    mutation.mutate({
      allowedOrigins: form.allowedOrigins,
      allowedMethods: form.allowedMethods,
      allowedHeaders: form.allowedHeaders,
      allowCredentials: form.allowCredentials,
      maxAgeSeconds: form.maxAgeSeconds ? Number(form.maxAgeSeconds) : undefined,
    })
  }

  if (isLoading) return <div style={{ padding: 24 }}><Spin tip="Loading…" /></div>

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, maxWidth: 640 }}>
      <FieldRow label="Allowed Origins" hint="domains permitted for cross-origin requests; use * for all">
        <TagInput
          value={form.allowedOrigins}
          onChange={v => setForm(f => ({ ...f, allowedOrigins: v }))}
          placeholder="e.g. https://app.example.com — press Enter to add"
        />
      </FieldRow>
      <FieldRow label="Allowed Methods">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {HTTP_METHODS.map(m => {
            const on = form.allowedMethods.includes(m)
            return (
              <button
                key={m}
                type="button"
                onClick={() => setForm(f => ({
                  ...f,
                  allowedMethods: on ? f.allowedMethods.filter(x => x !== m) : [...f.allowedMethods, m],
                }))}
                style={{
                  padding: '4px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
                  background: on ? 'var(--accent)' : 'var(--surface-2)',
                  color: on ? '#fff' : 'var(--txt-2)',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  transition: 'all var(--dur-fast)',
                }}
              >
                {m}
              </button>
            )
          })}
        </div>
      </FieldRow>
      <FieldRow label="Allowed Headers" hint="request headers permitted in cross-origin requests">
        <TagInput
          value={form.allowedHeaders}
          onChange={v => setForm(f => ({ ...f, allowedHeaders: v }))}
          placeholder="e.g. Authorization — press Enter to add"
        />
      </FieldRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FieldRow label="Allow Credentials" hint="cookies & auth headers">
          <div style={{ paddingTop: 4 }}>
            <Switch
              checked={form.allowCredentials}
              onChange={v => setForm(f => ({ ...f, allowCredentials: v }))}
            />
          </div>
        </FieldRow>
        <FieldRow label="Max Age (s)" hint="preflight cache duration">
          <input
            type="number" min={0} className="pus-input" placeholder="e.g. 3600"
            value={form.maxAgeSeconds}
            onChange={e => setForm(f => ({ ...f, maxAgeSeconds: e.target.value }))}
          />
        </FieldRow>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
        <Btn variant="primary" size="sm" loading={mutation.isPending} onClick={handleSave}>
          Save CORS Config
        </Btn>
      </div>
    </div>
  )
}

const TOKEN_PAGE_SIZE = 6

function TokensPane({
  selectedApiId,
  qc,
}: { selectedApiId: string; qc: ReturnType<typeof useQueryClient> }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [tokenForm, setTokenForm] = useState<TokenForm>({ name: '', description: '', expiresAt: '' })
  const [tokenFormErrors, setTokenFormErrors] = useState<Partial<Record<keyof TokenForm, string>>>({})
  const [revealModal, setRevealModal] = useState<{ token: string; title: string; curlCommand: string } | null>(null)
  const [tokenPage, setTokenPage] = useState(0)

  const { data: apiDetail } = useQuery({
    queryKey: ['proxy-api', selectedApiId],
    queryFn: () => getApi(selectedApiId),
    enabled: !!selectedApiId,
    select: (res) => res?.data,
  })

  const { data: platformConfig } = useQuery({
    queryKey: ['platform-config'],
    queryFn: () => getPlatformConfig(),
    select: (res) => res.data,
    staleTime: 5 * 60_000,
  })

  function envDomain(env?: string): string {
    if (!platformConfig) return ''
    if (env === 'prod')    return platformConfig.prodDomain
    if (env === 'dev')     return platformConfig.devDomain
    return platformConfig.sandboxDomain
  }

  function buildCurl(token: string): string {
    const base = envDomain(apiDetail?.environment)
    const path = apiDetail?.publicPath ?? '/proxy/<path>'
    const method = (apiDetail?.httpMethod ?? 'GET').toUpperCase()
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(method)
    const bodyLines = hasBody
      ? `\\\n  -H "Content-Type: application/json" \\\n  -d '{}'`
      : ''
    return `curl -X ${method} ${base}${path} \\\n  -H "Authorization: Bearer ${token}" ${bodyLines}`.trimEnd()
  }

  const { data, isLoading } = useQuery({
    queryKey: ['access-tokens', selectedApiId],
    queryFn: () => listAccessTokens(selectedApiId, { size: 50 }),
    enabled: !!selectedApiId,
    select: (res) => res?.data,
  })

  const createMutation = useMutation({
    mutationFn: (d: { name: string; description?: string; expiresAt?: string }) =>
      createAccessToken(selectedApiId, d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['access-tokens', selectedApiId] })
      setCreateOpen(false)
      setTokenForm({ name: '', description: '', expiresAt: '' })
      setRevealModal({ token: res.data.token, title: 'Access Token Created', curlCommand: buildCurl(res.data.token) })
    },
    onError: () => toast.error('Failed to create token'),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeAccessToken(selectedApiId, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['access-tokens', selectedApiId] }); toast.success('Token revoked') },
    onError: () => toast.error('Failed to revoke token'),
  })

  const rotateMutation = useMutation({
    mutationFn: (id: string) => rotateAccessToken(selectedApiId, id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['access-tokens', selectedApiId] })
      setRevealModal({ token: res.data.token, title: 'Token Rotated — New Secret', curlCommand: buildCurl(res.data.token) })
    },
    onError: () => toast.error('Failed to rotate token'),
  })

  const deleteTokenMutation = useMutation({
    mutationFn: (id: string) => deleteAccessToken(selectedApiId, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['access-tokens', selectedApiId] }); toast.success('Token permanently deleted') },
    onError: () => toast.error('Failed to delete token'),
  })

  function validateTokenForm(): boolean {
    const e: typeof tokenFormErrors = {}
    if (!tokenForm.name.trim()) e.name = 'Required'
    setTokenFormErrors(e)
    return Object.keys(e).length === 0
  }

  function handleCreate() {
    if (validateTokenForm()) {
      createMutation.mutate({
        name: tokenForm.name.trim(),
        description: tokenForm.description.trim() || undefined,
        expiresAt: tokenForm.expiresAt ? tokenForm.expiresAt + 'T00:00:00' : undefined,
      })
    }
  }

  const columns: Column<AccessToken>[] = [
    {
      key: 'name', title: 'Name',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt-1)' }}>{row.name}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--txt-3)', marginTop: 2 }}>
            {row.tokenPrefix}…
          </div>
        </div>
      ),
    },
    {
      key: 'status', title: 'Status', width: 90,
      render: (row) => <TokenStatus status={row.status} />,
    },
    {
      key: 'expires', title: 'Expires', width: 120,
      render: (row) => row.expiresAt
        ? <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>{dayjs(row.expiresAt).format('MMM D, YYYY')}</span>
        : <span style={{ color: 'var(--txt-3)', fontSize: 12 }}>Never</span>,
    },
    {
      key: 'lastUsed', title: 'Last Used', width: 140,
      render: (row) => row.lastUsedAt
        ? <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>{dayjs(row.lastUsedAt).format('MMM D, YYYY HH:mm')}</span>
        : <span style={{ color: 'var(--txt-3)', fontSize: 12 }}>Never</span>,
    },
    {
      key: 'actions', title: '', width: 160,
      render: (row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Confirm
            title="Rotate Token"
            description="The new token will be shown once and cannot be retrieved later."
            onConfirm={() => rotateMutation.mutate(row.id)}
          >
            <Btn variant="ghost" size="sm" icon={<RotateCcw size={12} />} disabled={row.status === 'REVOKED'}>
              Rotate
            </Btn>
          </Confirm>
          {row.status === 'REVOKED' ? (
            <Confirm title="Permanently delete this token?" danger onConfirm={() => deleteTokenMutation.mutate(row.id)}>
              <Btn variant="danger" size="sm" icon={<Trash2 size={12} />} loading={deleteTokenMutation.isPending}>
                Delete
              </Btn>
            </Confirm>
          ) : (
            <Confirm title="Revoke Token" description="This action cannot be undone." danger onConfirm={() => revokeMutation.mutate(row.id)}>
              <Btn variant="danger" size="sm">Revoke</Btn>
            </Confirm>
          )}
        </div>
      ),
    },
  ]

  const activeCount = data?.content?.filter(t => t.status === 'ACTIVE').length ?? 0

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: 12 }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Access Tokens
            </span>
            <span style={{
              background: activeCount > 0 ? 'var(--green-dim)' : 'transparent',
              color: activeCount > 0 ? 'var(--green)' : 'var(--txt-3)',
              border: `1px solid ${activeCount > 0 ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: 9, padding: '0px 6px', fontSize: 11, fontWeight: 700,
            }}>
              {activeCount} active
            </span>
          </div>
          <Btn variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
            Create Token
          </Btn>
        </div>
        {(() => {
          const allTokens = data?.content ?? []
          const totalTokenPages = Math.ceil(allTokens.length / TOKEN_PAGE_SIZE)
          const pagedTokens = allTokens.slice(tokenPage * TOKEN_PAGE_SIZE, (tokenPage + 1) * TOKEN_PAGE_SIZE)
          return (
            <>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <Tbl columns={columns} data={pagedTokens} rowKey="id" loading={isLoading} emptyText="No access tokens" />
              </div>
              {totalTokenPages > 1 && (
                <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--txt-3)' }}>
                  <span>{allTokens.length} tokens · page {tokenPage + 1} of {totalTokenPages}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Btn size="sm" variant="ghost" disabled={tokenPage === 0} onClick={() => setTokenPage(p => p - 1)}>← Prev</Btn>
                    <Btn size="sm" variant="ghost" disabled={tokenPage >= totalTokenPages - 1} onClick={() => setTokenPage(p => p + 1)}>Next →</Btn>
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* Create token drawer */}
      <Drawer
        open={createOpen}
        onClose={() => { setCreateOpen(false); setTokenFormErrors({}) }}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Key size={15} />Create Access Token</span>}
        width={440}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Btn>
            <Btn variant="primary" loading={createMutation.isPending} onClick={handleCreate}>
              Create Token
            </Btn>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Inp
            label="Token Name"
            placeholder="e.g. Production API Key"
            value={tokenForm.name}
            onChangeValue={v => { setTokenForm(f => ({ ...f, name: v })); setTokenFormErrors(e => ({ ...e, name: undefined })) }}
            error={tokenFormErrors.name}
          />
          <Inp
            label="Description (optional)"
            placeholder="What is this token used for?"
            value={tokenForm.description}
            onChangeValue={v => setTokenForm(f => ({ ...f, description: v }))}
          />
          <Inp
            label="Expires At (optional)"
            type="date"
            value={tokenForm.expiresAt}
            onChangeValue={v => setTokenForm(f => ({ ...f, expiresAt: v }))}
          />
        </div>
      </Drawer>

      {/* Token reveal modal */}
      <Modal
        open={!!revealModal}
        onClose={() => setRevealModal(null)}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Key size={15} />{revealModal?.title}</span>}
        width={560}
        footer={
          <>
            <Btn
              variant="secondary"
              icon={<Copy size={14} />}
              onClick={() => {
                copyToClipboard(revealModal?.token ?? '')
                toast.success('Token copied')
              }}
            >
              Copy Token
            </Btn>
            <Btn
              variant="secondary"
              icon={<Copy size={14} />}
              onClick={() => {
                copyToClipboard(revealModal?.curlCommand ?? '')
                toast.success('cURL copied')
              }}
            >
              Copy cURL
            </Btn>
            <Btn variant="primary" onClick={() => setRevealModal(null)}>Done</Btn>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Token */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Token
            </div>
            <div style={{
              background: '#0d1530', padding: '10px 14px', borderRadius: 'var(--r-md)',
              fontFamily: 'monospace', wordBreak: 'break-all',
              fontSize: 13, color: '#a5b4fc', lineHeight: 1.6,
            }}>
              {revealModal?.token}
            </div>
          </div>

          {/* cURL */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Example cURL
            </div>
            <div style={{
              background: '#0d1530', padding: '10px 14px', borderRadius: 'var(--r-md)',
              fontFamily: 'monospace', whiteSpace: 'pre', fontSize: 12,
              color: '#86efac', lineHeight: 1.7, overflowX: 'auto',
            }}>
              {revealModal?.curlCommand}
            </div>
          </div>

          {/* Warning */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'var(--orange-dim)', borderRadius: 'var(--r-sm)', border: '1px solid var(--orange)' }}>
            <AlertTriangle size={14} color="var(--orange)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--txt-2)' }}>
              This token will only be shown once. Copy it now — it cannot be retrieved later.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Per-API right pane ───────────────────────────────────────────────────────

function PerApiRight({
  selectedApiId,
  selectedApiName,
  qc,
}: {
  selectedApiId: string
  selectedApiName: string
  qc: ReturnType<typeof useQueryClient>
}) {
  const [subTab, setSubTab] = useState('rate-limit')

  const { data: proxyApi } = useQuery({
    queryKey: ['proxy-api', selectedApiId],
    queryFn: () => getApi(selectedApiId),
    select: (res) => res.data,
    enabled: !!selectedApiId,
  })

  useEffect(() => {
    if (proxyApi?.builtIn && subTab === 'tokens') setSubTab('rate-limit')
  }, [proxyApi?.builtIn, subTab])

  if (!selectedApiId) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 10, color: 'var(--txt-3)',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
        }}>
          <Shield size={24} style={{ opacity: 0.3 }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt-2)' }}>Select an API</span>
        <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>to configure its governance policies</span>
      </div>
    )
  }

  const subItems: TabItem[] = [
    {
      key: 'rate-limit',
      label: 'Rate Limit',
      icon: <Activity size={13} />,
      children: <RateLimitPane selectedApiId={selectedApiId} qc={qc} />,
    },
    {
      key: 'blacklist',
      label: 'IP Blacklist',
      icon: <AlertTriangle size={13} />,
      children: <BlacklistPane selectedApiId={selectedApiId} qc={qc} />,
    },
    {
      key: 'cors',
      label: 'CORS',
      icon: <Shield size={13} />,
      children: <CorsPane selectedApiId={selectedApiId} qc={qc} />,
    },
    ...(!proxyApi?.builtIn ? [{
      key: 'tokens',
      label: 'Access Tokens',
      icon: <Key size={13} />,
      children: <TokensPane selectedApiId={selectedApiId} qc={qc} />,
    }] : []),
  ]

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* API name header */}
      <div style={{
        flexShrink: 0, padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={13} color="white" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt-1)', lineHeight: 1.2 }}>
            {selectedApiName || selectedApiId}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--txt-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedApiId}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          items={subItems}
          activeKey={subTab}
          onChange={setSubTab}
        />
      </div>
    </div>
  )
}

const METRICS_PAGE_SIZE = 10

type Env = 'sandbox' | 'dev' | 'prod'

// ── Main component ───────────────────────────────────────────────────────────

export default function Governance() {
  const [activeTab, setActiveTab] = useState('metrics')
  const [selectedEnv, setSelectedEnv] = useState<Env>('sandbox')
  const [metricsPage, setMetricsPage] = useState(0)
  const [selectedApiId, setSelectedApiId]   = useState('')
  const [selectedApiName, setSelectedApiName] = useState('')
  const [apiSearch, setApiSearch]           = useState('')
  const [manualMode, setManualMode]         = useState(false)
  const [manualApiId, setManualApiId]       = useState('')

  // UA blocklist form
  const [uaPattern, setUaPattern]   = useState('')
  const [uaReason, setUaReason]     = useState('')
  const [uaPatternError, setUaPatternError] = useState('')

  const qc = useQueryClient()

  useEffect(() => { setMetricsPage(0); setSelectedApiId(''); setSelectedApiName('') }, [selectedEnv])
  useEffect(() => { setMetricsPage(0) }, [apiSearch])

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['governance-dashboard', selectedEnv],
    queryFn: () => getDashboardMetrics({ environment: selectedEnv }),
    select: (res) => res.data,
    refetchInterval: 30_000,
  })

  const { data: uaBlocklist, isLoading: uaLoading } = useQuery({
    queryKey: ['ua-blocklist'],
    queryFn: () => listScrapingBlocklist(),
    select: (res) => res.data,
  })

  // ── UA mutations ───────────────────────────────────────────────────────────

  const addUaMutation = useMutation({
    mutationFn: (d: { pattern: string; reason?: string }) => addToScrapingBlocklist(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ua-blocklist'] })
      setUaPattern(''); setUaReason('')
      toast.success('Pattern added to blocklist')
    },
    onError: () => toast.error('Failed to add pattern'),
  })

  const removeUaMutation = useMutation({
    mutationFn: (id: string) => removeFromScrapingBlocklist(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ua-blocklist'] }); toast.success('Pattern removed') },
    onError: () => toast.error('Failed to remove pattern'),
  })

  const toggleUaMutation = useMutation({
    mutationFn: (id: string) => toggleScrapingBlocklistEntry(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['ua-blocklist'] })
      toast.success(res.data.enabled ? 'Pattern enabled' : 'Pattern disabled')
    },
    onError: () => toast.error('Failed to update pattern'),
  })

  // ── Derived metrics ────────────────────────────────────────────────────────

  const metrics = metricsData ?? []
  const filteredMetrics = apiSearch ? metrics.filter(m => m.apiName?.toLowerCase().includes(apiSearch.toLowerCase())) : metrics
  const metricsTotalPages = Math.ceil(filteredMetrics.length / METRICS_PAGE_SIZE)
  const pagedMetrics = filteredMetrics.slice(metricsPage * METRICS_PAGE_SIZE, (metricsPage + 1) * METRICS_PAGE_SIZE)
  const totalRequests24h      = metrics.reduce((s, m) => s + (m.requestsLast24h ?? 0), 0)
  const totalErrors           = metrics.reduce((s, m) => s + (m.errorCount ?? 0), 0)
  const totalRateLimitTriggers = metrics.reduce((s, m) => s + (m.rateLimitTriggers ?? 0), 0)
  const avgResponseMs = metrics.length
    ? metrics.filter(m => m.avgResponseTimeMs != null).reduce((s, m) => s + (m.avgResponseTimeMs ?? 0), 0) /
      Math.max(1, metrics.filter(m => m.avgResponseTimeMs != null).length)
    : null

  // ── Metrics table columns ──────────────────────────────────────────────────

  const maxReq24h = Math.max(1, ...metrics.map(m => m.requestsLast24h ?? 0))

  const metricsColumns: Column<ApiMetrics>[] = [
    {
      key: 'api', title: 'API',
      render: (row) => {
        const hasErr = (row.errorCount ?? 0) > 0
        const hasRL  = (row.rateLimitTriggers ?? 0) > 0
        const dotColor = hasErr ? 'var(--red)' : hasRL ? 'var(--orange)' : 'var(--green)'
        const dotGlow  = hasErr ? 'rgba(239,68,68,0.25)' : hasRL ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'
        const envColor: Record<string, string> = { sandbox: '#7c3aed', prod: '#0891b2', dev: '#059669' }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: `0 0 0 4px ${dotGlow}` }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 600, color: 'var(--txt-1)', fontSize: 13 }}>{row.apiName}</span>
              {row.environment && (
                <span style={{
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px',
                  color: envColor[row.environment.toLowerCase()] ?? 'var(--txt-3)',
                }}>
                  {row.environment}
                </span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'req24h', title: 'Req 24h', width: 160,
      render: (row) => {
        const n = row.requestsLast24h ?? 0
        const pct = Math.round((n / maxReq24h) * 100)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 700, color: 'var(--txt-1)', fontSize: 13 }}>{n.toLocaleString()}</span>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', width: 100 }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.4s' }} />
            </div>
          </div>
        )
      },
    },
    {
      key: 'req1h', title: 'Req 1h', width: 90,
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--txt-2)', fontSize: 13 }}>
          {(row.requestsLastHour ?? 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'avgResp', title: 'Avg Response', width: 140,
      render: (row) => {
        if (row.avgResponseTimeMs == null) return <span style={{ color: 'var(--txt-3)' }}>—</span>
        const ms = row.avgResponseTimeMs
        const color = ms < 500 ? 'var(--green)' : ms < 1000 ? 'var(--orange)' : 'var(--red)'
        const bg    = ms < 500 ? 'rgba(16,185,129,0.12)' : ms < 1000 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'
        const border = ms < 500 ? 'rgba(16,185,129,0.3)' : ms < 1000 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 20,
            background: bg, color, fontWeight: 700, fontSize: 12,
            border: `1px solid ${border}`,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {ms.toFixed(0)} ms
          </span>
        )
      },
    },
    {
      key: 'errors', title: 'Errors', width: 90,
      render: (row) => {
        const n = row.errorCount ?? 0
        return n > 0 ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(239,68,68,0.12)', color: 'var(--red)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20,
            padding: '3px 10px', fontSize: 12, fontWeight: 700,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
            {n}
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)', fontWeight: 600, fontSize: 12 }}>
            <CheckCircle2 size={12} /> 0
          </span>
        )
      },
    },
    {
      key: 'rateLimit', title: 'Rate Limit Hits', width: 140,
      render: (row) => {
        const n = row.rateLimitTriggers ?? 0
        return n > 0 ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(245,158,11,0.12)', color: 'var(--orange)',
            border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20,
            padding: '3px 10px', fontSize: 12, fontWeight: 700,
          }}>
            <Zap size={11} /> {n}
          </span>
        ) : (
          <span style={{ color: 'var(--txt-3)', fontWeight: 600, fontSize: 12 }}>—</span>
        )
      },
    },
    {
      key: 'manage', title: '', width: 100,
      render: (row) => (
        <Btn
          variant="ghost"
          size="sm"
          icon={<Settings2 size={12} />}
          onClick={() => {
            setSelectedApiId(row.proxyApiId)
            setSelectedApiName(row.apiName)
            setActiveTab('per-api')
          }}
        >
          Configure
        </Btn>
      ),
    },
  ]

  // ── UA blocklist columns ───────────────────────────────────────────────────

  const uaColumns: Column<UaBlocklistEntry>[] = [
    {
      key: 'pattern', title: 'Pattern',
      render: (row) => (
        <code style={{
          fontFamily: 'monospace', fontSize: 12,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 5, padding: '3px 8px',
          color: row.enabled ? 'var(--txt-1)' : 'var(--txt-3)',
          display: 'inline-block',
          opacity: row.enabled ? 1 : 0.5,
        }}>
          {row.pattern}
        </code>
      ),
    },
    {
      key: 'reason', title: 'Reason',
      render: (row) => row.reason
        ? <span style={{ color: row.enabled ? 'var(--txt-2)' : 'var(--txt-3)', fontSize: 13, opacity: row.enabled ? 1 : 0.5 }}>{row.reason}</span>
        : <span style={{ color: 'var(--txt-3)', fontSize: 12, fontStyle: 'italic' }}>No reason provided</span>,
    },
    {
      key: 'added', title: 'Added', width: 130,
      render: (row) => (
        <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>
          {dayjs(row.createdAt).format('MMM D, YYYY')}
        </span>
      ),
    },
    {
      key: 'enabled', title: 'Active', width: 80,
      render: (row) => (
        <Switch
          checked={row.enabled}
          onChange={() => toggleUaMutation.mutate(row.id)}
          disabled={toggleUaMutation.isPending && toggleUaMutation.variables === row.id}
        />
      ),
    },
    {
      key: 'actions', title: '', width: 60,
      render: (row) => (
        <Confirm
          title="Remove Pattern"
          description={`Remove "${row.pattern}" from the blocklist?`}
          danger
          onConfirm={() => removeUaMutation.mutate(row.id)}
        >
          <Btn variant="danger" size="sm" iconOnly icon={<Trash2 size={13} />} />
        </Confirm>
      ),
    },
  ]

  // ── Filtered API list ──────────────────────────────────────────────────────

  const filteredApis = metrics.filter(m =>
    m.apiName?.toLowerCase().includes(apiSearch.toLowerCase()) &&
    (!m.environment || m.environment === selectedEnv)
  )

  // ── Tab items ──────────────────────────────────────────────────────────────

  const tabItems: TabItem[] = [
    {
      key: 'metrics',
      label: 'Metrics Dashboard',
      icon: <BarChart2 size={14} />,
      children: (
        <div style={{ height: 'calc(100vh - 210px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16, flexShrink: 0 }}>
            <StatCard
              label="APIs Tracked"
              value={metrics.length}
              subtext={`${selectedEnv} environment`}
              icon={<Activity size={15} />}
              borderColor="var(--accent)"
            />
            <StatCard
              label="Requests (24h)"
              value={totalRequests24h.toLocaleString()}
              subtext="across all APIs"
              icon={<TrendingUp size={15} />}
              borderColor="var(--accent)"
            />
            <StatCard
              label="Avg Response"
              value={avgResponseMs != null ? `${avgResponseMs.toFixed(0)} ms` : '—'}
              subtext={avgResponseMs == null ? 'no data' : avgResponseMs < 500 ? 'healthy' : avgResponseMs < 1000 ? 'degraded' : 'slow'}
              icon={<Clock size={15} />}
              accent={avgResponseMs == null ? undefined : avgResponseMs < 500 ? 'var(--green)' : avgResponseMs < 1000 ? 'var(--orange)' : 'var(--red)'}
              borderColor={avgResponseMs == null ? 'var(--border)' : avgResponseMs < 500 ? 'var(--green)' : avgResponseMs < 1000 ? 'var(--orange)' : 'var(--red)'}
            />
            <StatCard
              label="Total Errors"
              value={totalErrors}
              subtext={totalErrors > 0 ? `across ${metrics.filter(m => (m.errorCount ?? 0) > 0).length} API(s)` : 'all clear'}
              icon={<AlertTriangle size={15} />}
              accent={totalErrors > 0 ? 'var(--red)' : 'var(--green)'}
              borderColor={totalErrors > 0 ? 'var(--red)' : 'var(--green)'}
            />
            <StatCard
              label="Rate Limit Hits"
              value={totalRateLimitTriggers}
              subtext={totalRateLimitTriggers > 0 ? 'requests blocked' : 'no throttling'}
              icon={<Zap size={15} />}
              accent={totalRateLimitTriggers > 0 ? 'var(--orange)' : undefined}
              borderColor={totalRateLimitTriggers > 0 ? 'var(--orange)' : 'var(--border)'}
            />
          </div>

          {/* Search */}
          <div style={{ flexShrink: 0, marginBottom: 8, position: 'relative' }}>
            <input
              value={apiSearch}
              onChange={e => setApiSearch(e.target.value)}
              placeholder="Search API…"
              style={{ width: '100%', paddingLeft: 12, paddingRight: 8, paddingTop: 7, paddingBottom: 7, fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-1)', color: 'var(--txt-1)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {metricsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Spin tip="Loading metrics…" />
              </div>
            ) : (
              <Tbl
                columns={metricsColumns}
                data={pagedMetrics}
                rowKey="proxyApiId"
                emptyText="No API metrics available"
                onRow={(row) => ({
                  style: (row.errorCount ?? 0) > 0
                    ? { background: 'color-mix(in srgb, var(--red) 4%, transparent)' }
                    : undefined,
                })}
              />
            )}
          </div>

          {/* Pagination */}
          {metricsTotalPages > 1 && (
            <div style={{
              flexShrink: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', padding: '9px 14px',
              borderTop: '1px solid var(--border)', background: 'var(--surface-2)',
            }}>
              <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>
                {filteredMetrics.length} APIs · Page {metricsPage + 1} of {metricsTotalPages}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn
                  variant="ghost" size="sm"
                  disabled={metricsPage === 0}
                  onClick={() => setMetricsPage(p => p - 1)}
                >
                  ← Prev
                </Btn>
                {Array.from({ length: metricsTotalPages }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setMetricsPage(i)}
                    style={{
                      width: 28, height: 28, borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border)',
                      background: metricsPage === i ? 'var(--accent)' : 'var(--surface)',
                      color: metricsPage === i ? '#fff' : 'var(--txt-2)',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
                <Btn
                  variant="ghost" size="sm"
                  disabled={metricsPage >= metricsTotalPages - 1}
                  onClick={() => setMetricsPage(p => p + 1)}
                >
                  Next →
                </Btn>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'per-api',
      label: 'Per-API Config',
      icon: <Shield size={14} />,
      children: (
        <div style={{
          height: 'calc(100vh - 210px)',
          overflow: 'hidden',
          display: 'flex',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
        }}>
          {/* Left pane: API selector */}
          <div style={{
            width: '35%', borderRight: '1px solid var(--border)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '10px 12px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
              <Inp
                placeholder="Search APIs…"
                prefix={<BarChart2 size={14} />}
                value={apiSearch}
                onChangeValue={setApiSearch}
              />
            </div>
            {/* Environment tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface-2)' }}>
              {(['sandbox', 'dev', 'prod'] as const).map(env => (
                <button
                  key={env}
                  type="button"
                  onClick={() => setSelectedEnv(env)}
                  style={{
                    flex: 1, padding: '7px 4px', border: 'none',
                    borderBottom: selectedEnv === env ? '2px solid var(--accent)' : '2px solid transparent',
                    background: 'transparent',
                    color: selectedEnv === env ? 'var(--accent)' : 'var(--txt-3)',
                    fontWeight: selectedEnv === env ? 700 : 500,
                    fontSize: 11, cursor: 'pointer', textTransform: 'capitalize',
                    letterSpacing: '0.3px', transition: 'all var(--dur-fast)',
                  }}
                >
                  {env}
                </button>
              ))}
            </div>
            {/* Column header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 14px 5px 26px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)', flexShrink: 0,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                API ({filteredApis.length})
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                24h
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredApis.map(api => {
                const isSelected = selectedApiId === api.proxyApiId && !manualMode
                const hasErrors = (api.errorCount ?? 0) > 0
                const hasRateHits = (api.rateLimitTriggers ?? 0) > 0
                const statusColor = hasErrors ? 'var(--red)' : hasRateHits ? 'var(--orange)' : 'var(--green)'
                const statusGlow = hasErrors ? 'var(--red-dim)' : hasRateHits ? 'var(--orange-dim)' : 'var(--green-dim)'
                return (
                  <div
                    key={api.proxyApiId}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setSelectedApiId(api.proxyApiId); setSelectedApiName(api.apiName); setManualMode(false) }}
                    onKeyDown={e => e.key === 'Enter' && (() => { setSelectedApiId(api.proxyApiId); setSelectedApiName(api.apiName); setManualMode(false) })()}
                    style={{
                      padding: '10px 12px 10px 11px',
                      cursor: 'pointer',
                      borderLeft: `3px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                      background: isSelected ? 'rgba(var(--accent-rgb,99,102,241),0.09)' : 'transparent',
                      borderBottom: '1px solid var(--divider)',
                      transition: 'background var(--dur-fast)',
                      display: 'flex', gap: 9, alignItems: 'flex-start',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {/* Health dot */}
                    <div style={{
                      marginTop: 4, flexShrink: 0,
                      width: 7, height: 7, borderRadius: '50%',
                      background: statusColor,
                      boxShadow: `0 0 0 3px ${statusGlow}`,
                    }} />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                        <span style={{
                          fontWeight: 600, fontSize: 13, lineHeight: 1.2,
                          color: isSelected ? 'var(--accent)' : 'var(--txt-1)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {api.apiName}
                        </span>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-2)', lineHeight: 1 }}>
                            {(api.requestsLast24h ?? 0).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        {hasErrors && (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: 'var(--red)', background: 'var(--red-dim)',
                            border: '1px solid var(--red)', borderRadius: 5, padding: '1px 5px',
                          }}>
                            {api.errorCount} err
                          </span>
                        )}
                        {hasRateHits && (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: 'var(--orange)', background: 'var(--orange-dim)',
                            border: '1px solid var(--orange)', borderRadius: 5, padding: '1px 5px',
                          }}>
                            {api.rateLimitTriggers} RL
                          </span>
                        )}
                        {api.avgResponseTimeMs != null && (
                          <span style={{
                            fontSize: 10, fontWeight: 600,
                            color: api.avgResponseTimeMs < 500 ? 'var(--green)' : api.avgResponseTimeMs < 1000 ? 'var(--orange)' : 'var(--red)',
                          }}>
                            {api.avgResponseTimeMs.toFixed(0)}ms
                          </span>
                        )}
                        {!hasErrors && !hasRateHits && api.avgResponseTimeMs == null && (
                          <span style={{ fontSize: 10, color: 'var(--txt-3)' }}>no activity</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {filteredApis.length === 0 && (
                <div style={{ padding: '24px 14px', color: 'var(--txt-3)', fontSize: 13, textAlign: 'center' }}>No APIs found</div>
              )}
            </div>
            {/* Manual UUID entry */}
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '8px 12px', background: 'var(--surface-2)' }}>
              {!manualMode ? (
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--accent)', fontSize: 12, padding: 0,
                  }}
                >
                  Enter API UUID manually
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="pus-input"
                    placeholder="Paste API UUID"
                    value={manualApiId}
                    onChange={e => setManualApiId(e.target.value)}
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <Btn
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      if (manualApiId.trim()) {
                        setSelectedApiId(manualApiId.trim())
                        setSelectedApiName(manualApiId.trim())
                      }
                    }}
                  >
                    Load
                  </Btn>
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() => { setManualMode(false); setManualApiId('') }}
                  >
                    Cancel
                  </Btn>
                </div>
              )}
            </div>
          </div>

          {/* Right pane */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <PerApiRight
              selectedApiId={selectedApiId}
              selectedApiName={selectedApiName}
              qc={qc}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'scraping',
      label: 'Scraping Prevention',
      icon: <EyeOff size={14} />,
      children: (
        <div style={{ height: 'calc(100vh - 210px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Info callout — left-border accent */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            borderLeft: '3px solid var(--accent)',
            background: 'rgba(var(--accent-rgb,50,77,255),0.04)',
            borderRadius: '0 var(--r-sm) var(--r-sm) 0',
            padding: '9px 14px', flexShrink: 0,
          }}>
            <EyeOff size={13} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.55 }}>
              Block inbound requests whose{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--surface)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>User-Agent</code>
              {' '}header matches a pattern. Rules apply globally across all APIs.
              Use <code style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--surface)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>*</code> as a wildcard.
            </div>
          </div>

          {/* Add form card */}
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)', padding: '12px 14px', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Plus size={12} color="var(--txt-3)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Add Blocked Pattern
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: '0 0 260px' }}>
                <Inp
                  label="User-agent pattern"
                  placeholder="e.g. *bot* or exact string"
                  value={uaPattern}
                  onChangeValue={v => { setUaPattern(v); setUaPatternError('') }}
                  error={uaPatternError}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Inp
                  label="Reason (optional)"
                  placeholder="Why block this pattern?"
                  value={uaReason}
                  onChangeValue={setUaReason}
                />
              </div>
              <div style={{ paddingBottom: uaPatternError ? 20 : 0 }}>
                <Btn
                  variant="danger"
                  size="sm"
                  icon={<Plus size={13} />}
                  loading={addUaMutation.isPending}
                  onClick={() => {
                    if (!uaPattern.trim()) { setUaPatternError('Required'); return }
                    setUaPatternError('')
                    addUaMutation.mutate({ pattern: uaPattern.trim(), reason: uaReason.trim() || undefined })
                  }}
                >
                  Block Pattern
                </Btn>
              </div>
            </div>
          </div>

          {/* Table in a framed section */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)', flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Blocked Patterns
              </span>
              <span style={{
                background: (uaBlocklist?.length ?? 0) > 0 ? 'var(--red-dim)' : 'transparent',
                color: (uaBlocklist?.length ?? 0) > 0 ? 'var(--red)' : 'var(--txt-3)',
                border: `1px solid ${(uaBlocklist?.length ?? 0) > 0 ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 9, padding: '0px 6px', fontSize: 11, fontWeight: 700,
              }}>
                {uaBlocklist?.length ?? 0}
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Tbl
                columns={uaColumns}
                data={uaBlocklist ?? []}
                rowKey="id"
                loading={uaLoading}
                emptyText="No patterns blocked"
              />
            </div>
          </div>
        </div>
      ),
    },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Page header */}
      <div style={{ flexShrink: 0, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
          }}>
            <Shield size={18} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--txt-1)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>API Policies</div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 2 }}>
              Rate limits · IP blacklisting · CORS · Access tokens · Scraping prevention
            </div>
          </div>
        </div>
        {/* Environment selector */}
        <div style={{
          display: 'flex', gap: 2,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: 3,
        }}>
          {(['sandbox', 'dev', 'prod'] as const).map(env => (
            <button
              key={env}
              type="button"
              onClick={() => setSelectedEnv(env)}
              style={{
                padding: '5px 16px', borderRadius: 'var(--r-sm)', border: 'none',
                background: selectedEnv === env ? 'var(--accent)' : 'transparent',
                color: selectedEnv === env ? '#fff' : 'var(--txt-2)',
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'background var(--dur-fast), color var(--dur-fast)',
                letterSpacing: '0.2px',
              }}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Tabs
          items={tabItems}
          activeKey={activeTab}
          onChange={setActiveTab}
        />
      </div>
    </div>
  )
}
