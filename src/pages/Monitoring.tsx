import { useState } from 'react'
import {
  Plus, AlertTriangle, Clock, CheckCircle2, Activity, Globe,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listOpenAlerts, acknowledgeAlert, resolveAlert,
  createAlertRule, updateAlertRule,
} from '../api/monitoring'
import type { AlertRule, AlertInstance } from '../api/monitoring'
import {
  getSlaConfig, createOrUpdateSla, listSlaRecords,
} from '../api/sla'
import type { SlaRecord } from '../api/sla'
import {
  Btn, Inp, Sel, Tag, Tbl, Tabs, Drawer, Switch, toast,
} from '../components/ui'
import type { Column, TabItem } from '../components/ui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const SEVERITY_COLOR: Record<string, 'red' | 'orange' | 'blue' | 'muted'> = {
  CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'muted',
}

const STATUS_COLOR: Record<string, 'red' | 'orange' | 'green' | 'muted'> = {
  OPEN: 'red', ACKNOWLEDGED: 'orange', RESOLVED: 'green',
}

const CONDITION_LABELS: Record<string, string> = {
  ERROR_RATE: 'Error Rate (%)',
  LATENCY_P95: 'P95 Latency (ms)',
  LATENCY_P99: 'P99 Latency (ms)',
  REQUEST_COUNT: 'Request Count',
  AVAILABILITY: 'Availability (%)',
}

interface RuleForm {
  name: string
  proxyApiId: string
  conditionType: string
  severity: string
  threshold: string
  windowMinutes: string
  notificationChannels: string
  enabled: boolean
}

const EMPTY_RULE: RuleForm = {
  name: '', proxyApiId: '', conditionType: '', severity: '',
  threshold: '', windowMinutes: '', notificationChannels: '', enabled: true,
}

interface SlaForm {
  availabilityTarget: string
  latencyP95TargetMs: string
  latencyP99TargetMs: string
  scope: string
  measurementPeriod: string
}

const EMPTY_SLA: SlaForm = {
  availabilityTarget: '', latencyP95TargetMs: '', latencyP99TargetMs: '',
  scope: '', measurementPeriod: '',
}

function validateRule(f: RuleForm, errors: Partial<Record<keyof RuleForm, string>>) {
  if (!f.name.trim()) errors.name = 'Required'
  if (!f.proxyApiId.trim()) errors.proxyApiId = 'Required'
  if (!f.conditionType) errors.conditionType = 'Required'
  if (!f.severity) errors.severity = 'Required'
  if (!f.threshold) errors.threshold = 'Required'
  if (!f.windowMinutes) errors.windowMinutes = 'Required'
  return errors
}

// Stat card
function StatCard({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--txt-3)', fontSize: 12 }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--txt-1)', lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  )
}

export default function Monitoring() {
  const [activeTab, setActiveTab] = useState('open-alerts')
  const [ruleDrawer, setRuleDrawer] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null)
  const [ruleForm, setRuleForm] = useState<RuleForm>(EMPTY_RULE)
  const [ruleErrors, setRuleErrors] = useState<Partial<Record<keyof RuleForm, string>>>({})

  const [slaApiId, setSlaApiId] = useState('')
  const [slaSearchInput, setSlaSearchInput] = useState('')
  const [slaForm, setSlaForm] = useState<SlaForm>(EMPTY_SLA)
  const [slaErrors, setSlaErrors] = useState<Partial<Record<keyof SlaForm, string>>>({})

  const qc = useQueryClient()

  const { data: openAlerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['open-alerts'],
    queryFn: () => listOpenAlerts({ size: 50 }),
    select: (res) => res.data,
    refetchInterval: 30_000,
  })

  const ackMutation = useMutation({
    mutationFn: (id: string) => acknowledgeAlert(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['open-alerts'] }); toast.success('Alert acknowledged') },
  })

  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveAlert(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['open-alerts'] }); toast.success('Alert resolved') },
  })

  const createRuleMutation = useMutation({
    mutationFn: createAlertRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] })
      setRuleDrawer(false)
      setRuleForm(EMPTY_RULE)
      toast.success('Alert rule created')
    },
    onError: () => toast.error('Failed to create rule'),
  })

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AlertRule> }) => updateAlertRule(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] })
      setRuleDrawer(false)
      setEditingRule(null)
      setRuleForm(EMPTY_RULE)
      toast.success('Alert rule updated')
    },
    onError: () => toast.error('Failed to update rule'),
  })

  const { data: slaConfig, isLoading: slaConfigLoading } = useQuery({
    queryKey: ['sla-config', slaApiId],
    queryFn: () => slaApiId ? getSlaConfig(slaApiId) : null,
    enabled: !!slaApiId,
    select: (res) => res?.data,
  })

  const { data: slaRecords, isLoading: slaRecordsLoading } = useQuery({
    queryKey: ['sla-records', slaApiId],
    queryFn: () => slaApiId ? listSlaRecords(slaApiId, { size: 20 }) : null,
    enabled: !!slaApiId,
    select: (res) => res?.data,
  })

  const slaUpsertMutation = useMutation({
    mutationFn: (data: Parameters<typeof createOrUpdateSla>[0]) => createOrUpdateSla(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sla-config', slaApiId] }); toast.success('SLA config saved') },
    onError: () => toast.error('Failed to save SLA config'),
  })

  // Populate SLA form from config
  function applySlaApiId(id: string) {
    setSlaApiId(id)
  }

  // Populate form when slaConfig loads
  if (slaConfig && slaForm.availabilityTarget === '' && slaApiId) {
    setSlaForm({
      availabilityTarget: String(slaConfig.availabilityTarget ?? ''),
      latencyP95TargetMs: String(slaConfig.latencyP95TargetMs ?? ''),
      latencyP99TargetMs: String(slaConfig.latencyP99TargetMs ?? ''),
      scope: slaConfig.scope ?? '',
      measurementPeriod: slaConfig.measurementPeriod ?? '',
    })
  }

  function submitSla() {
    const errs: Partial<Record<keyof SlaForm, string>> = {}
    if (!slaForm.availabilityTarget) errs.availabilityTarget = 'Required'
    if (Object.keys(errs).length) { setSlaErrors(errs); return }
    slaUpsertMutation.mutate({
      proxyApiId: slaApiId,
      availabilityTarget: parseFloat(slaForm.availabilityTarget),
      latencyP95TargetMs: slaForm.latencyP95TargetMs ? parseInt(slaForm.latencyP95TargetMs) : undefined,
      latencyP99TargetMs: slaForm.latencyP99TargetMs ? parseInt(slaForm.latencyP99TargetMs) : undefined,
      scope: slaForm.scope || undefined,
      measurementPeriod: slaForm.measurementPeriod || undefined,
    } as Parameters<typeof createOrUpdateSla>[0])
  }

  function handleRuleSubmit() {
    const errs: Partial<Record<keyof RuleForm, string>> = {}
    validateRule(ruleForm, errs)
    if (Object.keys(errs).length) { setRuleErrors(errs); return }

    const payload = {
      name: ruleForm.name,
      proxyApiId: ruleForm.proxyApiId,
      conditionType: ruleForm.conditionType,
      severity: ruleForm.severity,
      threshold: parseFloat(ruleForm.threshold),
      windowMinutes: parseInt(ruleForm.windowMinutes),
      notificationChannels: ruleForm.notificationChannels
        ? ruleForm.notificationChannels.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      enabled: ruleForm.enabled,
    }

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data: payload as Partial<AlertRule> })
    } else {
      createRuleMutation.mutate(payload as Parameters<typeof createAlertRule>[0])
    }
  }

  const alerts = openAlerts?.content ?? []
  const criticalCount = alerts.filter(a => a.status === 'OPEN').length

  const slaRecordColumns: Column<SlaRecord>[] = [
    { key: 'periodStart', title: 'Period Start', width: 140, render: (row) => dayjs(row.periodStart).format('MMM D, YYYY') },
    { key: 'periodEnd', title: 'Period End', width: 140, render: (row) => dayjs(row.periodEnd).format('MMM D, YYYY') },
    {
      key: 'availabilityPct',
      title: 'Availability',
      width: 120,
      render: (row) => {
        const ok = row.availabilityPct >= (slaConfig?.availabilityTarget ?? 99)
        return (
          <span style={{ color: ok ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
            {row.availabilityPct?.toFixed(3)}%
          </span>
        )
      },
    },
    { key: 'latencyP95Ms', title: 'P95 Latency', width: 110, render: (row) => row.latencyP95Ms != null ? `${row.latencyP95Ms} ms` : '—' },
    { key: 'latencyP99Ms', title: 'P99 Latency', width: 110, render: (row) => row.latencyP99Ms != null ? `${row.latencyP99Ms} ms` : '—' },
    {
      key: 'breach',
      title: 'Breach',
      width: 80,
      render: (row) => row.breach
        ? <Tag color="red">BREACH</Tag>
        : <Tag color="green">OK</Tag>,
    },
  ]

  const alertColumns: Column<AlertInstance>[] = [
    {
      key: 'status',
      title: 'Status',
      width: 120,
      render: (row) => <Tag color={STATUS_COLOR[row.status] ?? 'muted'}>{row.status}</Tag>,
    },
    {
      key: 'ruleId',
      title: 'Rule ID',
      render: (row) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-2)' }}>{row.ruleId}</span>,
    },
    {
      key: 'triggeredAt',
      title: 'Triggered',
      width: 160,
      render: (row) => (
        <div>
          <div style={{ fontSize: 12, color: 'var(--txt-2)' }}>{dayjs(row.triggeredAt).format('MMM D, HH:mm')}</div>
          <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>{dayjs(row.triggeredAt).fromNow()}</div>
        </div>
      ),
    },
    {
      key: 'details',
      title: 'Details',
      render: (row) => row.details
        ? <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>{row.details}</span>
        : <span style={{ color: 'var(--txt-3)' }}>—</span>,
    },
    {
      key: 'actions',
      title: '',
      width: 180,
      render: (row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {row.status === 'OPEN' && (
            <Btn
              size="sm"
              icon={<Clock size={13} />}
              loading={ackMutation.isPending && ackMutation.variables === row.id}
              onClick={() => ackMutation.mutate(row.id)}
            >
              Ack
            </Btn>
          )}
          {row.status !== 'RESOLVED' && (
            <Btn
              variant="primary"
              size="sm"
              icon={<CheckCircle2 size={13} />}
              loading={resolveMutation.isPending && resolveMutation.variables === row.id}
              onClick={() => resolveMutation.mutate(row.id)}
            >
              Resolve
            </Btn>
          )}
        </div>
      ),
    },
  ]

  const tabItems: TabItem[] = [
    {
      key: 'open-alerts',
      label: 'Open Alerts',
      icon: criticalCount > 0 ? (
        <span style={{
          background: 'var(--red)', color: '#fff', borderRadius: 10,
          fontSize: 10, fontWeight: 700, padding: '0 6px', lineHeight: 1.7,
          marginRight: 2,
        }}>
          {criticalCount}
        </span>
      ) : undefined,
      children: (
        <Tbl
          columns={alertColumns}
          data={alerts}
          rowKey="id"
          loading={alertsLoading}
          emptyText="No open alerts"
        />
      ),
    },
    {
      key: 'sla',
      label: 'SLA',
      children: (
        <div style={{ display: 'flex', height: 'calc(100vh - 282px)', overflow: 'hidden' }}>
          {/* Left pane */}
          <div style={{
            width: '38%',
            borderRight: '1px solid var(--divider)',
            overflowY: 'auto',
            padding: 16,
            flexShrink: 0,
          }}>
            <div className="section-label" style={{ marginBottom: 10 }}>API Configuration</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <Inp
                placeholder="Paste API UUID"
                value={slaSearchInput}
                onChangeValue={setSlaSearchInput}
              />
              <Btn variant="secondary" onClick={() => { applySlaApiId(slaSearchInput); setSlaForm(EMPTY_SLA) }}>
                Load
              </Btn>
            </div>

            {slaApiId ? (
              <>
                <div className="card-sm" style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--txt-1)' }}>SLA Targets</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Inp
                      label="Availability (%)"
                      type="number"
                      value={slaForm.availabilityTarget}
                      onChangeValue={v => setSlaForm(f => ({ ...f, availabilityTarget: v }))}
                      error={slaErrors.availabilityTarget}
                      placeholder="99.9"
                    />
                    <Inp
                      label="P95 Target (ms)"
                      type="number"
                      value={slaForm.latencyP95TargetMs}
                      onChangeValue={v => setSlaForm(f => ({ ...f, latencyP95TargetMs: v }))}
                      placeholder="500"
                    />
                    <Inp
                      label="P99 Target (ms)"
                      type="number"
                      value={slaForm.latencyP99TargetMs}
                      onChangeValue={v => setSlaForm(f => ({ ...f, latencyP99TargetMs: v }))}
                      placeholder="1000"
                    />
                    <Sel
                      label="Scope"
                      value={slaForm.scope}
                      onChangeValue={v => setSlaForm(f => ({ ...f, scope: v }))}
                      options={['PLATFORM', 'MODULE', 'API', 'PARTNER_BUNDLE'].map(v => ({ value: v, label: v }))}
                      placeholder="Select scope"
                    />
                    <Inp
                      label="Period"
                      placeholder="MONTHLY / WEEKLY"
                      value={slaForm.measurementPeriod}
                      onChangeValue={v => setSlaForm(f => ({ ...f, measurementPeriod: v }))}
                    />
                  </div>
                </div>
                <Btn variant="primary" style={{ width: '100%' }} loading={slaUpsertMutation.isPending} onClick={submitSla}>
                  Save SLA Config
                </Btn>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--txt-3)' }}>
                <Globe size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div style={{ fontSize: 13, textAlign: 'center' }}>Enter an API ID to configure SLA targets</div>
              </div>
            )}
          </div>

          {/* Right pane */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingLeft: 16 }}>
            <div style={{ flexShrink: 0, marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--txt-1)' }}>SLA History</span>
              {slaApiId && <span style={{ fontSize: 12, color: 'var(--txt-3)', fontFamily: 'monospace' }}>for {slaApiId}</span>}
            </div>
            {slaApiId ? (
              <Tbl
                columns={slaRecordColumns}
                data={slaRecords?.content ?? []}
                rowKey="id"
                loading={slaConfigLoading || slaRecordsLoading}
                emptyText="No SLA records found"
              />
            ) : (
              <div style={{ textAlign: 'center', marginTop: 60, color: 'var(--txt-3)', fontSize: 13 }}>
                Enter an API ID to view SLA history
              </div>
            )}
          </div>
        </div>
      ),
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt-1)' }}>Monitoring & Alerts</h2>
          <p style={{ margin: '2px 0 0', color: 'var(--txt-3)', fontSize: 13 }}>
            Alert rules, open incidents, and SLA health
          </p>
        </div>
        <Btn variant="primary" icon={<Plus size={15} />} onClick={() => { setEditingRule(null); setRuleForm(EMPTY_RULE); setRuleErrors({}); setRuleDrawer(true) }}>
          New Alert Rule
        </Btn>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flexShrink: 0, marginBottom: 12 }}>
        <StatCard
          label="Open Alerts"
          value={criticalCount}
          color={criticalCount > 0 ? 'var(--red)' : 'var(--green)'}
          icon={<AlertTriangle size={13} />}
        />
        <StatCard
          label="Acknowledged"
          value={alerts.filter(a => a.status === 'ACKNOWLEDGED').length}
          icon={<Clock size={13} />}
        />
        <StatCard
          label="Total Active"
          value={alerts.length}
          icon={<Activity size={13} />}
        />
        <StatCard
          label="Platform Health"
          value={criticalCount === 0 ? 'Operational' : 'Degraded'}
          color={criticalCount === 0 ? 'var(--green)' : 'var(--orange)'}
        />
      </div>

      {/* Tabs */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} />
      </div>

      {/* Rule Drawer */}
      <Drawer
        open={ruleDrawer}
        onClose={() => { setRuleDrawer(false); setEditingRule(null); setRuleForm(EMPTY_RULE) }}
        title={editingRule ? 'Edit Alert Rule' : 'New Alert Rule'}
        footer={
          <Btn
            variant="primary"
            loading={createRuleMutation.isPending || updateRuleMutation.isPending}
            onClick={handleRuleSubmit}
          >
            {editingRule ? 'Save' : 'Create'}
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp
            label="Rule Name"
            placeholder="e.g. High error rate on payments API"
            value={ruleForm.name}
            onChangeValue={v => setRuleForm(f => ({ ...f, name: v }))}
            error={ruleErrors.name}
          />
          <Inp
            label="API ID"
            placeholder="UUID of the proxy API to monitor"
            value={ruleForm.proxyApiId}
            onChangeValue={v => setRuleForm(f => ({ ...f, proxyApiId: v }))}
            error={ruleErrors.proxyApiId}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Sel
              label="Condition"
              value={ruleForm.conditionType}
              onChangeValue={v => setRuleForm(f => ({ ...f, conditionType: v }))}
              options={Object.entries(CONDITION_LABELS).map(([k, v]) => ({ value: k, label: v }))}
              placeholder="Select condition"
              error={ruleErrors.conditionType}
            />
            <Sel
              label="Severity"
              value={ruleForm.severity}
              onChangeValue={v => setRuleForm(f => ({ ...f, severity: v }))}
              options={Object.keys(SEVERITY_COLOR).map(k => ({ value: k, label: k }))}
              placeholder="Select severity"
              error={ruleErrors.severity}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp
              label="Threshold"
              type="number"
              placeholder="e.g. 5"
              value={ruleForm.threshold}
              onChangeValue={v => setRuleForm(f => ({ ...f, threshold: v }))}
              error={ruleErrors.threshold}
            />
            <Inp
              label="Window (min)"
              type="number"
              placeholder="e.g. 5"
              value={ruleForm.windowMinutes}
              onChangeValue={v => setRuleForm(f => ({ ...f, windowMinutes: v }))}
              error={ruleErrors.windowMinutes}
            />
          </div>
          <Inp
            label="Notification Channels"
            placeholder="e.g. email, slack, webhook (comma-separated)"
            value={ruleForm.notificationChannels}
            onChangeValue={v => setRuleForm(f => ({ ...f, notificationChannels: v }))}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--txt-2)', cursor: 'pointer' }}>
            <Switch
              checked={ruleForm.enabled}
              onChange={v => setRuleForm(f => ({ ...f, enabled: v }))}
            />
            Enabled
          </label>
        </div>
      </Drawer>
    </div>
  )
}
