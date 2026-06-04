import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getIceEngineConfig, updateIceEngineConfig,
  listIceEngineApis, registerIceEngineApi, updateIceEngineApi,
  deleteIceEngineApi, changeIceEngineApiStatus,
  renewIceEngineToken, listIceEngineVersions, restoreIceEngineVersion,
} from '../api/iceengine'
import type { IceEngineApi, IceEngineEnvironment, VersionSummary } from '../api/iceengine'
import {
  Btn, Inp, Sel, Tag, Switch, Alert, Spin, Tbl, Tabs, Modal, Drawer, Confirm, toast,
} from '../components/ui'
import type { Column, TabItem } from '../components/ui'
import { Database, Key, Settings, History, PlayCircle, Plus, Trash2, Pencil, Copy, Eye, EyeOff } from 'lucide-react'
import dayjs from 'dayjs'
import { copyToClipboard } from '../utils/clipboard'

// ── Colour helpers ─────────────────────────────────────────────────────────────

function statusColor(s: string): 'green' | 'muted' {
  return s === 'ACTIVE' ? 'green' : 'muted'
}

function envColor(e: string): 'red' | 'blue' | 'green' | 'muted' {
  if (e === 'prod') return 'red'
  if (e === 'dev') return 'blue'
  if (e === 'sandbox') return 'green'
  return 'muted'
}

// ── Password field (show/hide) ─────────────────────────────────────────────────

function PwField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <Inp
        label={label}
        type={show ? 'text' : 'password'}
        value={value}
        onChangeValue={onChange}
        placeholder="••••••••"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{
          position: 'absolute', right: 8, top: 26, background: 'none',
          border: 'none', cursor: 'pointer', color: 'var(--txt-3)', padding: 2,
        }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card-sm" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--txt-1)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Descriptions row ───────────────────────────────────────────────────────────

function DescRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--divider)', fontSize: 13 }}>
      <div style={{ width: 140, flexShrink: 0, fontWeight: 600, color: 'var(--txt-2)' }}>{label}</div>
      <div style={{ color: 'var(--txt-1)' }}>{children}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function IceEngine() {
  const [activeTab, setActiveTab] = useState('apis')
  const [registerDrawer, setRegisterDrawer] = useState(false)
  const [editDrawer, setEditDrawer] = useState(false)
  const [editingApi, setEditingApi] = useState<IceEngineApi | null>(null)
  const [selectedApi, setSelectedApi] = useState<IceEngineApi | null>(null)
  const [detailDrawer, setDetailDrawer] = useState(false)
  const [detailTab, setDetailTab] = useState('info')
  const [secretModal, setSecretModal] = useState<{ title: string; secret: string; label: string } | null>(null)

  // Config form state
  const [configForm, setConfigForm] = useState({
    activeEnvironment: 'prod',
    poolMaxSize: 10,
    prodOracleUrl: '', prodOracleUsername: '', prodOraclePassword: '',
    devOracleUrl: '', devOracleUsername: '', devOraclePassword: '',
    sandboxOracleUrl: '', sandboxOracleUsername: '', sandboxOraclePassword: '',
  })

  // Register form state
  const [regForm, setRegForm] = useState({ name: '', description: '', sqlScript: '', environment: 'prod', rateLimit: 100, rateLimitWindow: 60, changeNote: '' })
  const [regErrors, setRegErrors] = useState<Record<string, string>>({})

  // Edit form state
  const [editForm, setEditForm] = useState({ name: '', description: '', sqlScript: '', rateLimit: 100, rateLimitWindow: 60, changeNote: '' })
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const qc = useQueryClient()

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: config } = useQuery({
    queryKey: ['iceengine-config'],
    queryFn: () => getIceEngineConfig(),
    select: (res) => res.data,
    enabled: activeTab === 'config',
  })

  // Sync config into form when it loads
  useEffect(() => {
    if (config) setConfigForm(f => ({
      ...f,
      activeEnvironment: config.activeEnvironment ?? f.activeEnvironment,
      poolMaxSize: config.poolMaxSize != null ? Number(config.poolMaxSize) : f.poolMaxSize,
      prodOracleUrl: config.prodOracleUrl ?? f.prodOracleUrl,
      prodOracleUsername: f.prodOracleUsername,
      prodOraclePassword: f.prodOraclePassword,
      devOracleUrl: config.devOracleUrl ?? f.devOracleUrl,
      devOracleUsername: f.devOracleUsername,
      devOraclePassword: f.devOraclePassword,
      sandboxOracleUrl: config.sandboxOracleUrl ?? f.sandboxOracleUrl,
      sandboxOracleUsername: f.sandboxOracleUsername,
      sandboxOraclePassword: f.sandboxOraclePassword,
    }))
  }, [config])

  const { data: apisData, isLoading: apisLoading } = useQuery({
    queryKey: ['iceengine-apis'],
    queryFn: () => listIceEngineApis({ size: 50 }),
    select: (res) => res.data,
  })

  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ['iceengine-versions', selectedApi?.id],
    queryFn: () => selectedApi ? listIceEngineVersions(selectedApi.id) : null,
    enabled: !!selectedApi && detailTab === 'versions',
    select: (res) => res?.data,
  })

  // ── Mutations ────────────────────────────────────────────────────────────────

  const updateConfigMutation = useMutation({
    mutationFn: updateIceEngineConfig,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['iceengine-config'] }); toast.success('Config saved') },
    onError: () => toast.error('Failed to save config'),
  })

  const registerMutation = useMutation({
    mutationFn: registerIceEngineApi,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['iceengine-apis'] })
      setRegisterDrawer(false)
      setRegForm({ name: '', description: '', sqlScript: '', environment: 'prod', rateLimit: 100, rateLimitWindow: 60, changeNote: '' })
      setSecretModal({ title: 'API Token — Save Now', secret: res.data.apiKey, label: 'API Token' })
    },
    onError: () => toast.error('Failed to register API'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateIceEngineApi>[1] }) => updateIceEngineApi(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['iceengine-apis'] })
      setEditDrawer(false)
      setEditingApi(null)
      if (selectedApi?.id === res.data.id) setSelectedApi(res.data)
      toast.success('API updated')
    },
    onError: () => toast.error('Failed to update API'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteIceEngineApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['iceengine-apis'] })
      setDetailDrawer(false)
      setSelectedApi(null)
      toast.success('API deleted')
    },
    onError: () => toast.error('Failed to delete API'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'INACTIVE' }) => changeIceEngineApiStatus(id, status),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['iceengine-apis'] })
      if (selectedApi?.id === res.data.id) setSelectedApi(res.data)
    },
    onError: () => toast.error('Failed to change status'),
  })

  const renewTokenMutation = useMutation({
    mutationFn: renewIceEngineToken,
    onSuccess: (res) => {
      setSecretModal({ title: 'New Token — Save Now', secret: res.data.newApiKey, label: 'New API Token' })
    },
    onError: () => toast.error('Failed to renew token'),
  })

  const restoreVersionMutation = useMutation({
    mutationFn: ({ id, ver }: { id: string; ver: number }) => restoreIceEngineVersion(id, ver, `Restored from v${ver}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['iceengine-apis'] })
      qc.invalidateQueries({ queryKey: ['iceengine-versions', selectedApi?.id] })
      toast.success('Version restored')
    },
    onError: () => toast.error('Failed to restore version'),
  })

  const apis = apisData?.content ?? []

  // ── Validation ────────────────────────────────────────────────────────────────

  function validateReg() {
    const e: Record<string, string> = {}
    if (!regForm.name.trim()) e.name = 'Required'
    if (!regForm.sqlScript.trim()) e.sqlScript = 'Required'
    setRegErrors(e)
    return Object.keys(e).length === 0
  }

  function validateEdit() {
    const e: Record<string, string> = {}
    if (!editForm.name.trim()) e.name = 'Required'
    if (!editForm.sqlScript.trim()) e.sqlScript = 'Required'
    if (!editForm.changeNote.trim()) e.changeNote = 'Required'
    setEditErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Column definitions ────────────────────────────────────────────────────────

  const apiColumns: Column<IceEngineApi>[] = [
    {
      key: 'name',
      title: 'Name',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-3)' }}>{r.generatedApiUrl}</div>
        </div>
      ),
    },
    {
      key: 'environment',
      title: 'Environment',
      width: 110,
      render: (r) => <Tag color={envColor(r.environment)}>{r.environment}</Tag>,
    },
    {
      key: 'status',
      title: 'Status',
      width: 100,
      render: (r) => <Tag color={statusColor(r.status)}>{r.status}</Tag>,
    },
    {
      key: 'rateLimit',
      title: 'Rate Limit',
      width: 120,
      render: (r) => `${r.rateLimit} / ${r.rateLimitWindow}s`,
    },
    {
      key: 'version',
      title: 'Version',
      width: 80,
      render: (r) => <Tag color="muted">v{r.currentVersion}</Tag>,
    },
    {
      key: 'actions',
      title: '',
      width: 160,
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
          <Switch
            checked={r.status === 'ACTIVE'}
            onChange={(checked) => statusMutation.mutate({ id: r.id, status: checked ? 'ACTIVE' : 'INACTIVE' })}
          />
          <Btn
            variant="ghost"
            size="sm"
            iconOnly
            icon={<Pencil size={13} />}
            onClick={() => {
              setEditingApi(r)
              setEditForm({ name: r.name, description: r.description ?? '', sqlScript: r.sqlScript, rateLimit: r.rateLimit, rateLimitWindow: r.rateLimitWindow, changeNote: '' })
              setEditErrors({})
              setEditDrawer(true)
            }}
          />
          <Confirm
            danger
            title="Delete this IceEngine API?"
            onConfirm={() => deleteMutation.mutate(r.id)}
          >
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
          </Confirm>
        </div>
      ),
    },
  ]

  const versionColumns: Column<VersionSummary>[] = [
    { key: 'ver', title: 'Version', width: 80, render: (r) => <Tag color="muted">v{r.versionNumber}</Tag> },
    { key: 'note', title: 'Note', render: (r) => r.changeNote ?? '—' },
    { key: 'by', title: 'By', width: 120, render: (r) => r.createdBy ?? '—' },
    { key: 'date', title: 'Date', width: 140, render: (r) => dayjs(r.createdAt).format('MMM D, YYYY') },
    { key: 'restored', title: 'Restored From', width: 120, render: (r) => r.restoredFrom ? `v${r.restoredFrom}` : '—' },
    {
      key: 'restore',
      title: '',
      width: 100,
      render: (r) => (
        <Confirm
          title={`Restore v${r.versionNumber} as current?`}
          onConfirm={() => selectedApi && restoreVersionMutation.mutate({ id: selectedApi.id, ver: r.versionNumber })}
        >
          <Btn variant="link" size="sm">Restore</Btn>
        </Confirm>
      ),
    },
  ]

  // ── Detail drawer tabs ────────────────────────────────────────────────────────

  const detailItems: TabItem[] = selectedApi ? [
    {
      key: 'info',
      label: 'Info',
      icon: <Settings size={13} />,
      children: (
        <div style={{ padding: '12px 0' }}>
          <DescRow label="Generated URL">
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{selectedApi.generatedApiUrl}</span>
          </DescRow>
          <DescRow label="Environment">
            <Tag color={envColor(selectedApi.environment)}>{selectedApi.environment}</Tag>
          </DescRow>
          <DescRow label="Rate Limit">
            {selectedApi.rateLimit} requests / {selectedApi.rateLimitWindow}s
          </DescRow>
          <DescRow label="Current Version">v{selectedApi.currentVersion}</DescRow>
          <DescRow label="Has API Key">
            <Tag color={selectedApi.hasApiKey ? 'green' : 'red'}>{selectedApi.hasApiKey ? 'Yes' : 'No'}</Tag>
          </DescRow>
          <DescRow label="Registered By">{selectedApi.registeredBy ?? '—'}</DescRow>
          <DescRow label="Created">{dayjs(selectedApi.createdAt).format('MMM D, YYYY HH:mm')}</DescRow>
          <DescRow label="Updated">{dayjs(selectedApi.updatedAt).format('MMM D, YYYY HH:mm')}</DescRow>
          {selectedApi.description && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--txt-2)' }}>
              {selectedApi.description}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--txt-2)' }}>SQL Script</div>
            <pre style={{
              background: '#1e1e2e', color: '#cdd6f4', padding: '12px 16px',
              borderRadius: 'var(--r-sm)', fontSize: 12, overflowX: 'auto',
              fontFamily: 'monospace', maxHeight: 280, margin: 0, overflowY: 'auto',
            }}>
              {selectedApi.sqlScript}
            </pre>
          </div>
        </div>
      ),
    },
    {
      key: 'versions',
      label: 'Version History',
      icon: <History size={13} />,
      children: (
        <div style={{ paddingTop: 8 }}>
          {versionsLoading
            ? <Spin tip="Loading versions..." />
            : <Tbl columns={versionColumns} data={versions ?? []} rowKey="id" />
          }
        </div>
      ),
    },
    {
      key: 'test',
      label: 'Test',
      icon: <PlayCircle size={13} />,
      children: (
        <div style={{ padding: '12px 0' }}>
          <Alert type="info" title="How to call this API">
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Endpoint:</div>
              <pre style={{ margin: '0 0 12px', fontFamily: 'monospace', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 'var(--r-sm)', overflowX: 'auto' }}>
                GET {selectedApi.generatedApiUrl}?apiId={selectedApi.id}&amp;queryParam1=value
              </pre>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Authorization header:</div>
              <pre style={{ margin: 0, fontFamily: 'monospace', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 'var(--r-sm)' }}>
                Authorization: Bearer {'<your-api-token>'}
              </pre>
            </div>
          </Alert>
        </div>
      ),
    },
  ] : []

  // ── Config tab environment cards ──────────────────────────────────────────────

  const ENV_CARDS = [
    { prefix: 'prod' as const, label: 'Production Oracle' },
    { prefix: 'dev' as const, label: 'Development Oracle' },
    { prefix: 'sandbox' as const, label: 'Sandbox Oracle' },
  ]

  // ── Main tabs ─────────────────────────────────────────────────────────────────

  const mainTabs: TabItem[] = [
    {
      key: 'apis',
      label: 'APIs',
      icon: <Database size={14} />,
      children: (
        <div style={{ height: 'calc(100vh - 302px)', overflow: 'hidden' }}>
          <Tbl
            columns={apiColumns}
            data={apis}
            rowKey="id"
            loading={apisLoading}
            onRow={(r) => ({
              onClick: () => { setSelectedApi(r); setDetailTab('info'); setDetailDrawer(true) },
            })}
          />
        </div>
      ),
    },
    {
      key: 'config',
      label: 'Configuration',
      icon: <Settings size={14} />,
      children: (
        <div style={{ height: 'calc(100vh - 302px)', overflowY: 'auto', paddingRight: 4 }}>
          {/* Row 1: top-level settings */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
            <div style={{ minWidth: 240 }}>
              <Sel
                label="Active Environment"
                options={[
                  { value: 'prod', label: 'Production' },
                  { value: 'dev', label: 'Development' },
                  { value: 'sandbox', label: 'Sandbox' },
                ]}
                value={configForm.activeEnvironment}
                onChangeValue={(v) => setConfigForm(f => ({ ...f, activeEnvironment: v }))}
              />
            </div>
            <div style={{ minWidth: 200 }}>
              <Inp
                label="Pool Max Size"
                type="number"
                value={String(configForm.poolMaxSize)}
                onChangeValue={(v) => setConfigForm(f => ({ ...f, poolMaxSize: Number(v) }))}
                placeholder="e.g. 10"
              />
            </div>
          </div>

          {/* Alert */}
          <div style={{ marginBottom: 14 }}>
            <Alert type="info" description="Oracle database credentials are stored encrypted. Changes take effect on next API call." />
          </div>

          {/* 3-column env cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            {ENV_CARDS.map(env => (
              <div key={env.prefix} className="card-sm">
                <div className="section-label" style={{ marginBottom: 10 }}>{env.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Inp
                    label="JDBC URL"
                    value={(configForm as unknown as Record<string, string>)[`${env.prefix}OracleUrl`] ?? ''}
                    onChangeValue={(v) => setConfigForm(f => ({ ...f, [`${env.prefix}OracleUrl`]: v }))}
                    placeholder={`jdbc:oracle:thin:@${env.prefix}-db:1521:XE`}
                  />
                  <Inp
                    label="Username"
                    value={(configForm as unknown as Record<string, string>)[`${env.prefix}OracleUsername`] ?? ''}
                    onChangeValue={(v) => setConfigForm(f => ({ ...f, [`${env.prefix}OracleUsername`]: v }))}
                    placeholder="db_user"
                  />
                  <PwField
                    label="Password"
                    value={(configForm as unknown as Record<string, string>)[`${env.prefix}OraclePassword`] ?? ''}
                    onChange={(v) => setConfigForm(f => ({ ...f, [`${env.prefix}OraclePassword`]: v }))}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn
              variant="primary"
              loading={updateConfigMutation.isPending}
              onClick={() => updateConfigMutation.mutate({ ...configForm, poolMaxSize: String(configForm.poolMaxSize) })}
            >
              Save Configuration
            </Btn>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* Page header */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingTop: 2 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt-1)' }}>IceEngine API Generator</h2>
          <p style={{ margin: '2px 0 0', color: 'var(--txt-3)', fontSize: 13 }}>
            SQL-based API generation — write a query, get a secure REST endpoint
          </p>
        </div>
        {activeTab === 'apis' && (
          <Btn
            variant="primary"
            icon={<Plus size={15} />}
            onClick={() => {
              setRegForm({ name: '', description: '', sqlScript: '', environment: 'prod', rateLimit: 100, rateLimitWindow: 60, changeNote: '' })
              setRegErrors({})
              setRegisterDrawer(true)
            }}
          >
            Register API
          </Btn>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12, flexShrink: 0 }}>
        <StatCard label="Total APIs" value={apis.length} />
        <StatCard label="Active" value={apis.filter(a => a.status === 'ACTIVE').length} color="var(--green)" />
        <StatCard label="Inactive" value={apis.filter(a => a.status === 'INACTIVE').length} color="var(--txt-3)" />
        <StatCard label="Environments" value={new Set(apis.map(a => a.environment)).size} />
      </div>

      {/* Tabs */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Tabs items={mainTabs} activeKey={activeTab} onChange={setActiveTab} />
      </div>

      {/* ── API Detail Drawer ─────────────────────────────────────────────────── */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={16} />
            <span>{selectedApi?.name}</span>
            {selectedApi && <Tag color={statusColor(selectedApi.status)}>{selectedApi.status}</Tag>}
          </div>
        }
        open={detailDrawer}
        onClose={() => setDetailDrawer(false)}
        width={600}
        footer={
          <Confirm
            title="Generate a new API token? The old one will stop working."
            onConfirm={() => selectedApi && renewTokenMutation.mutate(selectedApi.id)}
          >
            <Btn variant="secondary" size="sm" icon={<Key size={13} />} loading={renewTokenMutation.isPending}>
              Renew Token
            </Btn>
          </Confirm>
        }
      >
        {selectedApi && (
          <Tabs items={detailItems} activeKey={detailTab} onChange={setDetailTab} />
        )}
      </Drawer>

      {/* ── Register Drawer ───────────────────────────────────────────────────── */}
      <Drawer
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Database size={16} />Register IceEngine API</div>}
        open={registerDrawer}
        onClose={() => { setRegisterDrawer(false) }}
        width={600}
        footer={
          <Btn
            variant="primary"
            loading={registerMutation.isPending}
            onClick={() => {
              if (validateReg()) registerMutation.mutate({ ...regForm, environment: regForm.environment as IceEngineEnvironment })
            }}
          >
            Register
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp
            label="API Name *"
            value={regForm.name}
            onChangeValue={v => setRegForm(f => ({ ...f, name: v }))}
            error={regErrors.name}
            placeholder="e.g. Get Customer Balance"
          />
          <Inp
            label="Description"
            value={regForm.description}
            onChangeValue={v => setRegForm(f => ({ ...f, description: v }))}
            placeholder="Brief description of what this API returns"
          />
          <Inp
            label="SQL Script *"
            textarea
            value={regForm.sqlScript}
            onChangeValue={v => setRegForm(f => ({ ...f, sqlScript: v }))}
            error={regErrors.sqlScript}
            placeholder={`SELECT account_id, balance\nFROM accounts\nWHERE customer_id = queryParam1`}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Sel
              label="Environment"
              options={[{ value: 'prod', label: 'Production' }, { value: 'dev', label: 'Development' }, { value: 'sandbox', label: 'Sandbox' }]}
              value={regForm.environment}
              onChangeValue={v => setRegForm(f => ({ ...f, environment: v }))}
            />
            <Inp
              label="Rate Limit (req)"
              type="number"
              value={String(regForm.rateLimit)}
              onChangeValue={v => setRegForm(f => ({ ...f, rateLimit: Number(v) }))}
            />
            <Inp
              label="Window (seconds)"
              type="number"
              value={String(regForm.rateLimitWindow)}
              onChangeValue={v => setRegForm(f => ({ ...f, rateLimitWindow: Number(v) }))}
            />
            <Inp
              label="Change Note"
              value={regForm.changeNote}
              onChangeValue={v => setRegForm(f => ({ ...f, changeNote: v }))}
              placeholder="Initial registration"
            />
          </div>
        </div>
      </Drawer>

      {/* ── Edit Drawer ───────────────────────────────────────────────────────── */}
      <Drawer
        title="Edit IceEngine API"
        open={editDrawer}
        onClose={() => { setEditDrawer(false); setEditingApi(null) }}
        width={600}
        footer={
          <Btn
            variant="primary"
            loading={updateMutation.isPending}
            onClick={() => {
              if (validateEdit()) editingApi && updateMutation.mutate({ id: editingApi.id, data: editForm })
            }}
          >
            Save
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp
            label="API Name *"
            value={editForm.name}
            onChangeValue={v => setEditForm(f => ({ ...f, name: v }))}
            error={editErrors.name}
          />
          <Inp
            label="Description"
            value={editForm.description}
            onChangeValue={v => setEditForm(f => ({ ...f, description: v }))}
          />
          <Inp
            label="SQL Script *"
            textarea
            value={editForm.sqlScript}
            onChangeValue={v => setEditForm(f => ({ ...f, sqlScript: v }))}
            error={editErrors.sqlScript}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp
              label="Rate Limit (req)"
              type="number"
              value={String(editForm.rateLimit)}
              onChangeValue={v => setEditForm(f => ({ ...f, rateLimit: Number(v) }))}
            />
            <Inp
              label="Window (seconds)"
              type="number"
              value={String(editForm.rateLimitWindow)}
              onChangeValue={v => setEditForm(f => ({ ...f, rateLimitWindow: Number(v) }))}
            />
          </div>
          <Inp
            label="Change Note *"
            value={editForm.changeNote}
            onChangeValue={v => setEditForm(f => ({ ...f, changeNote: v }))}
            error={editErrors.changeNote}
            placeholder="Describe what changed and why"
          />
        </div>
      </Drawer>

      {/* ── Secret/Token Modal ────────────────────────────────────────────────── */}
      <Modal
        open={!!secretModal}
        onClose={() => {}} /* no escape — must click save button */
        title={secretModal?.title}
        footer={
          <Btn variant="primary" onClick={() => setSecretModal(null)}>I've saved it</Btn>
        }
      >
        {secretModal && (
          <div>
            <Alert type="warning" description="This token is shown ONCE and cannot be retrieved again." />
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--txt-2)' }}>{secretModal.label}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{
                  fontFamily: 'monospace', fontSize: 13,
                  background: 'var(--surface-2)', padding: '8px 12px',
                  borderRadius: 'var(--r-sm)', flex: 1, wordBreak: 'break-all',
                  color: 'var(--txt-1)',
                }}>
                  {secretModal.secret}
                </div>
                <Btn
                  variant="secondary"
                  size="sm"
                  iconOnly
                  icon={<Copy size={14} />}
                  onClick={() => { copyToClipboard(secretModal.secret); toast.success('Copied') }}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  )
}
