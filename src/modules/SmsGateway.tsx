import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAllApplications, registerApplication, updateApplication,
  deleteApplication, toggleApplicationStatus, renewAccessToken, disableApplicationToken, sendSms,
  getLogs, gatewayHealth, getDispatchStatus, getGatewayStats,
  getSmsGatewayUrl, getSmsGatewayToken, getSmsGatewayUser, getSmsGatewayPass,
  setSmsGatewayUrl, setSmsGatewayToken, setSmsGatewayUser, setSmsGatewayPass,
  getAppToken, setAppToken,
  SENDER_IDS, PRIORITIES, SMS_CODES, isSmsSuccess,
} from '../api/sms'
import type { SmsApplication, SmsLogEntry, GatewayHealth, GatewayStats, DispatchStatus, BulkSmsResponse } from '../api/sms'
import {
  Btn, Inp, Sel, Tag, Switch, Tbl, Tabs, Modal, Drawer, Confirm, toast,
} from '../components/ui'
import type { Column, TabItem } from '../components/ui'
import {
  Plus, RefreshCw, KeyRound, ShieldOff, Power, Pencil, Trash2,
  Send, Settings2, Copy, Check, BarChart2, MessageSquare,
  List, Activity, Wifi, WifiOff, Search, AlertTriangle,
} from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────────

function newGuid(): string { return crypto.randomUUID() }


function parseJwtExpiry(token: string): Date | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp ? new Date(payload.exp * 1000) : null
  } catch {
    return null
  }
}

function tokenExpiryInfo(token: string): { expired: boolean; label: string; daysLeft: number } | null {
  if (!token) return null
  const exp = parseJwtExpiry(token)
  if (!exp) return null
  const msLeft = exp.getTime() - Date.now()
  if (msLeft < 0) return { expired: true, label: 'Expired', daysLeft: 0 }
  const daysLeft = Math.floor(msLeft / 86400000)
  return { expired: false, label: daysLeft < 1 ? '< 1 day' : `${daysLeft}d`, daysLeft }
}

function countSms(msg: string): { chars: number; segments: number; remaining: number } {
  const len = msg.length
  if (len === 0) return { chars: 0, segments: 1, remaining: 160 }
  if (len <= 160) return { chars: len, segments: 1, remaining: 160 - len }
  const segments = Math.ceil(len / 153)
  return { chars: len, segments, remaining: 153 * segments - len }
}

function validateZimCell(cell: string): string | null {
  const c = cell.trim()
  if (!c) return null
  if (/^263\d{9}$/.test(c) || /^07\d{8}$/.test(c)) return null
  return 'Use 263XXXXXXXXX or 07XXXXXXXX'
}

function toIsoDateTime(v: string): string | undefined {
  if (!v) return undefined
  return v.length === 16 ? v + ':00' : v
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  function handle() {
    navigator.clipboard.writeText(text).catch(() => {})
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }
  return (
    <button onClick={handle} title="Copy" style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: done ? 'var(--green)' : 'var(--txt-3)',
      display: 'inline-flex', alignItems: 'center', padding: '0 2px', transition: 'color 0.1s',
    }}>
      {done ? <Check size={11} /> : <Copy size={11} />}
    </button>
  )
}

function TextArea({ label, value, onChange, placeholder, rows = 4 }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <div>
      {label && <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt-2)', marginBottom: 4 }}>{label}</div>}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: '100%', padding: '7px 10px',
          borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--txt-1)',
          fontSize: 13, resize: 'vertical', outline: 'none',
          fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.5,
        }}
      />
    </div>
  )
}


function NotConfigured() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 10, color: 'var(--txt-3)',
    }}>
      <Settings2 size={36} style={{ opacity: 0.3 }} />
      <div style={{ fontSize: 14, fontWeight: 500 }}>Gateway not configured</div>
      <div style={{ fontSize: 12 }}>Open the Configuration tab to enter your bearer token.</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SmsGateway() {

  const [gwUrl,   setGwUrl]   = useState(getSmsGatewayUrl)
  const [gwToken, setGwToken] = useState(getSmsGatewayToken)
  const [gwUser,  setGwUser]  = useState(getSmsGatewayUser)
  const [gwPass,  setGwPass]  = useState(getSmsGatewayPass)

  const [cfgForm, setCfgForm] = useState({
    url: getSmsGatewayUrl(), user: getSmsGatewayUser(),
    pass: getSmsGatewayPass(), token: getSmsGatewayToken(),
  })
  const [healthResult, setHealthResult] = useState<GatewayHealth | 'error' | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const [regDrawer, setRegDrawer] = useState(false)
  const [regForm, setRegForm] = useState({
    applicationName: '', description: '', maxLimit: '1000',
    senderId: '001', email: '', priority: '2',
  })
  const [regErrors, setRegErrors] = useState<Record<string, string>>({})
  const [regResult, setRegResult] = useState({ open: false, token: '', appId: '', name: '' })

  const [editDrawer, setEditDrawer] = useState(false)
  const [editApp, setEditApp] = useState<SmsApplication | null>(null)
  const [editForm, setEditForm] = useState({
    applicationName: '', description: '', maxLimit: '',
    senderId: '', email: '', priority: '', monthlyLimitNotification: true,
  })
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const [tokenModal, setTokenModal] = useState({ open: false, token: '', expiresAt: '', name: '', appId: '' })
  const [selectedApp, setSelectedApp] = useState<SmsApplication | null>(null)
  const [activeTab,    setActiveTab]    = useState('applications')
  const [appSearch,   setAppSearch]   = useState('')
  const [hoveredAppId, setHoveredAppId] = useState<number | null>(null)
  const [appPage,      setAppPage]      = useState(0)

  const [sendForm, setSendForm] = useState({ applicationId: '', cell: '', message: '', txGuid: newGuid() })
  const [sendResult, setSendResult] = useState<{
    code: string; description: string;
    message?: string; cell?: string; txGuid?: string;
    appName?: string; chars?: number; segments?: number; sentAt?: string;
  } | null>(null)
  const [statusCheck, setStatusCheck] = useState<{ txGuid: string; result: DispatchStatus | 'not_found' | null; loading: boolean }>({ txGuid: '', result: null, loading: false })

  const [bulkForm, setBulkForm] = useState({ applicationId: '', message: '', cells: '' })
  const [bulkResult, setBulkResult] = useState<{
    total: number; successful: number; failed: number; results: Record<string, string>;
    message: string; appName: string; sentAt: string;
  } | null>(null)
  const [selectedBulkCell, setSelectedBulkCell] = useState<string | null>(null)

  const [logsFilter, setLogsFilter] = useState({ applicationId: '', cell: '', from: '', to: '' })
  const [logsPage, setLogsPage] = useState(0)
  const [logsQuery, setLogsQuery] = useState({ applicationId: '', cell: '', from: '', to: '', page: 0 })

  const qc = useQueryClient()

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: apps, isLoading, isError, refetch } = useQuery({
    queryKey: ['sms-apps', gwUrl, gwToken],
    queryFn: () => getAllApplications(gwToken, gwUrl),
    enabled: !!gwToken,
    select: res => res.data,
    retry: 1,
  })

  const logsQ = useQuery({
    queryKey: ['sms-logs', gwUrl, gwToken, logsQuery],
    queryFn: () => getLogs({
      applicationId: logsQuery.applicationId || undefined,
      cell: logsQuery.cell || undefined,
      from: toIsoDateTime(logsQuery.from),
      to: toIsoDateTime(logsQuery.to),
      page: logsQuery.page,
      size: 20,
    }, gwToken, gwUrl),
    enabled: !!gwToken,
    retry: false,
    select: res => res.data,
  })

  const statsQ = useQuery({
    queryKey: ['sms-stats', gwUrl, gwToken],
    queryFn: () => getGatewayStats(gwToken, gwUrl).then(r => r.data),
    enabled: !!gwToken,
    refetchInterval: 60_000,
    retry: false,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const registerMutation = useMutation({
    mutationFn: () =>
      registerApplication(
        { ...regForm, priority: Number(regForm.priority) },
        btoa(`${gwUser}:${gwPass}`),
        gwUrl,
      ),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['sms-apps'] })
      setRegDrawer(false)
      const token = res.data.token ?? res.data.Token ?? ''
      if (token && res.data.applicationId) setAppToken(res.data.applicationId, token)
      setRegResult({ open: true, token, appId: res.data.applicationId, name: regForm.applicationName })
      setRegForm({ applicationName: '', description: '', maxLimit: '1000', senderId: '001', email: '', priority: '2' })
    },
    onError: () => toast.error('Registration failed — check basic auth credentials in Configuration'),
  })

  const editMutation = useMutation({
    mutationFn: () => updateApplication(
      editApp!.id,
      {
        applicationName: editForm.applicationName, description: editForm.description,
        maxLimit: Number(editForm.maxLimit), senderId: editForm.senderId,
        email: editForm.email, priority: Number(editForm.priority),
        monthlyLimitNotification: editForm.monthlyLimitNotification,
      },
      gwToken, gwUrl,
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sms-apps'] })
      setEditDrawer(false)
      toast.success('Application updated')
    },
    onError: () => toast.error('Update failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteApplication(id, gwToken, gwUrl),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sms-apps'] }); toast.success('Application deleted') },
    onError: () => toast.error('Delete failed'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => toggleApplicationStatus(id, gwToken, gwUrl),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['sms-apps'] })
      setSelectedApp(s => s?.id === id ? { ...s, status: s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } : s)
      toast.success('Status updated')
    },
    onError: () => toast.error('Toggle failed'),
  })

  const renewMutation = useMutation({
    mutationFn: (app: SmsApplication) => renewAccessToken(app.applicationId, gwToken, gwUrl),
    onSuccess: (res, app) => {
      const token = res.data.Token ?? ''
      if (!token) { toast.error(res.data.Error ?? 'Renewal failed'); return }
      setAppToken(app.applicationId, token)
      qc.invalidateQueries({ queryKey: ['sms-apps'] })
      setSelectedApp(s => s?.id === app.id ? { ...s, tokenDisabled: false } : s)
      setTokenModal({ open: true, token, expiresAt: res.data.expiresAt ?? '', name: app.applicationName, appId: app.applicationId })
    },
    onError: () => toast.error('Token renewal failed'),
  })

  const disableMutation = useMutation({
    mutationFn: (app: SmsApplication) => disableApplicationToken(app.id, gwToken, gwUrl),
    onSuccess: (_, app) => {
      qc.invalidateQueries({ queryKey: ['sms-apps'] })
      setSelectedApp(s => s?.id === app.id ? { ...s, tokenDisabled: true } : s)
      toast.success(`Token disabled for "${app.applicationName}"`)
    },
    onError: () => toast.error('Disable token failed'),
  })

  const sendMutation = useMutation({
    mutationFn: () => {
      const appToken = getAppToken(sendForm.applicationId)
      return sendSms(
        { txGuid: sendForm.txGuid, applicationId: sendForm.applicationId, cell: sendForm.cell, message: sendForm.message },
        appToken || gwToken, gwUrl,
      )
    },
    onSuccess: res => {
      const code = Object.keys(res.data)[0] ?? ''
      const snap = { ...sendForm }
      setSendResult({
        code,
        description: SMS_CODES[code] ?? res.data[code] ?? 'Unknown response',
        message: snap.message,
        cell: snap.cell,
        txGuid: snap.txGuid,
        appName: appList.find(a => a.applicationId === snap.applicationId)?.applicationName,
        chars: snap.message.length,
        segments: Math.ceil(snap.message.length / 160) || 1,
        sentAt: new Date().toISOString(),
      })
      setSendForm(f => ({ ...f, txGuid: newGuid() }))
    },
    onError: (err: any) => {
      const code = err?.response?.data ? Object.keys(err.response.data)[0] : 'ERR'
      const snap = { ...sendForm }
      setSendResult({
        code,
        description: SMS_CODES[code] ?? 'Request failed',
        message: snap.message,
        cell: snap.cell,
        txGuid: snap.txGuid,
        appName: appList.find(a => a.applicationId === snap.applicationId)?.applicationName,
        chars: snap.message.length,
        segments: Math.ceil(snap.message.length / 160) || 1,
        sentAt: new Date().toISOString(),
      })
    },
  })

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const cells = bulkForm.cells.split('\n').map(c => c.trim()).filter(Boolean)
      const appToken = getAppToken(bulkForm.applicationId)
      const token = appToken || gwToken
      const results: Record<string, string> = {}
      let successful = 0, failed = 0
      for (const cell of cells) {
        try {
          const res = await sendSms(
            { txGuid: newGuid(), applicationId: bulkForm.applicationId, cell, message: bulkForm.message },
            token, gwUrl,
          )
          const code = Object.keys(res.data)[0] ?? 'ERR'
          results[cell] = code
          isSmsSuccess(code) ? successful++ : failed++
        } catch (err: any) {
          const code = err?.response?.data ? Object.keys(err.response.data)[0] : 'ERR'
          results[cell] = code
          failed++
        }
      }
      return { total: cells.length, successful, failed, results } as BulkSmsResponse
    },
    onSuccess: data => {
      setBulkResult({
        ...data,
        message: bulkForm.message,
        appName: appList.find(a => a.applicationId === bulkForm.applicationId)?.applicationName ?? '',
        sentAt: new Date().toISOString(),
      })
      setSelectedBulkCell(null)
      toast.success(`Bulk complete: ${data.successful}/${data.total} delivered`)
    },
    onError: () => toast.error('Bulk send failed'),
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function checkStatus(txGuid: string) {
    if (!txGuid.trim()) return
    setStatusCheck(s => ({ ...s, loading: true, result: null }))
    try {
      const appToken = sendForm.applicationId ? getAppToken(sendForm.applicationId) : ''
      const res = await getDispatchStatus(txGuid, appToken || gwToken, gwUrl)
      setStatusCheck(s => ({ ...s, loading: false, result: res.data }))
    } catch (err: any) {
      const is404 = err?.response?.status === 404
      setStatusCheck(s => ({ ...s, loading: false, result: is404 ? 'not_found' : null }))
      if (!is404) toast.error('Status check failed')
    }
  }

  async function checkHealth() {
    setHealthLoading(true)
    setHealthResult(null)
    try {
      const res = await gatewayHealth(cfgForm.url || gwUrl)
      setHealthResult(res.data)
    } catch {
      setHealthResult('error')
    } finally {
      setHealthLoading(false)
    }
  }

  function openEdit(app: SmsApplication) {
    setEditApp(app)
    setEditForm({
      applicationName: app.applicationName, description: app.description ?? '',
      maxLimit: String(app.maxLimit), senderId: app.senderId,
      email: app.email ?? '', priority: String(app.priority),
      monthlyLimitNotification: app.monthlyLimitNotification,
    })
    setEditErrors({})
    setEditDrawer(true)
  }

  function validateReg() {
    const e: Record<string, string> = {}
    if (!regForm.applicationName.trim())                   e.applicationName = 'Required'
    if (!regForm.description.trim())                        e.description = 'Required'
    if (!regForm.email.trim())                              e.email = 'Required'
    if (!regForm.maxLimit || Number(regForm.maxLimit) <= 0) e.maxLimit = 'Must be > 0'
    setRegErrors(e)
    return Object.keys(e).length === 0
  }

  function validateEdit() {
    const e: Record<string, string> = {}
    if (!editForm.applicationName.trim())                    e.applicationName = 'Required'
    if (!editForm.email.trim())                               e.email = 'Required'
    if (!editForm.maxLimit || Number(editForm.maxLimit) <= 0) e.maxLimit = 'Must be > 0'
    setEditErrors(e)
    return Object.keys(e).length === 0
  }

  function validateSend() {
    if (!sendForm.applicationId) { toast.error('Select an application'); return false }
    if (!sendForm.cell.trim())   { toast.error('Cell number required'); return false }
    const zimErr = validateZimCell(sendForm.cell)
    if (zimErr) { toast.error(zimErr); return false }
    if (!sendForm.message.trim()) { toast.error('Message required'); return false }
    return true
  }

  function validateBulk() {
    if (!bulkForm.applicationId) { toast.error('Select an application'); return false }
    if (!bulkForm.message.trim()) { toast.error('Message required'); return false }
    const cells = bulkForm.cells.split('\n').map(c => c.trim()).filter(Boolean)
    if (!cells.length) { toast.error('Enter at least one phone number'); return false }
    return true
  }

  function saveConfig() {
    setSmsGatewayUrl(cfgForm.url);   setGwUrl(cfgForm.url)
    setSmsGatewayToken(cfgForm.token); setGwToken(cfgForm.token)
    setSmsGatewayUser(cfgForm.user);  setGwUser(cfgForm.user)
    setSmsGatewayPass(cfgForm.pass);  setGwPass(cfgForm.pass)
    toast.success('Gateway configuration saved')
  }

  function useAsManagementToken(token: string) {
    setSmsGatewayToken(token); setGwToken(token)
    setCfgForm(f => ({ ...f, token }))
    toast.success('Saved as management token')
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const appList     = apps ?? []
  const activeCount = appList.filter(a => a.status === 'ACTIVE').length
  const totalSms    = appList.reduce((s, a) => s + (a.smsCount ?? 0), 0)
  const nearLimit   = appList.filter(a => a.maxLimit > 0 && a.smsCount / a.maxLimit > 0.8).length
  const appOptions  = appList.map(a => ({ value: a.applicationId, label: `${a.applicationName} (${a.applicationId.slice(0, 8)}…)` }))

  const PRIORITY_COLOR: Record<number, string> = { 1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6' }
  const PAGE_SIZE    = 8
  const filteredApps = appSearch.trim()
    ? appList.filter(a => a.applicationName.toLowerCase().includes(appSearch.toLowerCase()) || a.applicationId.toLowerCase().includes(appSearch.toLowerCase()))
    : appList
  const totalPages   = Math.max(1, Math.ceil(filteredApps.length / PAGE_SIZE))
  const safePage     = Math.min(appPage, totalPages - 1)
  const pagedApps    = filteredApps.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const smsStats    = countSms(sendForm.message)
  const bulkStats   = countSms(bulkForm.message)
  const bulkCells   = bulkForm.cells.split('\n').map(c => c.trim()).filter(Boolean)
  const sendCellErr = validateZimCell(sendForm.cell)
  const mgmtExpiry  = tokenExpiryInfo(gwToken)

  // ── Table columns ──────────────────────────────────────────────────────────

  const logColumns: Column<SmsLogEntry>[] = [
    { key: 'applicationId', title: 'App ID', width: 130, render: r => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.applicationId.slice(0, 12)}…</span> },
    { key: 'cell', title: 'Cell', width: 130, render: r => <span style={{ fontSize: 12 }}>{r.cell}</span> },
    { key: 'msg', title: 'Message', render: r => <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>{r.msg.length > 80 ? r.msg.slice(0, 80) + '…' : r.msg}</span> },
    { key: 'createdAt', title: 'Sent At', width: 160, render: r => <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>{new Date(r.createdAt).toLocaleString()}</span> },
  ]

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const dtInputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
    background: 'var(--surface)', color: 'var(--txt-1)', fontSize: 13, width: '100%', boxSizing: 'border-box',
  }

  const tabs: TabItem[] = [

    {
      key: 'applications', label: 'Applications', icon: <BarChart2 size={14} />,
      children: !gwToken ? <NotConfigured /> : (
        <div style={{ display: 'flex', height: '100%', minHeight: 0, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>

          {/* ── Left sidebar ───────────────────────────────────────── */}
          <div style={{ width: 272, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>

            {/* Search */}
            <div style={{ padding: '10px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-4)', pointerEvents: 'none' }} />
                <input
                  value={appSearch}
                  onChange={e => { setAppSearch(e.target.value); setAppPage(0) }}
                  placeholder="Search applications…"
                  style={{
                    width: '100%', padding: '7px 10px 7px 29px', fontSize: 12,
                    border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                    background: 'var(--bg)', color: 'var(--txt-1)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* App list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {isError && (
                <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--red)', textAlign: 'center' }}>
                  Failed to load — check management token
                </div>
              )}
              {isLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 32, color: 'var(--txt-4)' }}>
                  <RefreshCw size={16} style={{ opacity: 0.35 }} />
                </div>
              )}
              {!isLoading && filteredApps.length === 0 && !isError && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-4)', fontSize: 12 }}>
                  {appSearch ? 'No apps match your search' : 'No applications registered yet'}
                </div>
              )}
              {!isLoading && pagedApps.map(app => {
                const pct = app.maxLimit > 0 ? Math.min(100, Math.round(app.smsCount / app.maxLimit * 100)) : 0
                const barColor  = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981'
                const priColor  = PRIORITY_COLOR[app.priority] ?? '#6366f1'
                const isActive  = selectedApp?.id === app.id
                const isHovered = hoveredAppId === app.id
                return (
                  <div
                    key={app.id}
                    onClick={() => setSelectedApp(app)}
                    onMouseEnter={() => setHoveredAppId(app.id)}
                    onMouseLeave={() => setHoveredAppId(null)}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '11px 10px 11px 0',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${isActive ? priColor : isHovered ? 'var(--border)' : 'transparent'}`,
                      background: isActive ? `${priColor}12` : isHovered ? 'var(--surface-2)' : 'transparent',
                      transition: 'background 0.1s, border-left-color 0.1s',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 34, height: 34, borderRadius: 9, flexShrink: 0, marginLeft: 10,
                      background: `${priColor}1e`, border: `1.5px solid ${priColor}45`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 800, color: priColor,
                    }}>
                      {app.applicationName.charAt(0).toUpperCase()}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--txt-1)' }}>
                          {app.applicationName}
                        </span>
                        {app.tokenDisabled
                          ? <span style={{ fontSize: 8, fontWeight: 700, color: '#ef4444', padding: '1px 4px', borderRadius: 3, border: '1px solid #ef444435', background: '#ef444412', flexShrink: 0 }}>REVOKED</span>
                          : <span style={{ width: 7, height: 7, borderRadius: '50%', background: app.status === 'ACTIVE' ? '#10b981' : '#64748b', flexShrink: 0, display: 'block', marginTop: 1 }} />
                        }
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                          background: `${priColor}18`, color: priColor, border: `1px solid ${priColor}30`,
                        }}>P{app.priority}</span>
                        <span style={{ fontSize: 10, color: 'var(--txt-4)' }}>ID: {app.senderId}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontSize: 10, color: pct > 70 ? barColor : 'var(--txt-4)', flexShrink: 0, whiteSpace: 'nowrap', fontWeight: pct > 70 ? 600 : 400 }}>
                          {app.smsCount.toLocaleString()}/{app.maxLimit >= 1000 ? `${Math.round(app.maxLimit / 1000)}k` : app.maxLimit}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer: pagination */}
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px 10px', borderBottom: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setAppPage(p => Math.max(0, p - 1))}
                    style={{
                      width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)',
                      cursor: safePage === 0 ? 'default' : 'pointer', color: safePage === 0 ? 'var(--txt-4)' : 'var(--txt-1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1,
                      opacity: safePage === 0 ? 0.4 : 1, transition: 'opacity 0.1s',
                    }}
                  >‹</button>
                  <span style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 600, minWidth: 52, textAlign: 'center' }}>
                    {safePage + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setAppPage(p => Math.min(totalPages - 1, p + 1))}
                    style={{
                      width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)',
                      cursor: safePage >= totalPages - 1 ? 'default' : 'pointer', color: safePage >= totalPages - 1 ? 'var(--txt-4)' : 'var(--txt-1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1,
                      opacity: safePage >= totalPages - 1 ? 0.4 : 1, transition: 'opacity 0.1s',
                    }}
                  >›</button>
                </div>
              )}
              <div style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: 'var(--txt-4)' }}>
                  {filteredApps.length}{appSearch ? ` of ${appList.length}` : ''} app{appList.length !== 1 ? 's' : ''}
                </span>
                <Btn variant="ghost" size="sm" icon={<RefreshCw size={11} />} loading={isLoading} onClick={() => refetch()}>Refresh</Btn>
              </div>
            </div>
          </div>

          {/* ── Right: detail / landing ─────────────────────────────── */}
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', minWidth: 0 }}>
            {!selectedApp ? (

              /* ── Landing ── */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '32px 40px', gap: 28 }}>

                {(() => {
                  const s: GatewayStats = statsQ.data ?? {
                    totalApps: appList.length, activeApps: activeCount,
                    inactiveApps: appList.filter(a => a.status !== 'ACTIVE').length,
                    revokedApps: appList.filter(a => a.tokenDisabled).length,
                    totalSmsThisMonth: totalSms,
                    totalCapacity: appList.reduce((x, a) => x + a.maxLimit, 0),
                    remainingCapacity: appList.reduce((x, a) => x + a.maxLimit, 0) - totalSms,
                    utilizationPct: 0,
                    nearLimitCount: nearLimit,
                    atLimitCount: appList.filter(a => a.maxLimit > 0 && a.smsCount >= a.maxLimit).length,
                  }
                  const pct = s.utilizationPct
                  const ringColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981'
                  const r = 44, circ = 2 * Math.PI * r

                  return (
                    <>
                      {/* Ring + primary numbers */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
                        <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
                          <svg width={110} height={110} style={{ transform: 'rotate(-90deg)' }}>
                            <circle cx={55} cy={55} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={10} />
                            <circle cx={55} cy={55} r={r} fill="none" stroke={ringColor} strokeWidth={10}
                              strokeDasharray={`${circ * pct / 100} ${circ}`} strokeLinecap="round" />
                          </svg>
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt-1)', lineHeight: 1 }}>{pct}%</span>
                            <span style={{ fontSize: 10, color: 'var(--txt-4)', marginTop: 2 }}>capacity used</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--txt-1)', lineHeight: 1 }}>{s.totalSmsThisMonth.toLocaleString()}</div>
                            <div style={{ fontSize: 12, color: 'var(--txt-4)', marginTop: 3 }}>SMS sent this month</div>
                          </div>
                          <div style={{ height: 1, background: 'var(--border)' }} />
                          <div style={{ display: 'flex', gap: 22 }}>
                            <div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt-2)' }}>{s.totalCapacity.toLocaleString()}</div><div style={{ fontSize: 11, color: 'var(--txt-4)' }}>total capacity</div></div>
                            <div><div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>{s.remainingCapacity.toLocaleString()}</div><div style={{ fontSize: 11, color: 'var(--txt-4)' }}>remaining</div></div>
                          </div>
                        </div>
                      </div>

                      {/* Stat grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, width: '100%', maxWidth: 500 }}>
                        {([
                          { label: 'Active',   value: s.activeApps,    color: '#10b981' },
                          { label: 'Inactive', value: s.inactiveApps,  color: '#64748b' },
                          { label: 'Revoked',  value: s.revokedApps,   color: '#ef4444' },
                          { label: 'At Limit', value: s.atLimitCount,  color: s.atLimitCount > 0 ? '#ef4444' : '#64748b' },
                        ] as const).map(({ label, value, color }) => (
                          <div key={label} style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                            <div style={{ fontSize: 11, color: 'var(--txt-4)', marginTop: 4 }}>{label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Near-limit alert */}
                      {s.nearLimitCount > 0 && (
                        <div style={{ width: '100%', maxWidth: 500, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>
                            <strong>{s.nearLimitCount}</strong> app{s.nearLimitCount > 1 ? 's are' : ' is'} approaching their monthly limit
                          </span>
                        </div>
                      )}

                      {/* Quick actions */}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button type="button" onClick={() => setActiveTab('send')}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--txt-2)' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        ><Send size={13} color="#6366f1" /> Send SMS</button>
                        <button type="button" onClick={() => setActiveTab('bulk')}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--txt-2)' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = '#10b981'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        ><List size={13} color="#10b981" /> Bulk SMS</button>
                        <Btn variant="primary" icon={<Plus size={13} />} onClick={() => setRegDrawer(true)}>Register App</Btn>
                      </div>

                      <div style={{ fontSize: 11, color: 'var(--txt-4)' }}>Select an app on the left to manage its token &amp; settings</div>
                    </>
                  )
                })()}
              </div>

            ) : (

              /* ── App detail ── */
              <div>
                {/* Detail header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
                      {/* Avatar */}
                      {(() => {
                        const pc = PRIORITY_COLOR[selectedApp.priority] ?? '#6366f1'
                        return (
                          <div style={{
                            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                            background: `${pc}1e`, border: `1.5px solid ${pc}45`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 19, fontWeight: 800, color: pc,
                          }}>
                            {selectedApp.applicationName.charAt(0).toUpperCase()}
                          </div>
                        )
                      })()}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt-1)' }}>{selectedApp.applicationName}</span>
                          <Tag color={selectedApp.status === 'ACTIVE' ? 'green' : 'muted'} style={{ fontSize: 10 }}>{selectedApp.status}</Tag>
                          <Tag color={selectedApp.priority === 1 ? 'red' : selectedApp.priority === 2 ? 'orange' : 'muted'} style={{ fontSize: 10 }}>P{selectedApp.priority}</Tag>
                          {selectedApp.tokenDisabled && <Tag color="red" style={{ fontSize: 10 }}>TOKEN REVOKED</Tag>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px' }}>
                            {selectedApp.applicationId}
                          </span>
                          <button type="button" onClick={() => void navigator.clipboard.writeText(selectedApp.applicationId)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 0 }}>
                            <Copy size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Btn size="sm" variant="ghost" icon={<KeyRound size={13} />}
                        loading={renewMutation.isPending && renewMutation.variables?.applicationId === selectedApp.applicationId}
                        onClick={() => renewMutation.mutate(selectedApp)}>Rotate Token</Btn>
                      <Confirm danger
                        title={`Disable token for "${selectedApp.applicationName}"?`}
                        description="All requests using the current token will be rejected immediately. Use Rotate to issue a replacement."
                        onConfirm={() => disableMutation.mutate(selectedApp)}>
                        <Btn size="sm" variant="ghost" icon={<ShieldOff size={13} />}
                          loading={disableMutation.isPending && disableMutation.variables?.id === selectedApp.id}
                          style={{ color: selectedApp.tokenDisabled ? '#ef4444' : undefined }}>Disable Token</Btn>
                      </Confirm>
                      <Btn size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => openEdit(selectedApp)}>Edit</Btn>
                      <Btn size="sm" variant="ghost" icon={<Power size={13} />}
                        loading={toggleMutation.isPending && toggleMutation.variables === selectedApp.id}
                        onClick={() => toggleMutation.mutate(selectedApp.id)}>
                        {selectedApp.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Btn>
                      <Confirm danger title={`Delete "${selectedApp.applicationName}"?`}
                        onConfirm={() => { deleteMutation.mutate(selectedApp.id); setSelectedApp(null) }}>
                        <Btn size="sm" variant="danger" icon={<Trash2 size={13} />}>Delete</Btn>
                      </Confirm>
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <div style={{ padding: '13px 15px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 700, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>SMS Usage</div>
                    <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--txt-1)', marginBottom: 5 }}>
                      {selectedApp.smsCount.toLocaleString()}
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--txt-3)' }}> / {selectedApp.maxLimit.toLocaleString()}</span>
                    </div>
                    {(() => {
                      const pct = selectedApp.maxLimit > 0 ? Math.min(100, Math.round(selectedApp.smsCount / selectedApp.maxLimit * 100)) : 0
                      const bar = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981'
                      return (
                        <>
                          <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: bar, borderRadius: 3, transition: 'width 0.4s' }} />
                          </div>
                          <div style={{ fontSize: 10, color: pct >= 70 ? bar : 'var(--txt-4)', marginTop: 4, fontWeight: pct >= 70 ? 600 : 400 }}>{pct}% of monthly limit</div>
                        </>
                      )
                    })()}
                  </div>

                  <div style={{ padding: '13px 15px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 700, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sender ID</div>
                    <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--txt-1)', fontFamily: 'monospace' }}>{selectedApp.senderId}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt-4)', marginTop: 5 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, marginRight: 6,
                        background: `${PRIORITY_COLOR[selectedApp.priority] ?? '#6366f1'}18`,
                        color: PRIORITY_COLOR[selectedApp.priority] ?? '#6366f1',
                        border: `1px solid ${PRIORITY_COLOR[selectedApp.priority] ?? '#6366f1'}30`,
                      }}>P{selectedApp.priority}</span>
                      {selectedApp.priority === 1 ? 'Immediate dispatch' : selectedApp.priority === 2 ? '2 min delay' : 'Queued via RabbitMQ'}
                    </div>
                  </div>

                  <div style={{ padding: '13px 15px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 700, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Token</div>
                    {selectedApp.tokenDisabled ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <ShieldOff size={16} color="#ef4444" />
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#ef4444' }}>Revoked</span>
                      </div>
                    ) : (() => {
                      const appTok = getAppToken(selectedApp.applicationId)
                      const expInfo = appTok ? tokenExpiryInfo(appTok) : null
                      return (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Activity size={16} color={expInfo?.expired ? '#ef4444' : '#10b981'} />
                            <span style={{ fontSize: 15, fontWeight: 800, color: expInfo?.expired ? '#ef4444' : '#10b981' }}>
                              {expInfo?.expired ? 'Expired' : 'Active'}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: expInfo?.expired ? '#ef4444' : expInfo && expInfo.daysLeft < 30 ? '#f59e0b' : 'var(--txt-4)' }}>
                            {expInfo ? (expInfo.expired ? 'Token has expired' : `Expires ${expInfo.label}`) : 'No cached token'}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* Meta grid */}
                <div style={{ padding: '0 20px 20px' }}>
                  <div style={{ padding: '13px 15px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</div>
                      <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{selectedApp.description || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contact Email</div>
                      <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{selectedApp.email || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registered</div>
                      <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{selectedApp.createdAt ? new Date(selectedApp.createdAt).toLocaleDateString() : '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Limit Alerts</div>
                      <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{selectedApp.monthlyLimitNotification ? 'Enabled' : 'Disabled'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      ),
    },

    {
      key: 'send', label: 'Send SMS', icon: <Send size={14} />,
      children: !gwToken ? <NotConfigured /> : (
        <div style={{ display: 'flex', height: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>

          {/* ── Left: compose ── */}
          <div style={{ width: 370, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(50,77,255,0.08) 0%, transparent 100%)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(50,77,255,0.15)', border: '1px solid rgba(50,77,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MessageSquare size={17} color="#324dff" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt-1)' }}>Compose Message</div>
                <div style={{ fontSize: 11, color: 'var(--txt-4)' }}>Single recipient · Zimbabwe numbers</div>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <Sel label="Application" options={appOptions} value={sendForm.applicationId}
                  onChangeValue={v => setSendForm(f => ({ ...f, applicationId: v }))} placeholder="Select registered application…" />
                {sendForm.applicationId && (() => {
                  const app = appList.find(a => a.applicationId === sendForm.applicationId)
                  if (!app) return null
                  const pc = PRIORITY_COLOR[app.priority] ?? '#6366f1'
                  const pct = app.maxLimit > 0 ? Math.min(100, Math.round(app.smsCount / app.maxLimit * 100)) : 0
                  const bc = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981'
                  return (
                    <div style={{ marginTop: 8, padding: '9px 12px', background: `${pc}0e`, border: `1px solid ${pc}28`, borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: `${pc}22`, color: pc, border: `1px solid ${pc}35` }}>P{app.priority}</span>
                          <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>Sender: <strong style={{ color: 'var(--txt-2)' }}>{app.senderId}</strong></span>
                        </div>
                        <span style={{ fontSize: 10, color: pct > 70 ? bc : 'var(--txt-4)', fontWeight: pct > 70 ? 600 : 400 }}>
                          {app.smsCount.toLocaleString()}/{app.maxLimit.toLocaleString()} used
                        </span>
                      </div>
                      <div style={{ height: 3, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: bc, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 11, color: getAppToken(app.applicationId) ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {getAppToken(app.applicationId) ? <><Check size={10} /> Token ready</> : <><AlertTriangle size={10} /> No cached token — rotate first</>}
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div>
                <Inp label="Cell Number (Zimbabwe)" value={sendForm.cell}
                  onChangeValue={v => setSendForm(f => ({ ...f, cell: v }))} placeholder="263773814511 or 0773814511" />
                {sendForm.cell && sendCellErr && (
                  <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>{sendCellErr}</div>
                )}
              </div>

              <div>
                <TextArea label="Message" value={sendForm.message}
                  onChange={v => setSendForm(f => ({ ...f, message: v }))} placeholder="Type your SMS message…" rows={4} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--txt-3)' }}>
                  <span>{smsStats.chars} chars</span><span>·</span>
                  <span>{smsStats.segments} SMS</span><span>·</span>
                  <span style={{ color: smsStats.remaining < 20 ? 'var(--red)' : undefined }}>{smsStats.remaining} left</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Inp label="Transaction GUID" value={sendForm.txGuid} onChangeValue={v => setSendForm(f => ({ ...f, txGuid: v }))} />
                </div>
                <Btn variant="ghost" size="sm" onClick={() => setSendForm(f => ({ ...f, txGuid: newGuid() }))}>↻ New</Btn>
              </div>
            </div>

            <div style={{ flexShrink: 0, padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
              <Btn variant="primary" icon={<Send size={14} />} loading={sendMutation.isPending}
                onClick={() => { if (validateSend()) sendMutation.mutate() }}
                style={{ width: '100%', justifyContent: 'center' }}>
                Send SMS
              </Btn>
            </div>
          </div>

          {/* ── Right: result + tracker ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden', minWidth: 0 }}>

            {/* Result */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 22px', borderBottom: '1px solid var(--border)', overflow: 'auto', minHeight: 0, gap: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-3)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={11} /> Send Result
              </div>
              {!sendResult ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--txt-4)' }}>
                  <div style={{ width: 58, height: 58, borderRadius: 16, border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Send size={24} style={{ opacity: 0.2 }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--txt-3)', marginBottom: 3 }}>No message sent yet</div>
                    <div style={{ fontSize: 12, color: 'var(--txt-4)' }}>Fill in the form and hit Send</div>
                  </div>
                </div>
              ) : (() => {
                const ok = isSmsSuccess(sendResult.code)
                const accent = ok ? '#10b981' : '#ef4444'
                return (
                  <>
                    {/* Status card */}
                    <div style={{ padding: '16px 20px', borderRadius: 12, border: `1.5px solid ${accent}`, background: `${accent}08` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: `${accent}1e`, border: `1.5px solid ${accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {ok ? <Check size={22} color={accent} /> : <AlertTriangle size={20} color={accent} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 19, fontWeight: 800, color: accent, lineHeight: 1 }}>{ok ? 'Delivered' : 'Failed'}</div>
                          <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 3 }}>{sendResult.description}</div>
                        </div>
                        <Tag color={ok ? 'green' : 'red'} style={{ flexShrink: 0 }}>{sendResult.code}</Tag>
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--txt-3)', borderTop: `1px solid ${accent}20`, paddingTop: 10 }}>
                        <span style={{ fontWeight: 600, color: 'var(--txt-2)' }}>{sendResult.appName ?? '—'}</span>
                        <span>→</span>
                        <span style={{ fontFamily: 'monospace' }}>{sendResult.cell}</span>
                        {sendResult.sentAt && (
                          <span style={{ marginLeft: 'auto', color: 'var(--txt-4)' }}>{new Date(sendResult.sentAt).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>

                    {/* Message preview */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Message</div>
                      <div style={{
                        padding: '12px 16px', borderRadius: 10, background: 'var(--surface)',
                        border: '1px solid var(--border)', fontSize: 13, color: 'var(--txt-1)',
                        lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        borderLeft: `3px solid ${accent}`,
                      }}>
                        {sendResult.message}
                      </div>
                    </div>

                    {/* Metrics grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {([
                        { label: 'Characters', value: sendResult.chars ?? 0,    color: '#6366f1' },
                        { label: 'Segments',   value: sendResult.segments ?? 1, color: '#f59e0b' },
                        { label: 'Recipient',  value: '1',                      color: '#10b981' },
                        { label: 'Status',     value: sendResult.code,          color: ok ? '#10b981' : '#ef4444' },
                      ] as const).map(m => (
                        <div key={m.label} style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9 }}>
                          <div style={{ fontSize: 17, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</div>
                          <div style={{ fontSize: 10, color: 'var(--txt-4)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* GUID */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-4)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>GUID</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sendResult.txGuid}</span>
                      <button type="button" onClick={() => void navigator.clipboard.writeText(sendResult.txGuid ?? '')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-4)', display: 'flex', padding: 2, flexShrink: 0 }}>
                        <Copy size={12} />
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Delivery Tracker */}
            <div style={{ flexShrink: 0, padding: '14px 22px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={11} /> Delivery Tracker
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <Inp value={statusCheck.txGuid} onChangeValue={v => setStatusCheck(s => ({ ...s, txGuid: v }))} placeholder="Paste txGuid to check carrier dispatch…" />
                </div>
                <Btn variant="secondary" size="sm" loading={statusCheck.loading} onClick={() => checkStatus(statusCheck.txGuid)}>Check</Btn>
                {sendResult && (
                  <Btn variant="ghost" size="sm" onClick={() => { setStatusCheck(s => ({ ...s, txGuid: sendForm.txGuid })); checkStatus(sendForm.txGuid) }}>Last</Btn>
                )}
              </div>
              {statusCheck.result === 'not_found' && (
                <div style={{ fontSize: 12, color: 'var(--txt-3)', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                  Not found — txGuid unknown or not yet registered.
                </div>
              )}
              {statusCheck.result && statusCheck.result !== 'not_found' && (() => {
                const s = statusCheck.result as DispatchStatus
                const col = s.status === 'DISPATCHED' ? '#10b981' : s.status === 'FAILED' ? '#ef4444' : '#f59e0b'
                const tagColor: 'green' | 'red' | 'muted' = s.status === 'DISPATCHED' ? 'green' : s.status === 'FAILED' ? 'red' : 'muted'
                return (
                  <div style={{ padding: '10px 14px', border: `1px solid ${col}35`, borderRadius: 9, background: `${col}08` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <Tag color={tagColor}>{s.status}</Tag>
                      <span style={{ fontSize: 12, color: 'var(--txt-2)', fontFamily: 'monospace' }}>{s.cell}</span>
                      <span style={{ fontSize: 11, color: 'var(--txt-4)', marginLeft: 'auto' }}>P{s.priority}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--txt-4)', display: 'flex', gap: 16 }}>
                      <span>Queued: {new Date(s.queuedAt).toLocaleTimeString()}</span>
                      {s.dispatchedAt && <span>Dispatched: {new Date(s.dispatchedAt).toLocaleTimeString()}</span>}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      ),
    },

    {
      key: 'bulk', label: 'Bulk SMS', icon: <List size={14} />,
      children: !gwToken ? <NotConfigured /> : (
        <div style={{ display: 'flex', height: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>

          {/* ── Left: compose ── */}
          <div style={{ width: 370, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(99,102,241,0.09) 0%, transparent 100%)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <List size={17} color="#6366f1" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt-1)' }}>Broadcast Message</div>
                <div style={{ fontSize: 11, color: 'var(--txt-4)' }}>Multiple recipients · one per line</div>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <Sel label="Application" options={appOptions} value={bulkForm.applicationId}
                  onChangeValue={v => setBulkForm(f => ({ ...f, applicationId: v }))} placeholder="Select registered application…" />
                {bulkForm.applicationId && (() => {
                  const app = appList.find(a => a.applicationId === bulkForm.applicationId)
                  if (!app) return null
                  const pc = PRIORITY_COLOR[app.priority] ?? '#6366f1'
                  const remaining = app.maxLimit - app.smsCount
                  return (
                    <div style={{ marginTop: 8, padding: '9px 12px', background: `${pc}0e`, border: `1px solid ${pc}28`, borderRadius: 8, fontSize: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--txt-3)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: `${pc}22`, color: pc, border: `1px solid ${pc}35` }}>P{app.priority}</span>
                          {app.applicationName}
                        </span>
                        <span style={{ color: remaining < 50 ? '#ef4444' : 'var(--txt-3)', fontWeight: remaining < 50 ? 600 : 400 }}>
                          {remaining.toLocaleString()} SMS remaining
                        </span>
                      </div>
                      {bulkCells.length > 0 && bulkCells.length > remaining && (
                        <div style={{ marginTop: 6, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={11} /> Batch exceeds remaining limit by {(bulkCells.length - remaining).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              <div>
                <TextArea label="Message" value={bulkForm.message}
                  onChange={v => setBulkForm(f => ({ ...f, message: v }))} placeholder="Type your broadcast message…" rows={3} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--txt-3)' }}>
                  <span>{bulkStats.chars} chars</span><span>·</span>
                  <span>{bulkStats.segments} SMS</span><span>·</span>
                  <span style={{ color: bulkStats.remaining < 20 ? 'var(--red)' : undefined }}>{bulkStats.remaining} left</span>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt-2)' }}>Phone Numbers</div>
                  {bulkCells.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', padding: '1px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
                        {bulkCells.length} recipient{bulkCells.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                </div>
                <TextArea value={bulkForm.cells}
                  onChange={v => setBulkForm(f => ({ ...f, cells: v }))}
                  placeholder={'263773814511\n263712345678\n…'} rows={7} />
                <div style={{ fontSize: 11, color: 'var(--txt-4)', marginTop: 4 }}>One Zimbabwe number per line</div>
              </div>
            </div>

            <div style={{ flexShrink: 0, padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
              <Btn variant="primary" icon={<Send size={14} />} loading={bulkMutation.isPending}
                onClick={() => { if (validateBulk()) bulkMutation.mutate() }}
                style={{ width: '100%', justifyContent: 'center' }}>
                Send Bulk ({bulkCells.length})
              </Btn>
            </div>
          </div>

          {/* ── Right: results ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden', minWidth: 0 }}>
            {!bulkResult ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--txt-4)', padding: 32 }}>
                <div style={{ width: 64, height: 64, borderRadius: 18, border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <List size={28} style={{ opacity: 0.2 }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--txt-3)', marginBottom: 4 }}>No batch sent yet</div>
                  <div style={{ fontSize: 12, color: 'var(--txt-4)' }}>Results per recipient appear here after sending</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

                {/* Summary tiles */}
                <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--border)' }}>
                  {([
                    { label: 'Total Sent',  value: bulkResult.total,      color: '#6366f1', icon: <List size={16} color="#6366f1" /> },
                    { label: 'Successful',  value: bulkResult.successful,  color: '#10b981', icon: <Check size={16} color="#10b981" /> },
                    { label: 'Failed',      value: bulkResult.failed,      color: bulkResult.failed > 0 ? '#ef4444' : '#64748b', icon: <AlertTriangle size={16} color={bulkResult.failed > 0 ? '#ef4444' : '#64748b'} /> },
                  ] as const).map((stat, i, arr) => (
                    <div key={stat.label} style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 12, borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: `${stat.color}18`, border: `1px solid ${stat.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {stat.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--txt-1)', lineHeight: 1 }}>{stat.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 3 }}>{stat.label}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Table + detail split */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

                  {/* Results table */}
                  <div style={{ flex: selectedBulkCell ? '0 0 52%' : '1', overflow: 'auto', borderRight: selectedBulkCell ? '1px solid var(--border)' : 'none', transition: 'flex 0.15s' }}>
                    {Object.keys(bulkResult.results).length > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-4)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '8px 14px 4px', borderBottom: '1px solid var(--border)' }}>
                        Click a row to view details
                      </div>
                    )}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['#', 'Cell Number', 'Status', 'Code'].map(h => (
                            <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--txt-3)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(bulkResult.results).map(([cell, code], idx) => {
                          const ok = isSmsSuccess(code)
                          const isSelected = selectedBulkCell === cell
                          return (
                            <tr
                              key={cell}
                              onClick={() => setSelectedBulkCell(isSelected ? null : cell)}
                              style={{
                                borderBottom: '1px solid var(--border)', cursor: 'pointer',
                                borderLeft: `3px solid ${isSelected ? (ok ? '#10b981' : '#ef4444') : 'transparent'}`,
                                background: isSelected ? (ok ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)') : ok ? 'rgba(16,185,129,0.02)' : 'rgba(239,68,68,0.02)',
                                transition: 'background 0.1s',
                              }}
                            >
                              <td style={{ padding: '9px 14px', width: 36 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-4)' }}>{idx + 1}</span>
                              </td>
                              <td style={{ padding: '9px 14px' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--txt-1)', fontWeight: 500 }}>{cell}</span>
                              </td>
                              <td style={{ padding: '9px 14px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: ok ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? '#10b981' : '#ef4444', flexShrink: 0, display: 'inline-block' }} />
                                  {ok ? 'Delivered' : 'Failed'}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px' }}>
                                <Tag color={ok ? 'green' : 'red'}>{code}</Tag>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Detail panel */}
                  {selectedBulkCell && (() => {
                    const code = bulkResult.results[selectedBulkCell] ?? ''
                    const ok = isSmsSuccess(code)
                    const accent = ok ? '#10b981' : '#ef4444'
                    return (
                      <div style={{ flex: '0 0 48%', overflow: 'auto', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
                        {/* Detail header */}
                        <div style={{
                          padding: '14px 18px', borderBottom: '1px solid var(--border)',
                          background: `linear-gradient(135deg, ${accent}09 0%, transparent 100%)`,
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 11, background: `${accent}1e`, border: `1.5px solid ${accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {ok ? <Check size={20} color={accent} /> : <AlertTriangle size={18} color={accent} />}
                            </div>
                            <div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: accent, lineHeight: 1 }}>{ok ? 'Delivered' : 'Failed'}</div>
                              <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 3 }}>{SMS_CODES[code] ?? code}</div>
                            </div>
                          </div>
                          <button type="button" onClick={() => setSelectedBulkCell(null)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-4)', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}>×</button>
                        </div>

                        {/* Detail body */}
                        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                          {/* Recipient */}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recipient</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9 }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--txt-1)', flex: 1 }}>{selectedBulkCell}</span>
                              <button type="button" onClick={() => void navigator.clipboard.writeText(selectedBulkCell)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-4)', display: 'flex', padding: 2 }}>
                                <Copy size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Response */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div style={{ padding: '10px 13px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Code</div>
                              <Tag color={ok ? 'green' : 'red'}>{code}</Tag>
                            </div>
                            <div style={{ padding: '10px 13px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Sequence</div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt-1)' }}>
                                #{Object.keys(bulkResult.results).indexOf(selectedBulkCell) + 1} of {bulkResult.total}
                              </span>
                            </div>
                          </div>

                          {/* Message */}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Message</div>
                            <div style={{
                              padding: '11px 14px', background: 'var(--surface)', border: '1px solid var(--border)',
                              borderLeft: `3px solid ${accent}`, borderRadius: 9,
                              fontSize: 13, color: 'var(--txt-1)', lineHeight: 1.6,
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                              {bulkResult.message}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--txt-4)', marginTop: 4 }}>
                              {bulkResult.message.length} chars · {Math.ceil(bulkResult.message.length / 160) || 1} SMS segment{Math.ceil(bulkResult.message.length / 160) > 1 ? 's' : ''}
                            </div>
                          </div>

                          {/* Meta */}
                          <div style={{ padding: '10px 13px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {bulkResult.appName && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                <span style={{ color: 'var(--txt-4)' }}>Application</span>
                                <span style={{ color: 'var(--txt-2)', fontWeight: 600 }}>{bulkResult.appName}</span>
                              </div>
                            )}
                            {bulkResult.sentAt && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                <span style={{ color: 'var(--txt-4)' }}>Sent at</span>
                                <span style={{ color: 'var(--txt-2)', fontWeight: 600 }}>{new Date(bulkResult.sentAt).toLocaleTimeString()}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      ),
    },

    {
      key: 'logs', label: 'Logs', icon: <Activity size={14} />,
      children: !gwToken ? <NotConfigured /> : (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
          <div style={{ flexShrink: 0, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <Sel label="Application" options={[{ value: '', label: 'All applications' }, ...appOptions]}
                value={logsFilter.applicationId} onChangeValue={v => setLogsFilter(f => ({ ...f, applicationId: v }))} />
            </div>
            <div style={{ flex: '1 1 130px' }}>
              <Inp label="Cell" value={logsFilter.cell} onChangeValue={v => setLogsFilter(f => ({ ...f, cell: v }))} placeholder="263…" />
            </div>
            <div style={{ flex: '1 1 170px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt-2)', marginBottom: 4 }}>From</div>
              <input type="datetime-local" value={logsFilter.from} style={dtInputStyle}
                onChange={e => setLogsFilter(f => ({ ...f, from: e.target.value }))} />
            </div>
            <div style={{ flex: '1 1 170px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt-2)', marginBottom: 4 }}>To</div>
              <input type="datetime-local" value={logsFilter.to} style={dtInputStyle}
                onChange={e => setLogsFilter(f => ({ ...f, to: e.target.value }))} />
            </div>
            <Btn variant="primary" size="sm" icon={<RefreshCw size={13} />}
              onClick={() => { setLogsPage(0); setLogsQuery({ ...logsFilter, page: 0 }) }}>
              Search
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => {
              setLogsFilter({ applicationId: '', cell: '', from: '', to: '' })
              setLogsPage(0)
              setLogsQuery({ applicationId: '', cell: '', from: '', to: '', page: 0 })
            }}>Clear</Btn>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {logsQ.isError && (Number((logsQ.error as any)?.response?.status) === 404 || (logsQ.error as any)?.response?.status === 404) ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--txt-4)' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity size={22} style={{ opacity: 0.3 }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-3)', marginBottom: 4 }}>Logs not available</div>
                  <div style={{ fontSize: 12, color: 'var(--txt-4)' }}>The SMS Gateway server needs to be updated to support this endpoint.</div>
                </div>
              </div>
            ) : (
              <Tbl columns={logColumns} data={logsQ.data?.content ?? []} rowKey="id"
                loading={logsQ.isLoading} emptyText="No SMS logs found" />
            )}
          </div>
          {logsQ.data && logsQ.data.totalPages > 1 && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 13 }}>
              <Btn variant="ghost" size="sm" disabled={logsQ.data.first}
                onClick={() => { const p = logsPage - 1; setLogsPage(p); setLogsQuery(q => ({ ...q, page: p })) }}>
                ← Prev
              </Btn>
              <span style={{ color: 'var(--txt-2)' }}>
                Page {logsQ.data.number + 1} of {logsQ.data.totalPages}
                <span style={{ color: 'var(--txt-3)', marginLeft: 8 }}>({logsQ.data.totalElements.toLocaleString()} total)</span>
              </span>
              <Btn variant="ghost" size="sm" disabled={logsQ.data.last}
                onClick={() => { const p = logsPage + 1; setLogsPage(p); setLogsQuery(q => ({ ...q, page: p })) }}>
                Next →
              </Btn>
            </div>
          )}
        </div>
      ),
    },

    {
      key: 'config', label: 'Configuration', icon: <Settings2 size={14} />,
      children: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'start', paddingBottom: 8 }}>

          {/* Gateway Connection */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, transparent 100%)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {healthResult && healthResult !== 'error' ? <Wifi size={16} color="#10b981" /> : <WifiOff size={16} color={healthResult === 'error' ? '#ef4444' : '#64748b'} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt-1)' }}>Gateway Connection</div>
                <div style={{ fontSize: 11, color: 'var(--txt-4)' }}>Base URL for all SMS Gateway API calls</div>
              </div>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Inp label="Base URL" value={cfgForm.url} onChangeValue={v => setCfgForm(f => ({ ...f, url: v }))} placeholder="/sms-proxy" />
                </div>
                <Btn variant="secondary" size="sm" loading={healthLoading} icon={<Wifi size={13} />} onClick={checkHealth}>Test</Btn>
              </div>
              {healthResult && healthResult !== 'error' && (
                <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.07)', border: '1px solid #10b98130', borderRadius: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>Online</span>
                    <span style={{ fontSize: 11, color: 'var(--txt-4)', marginLeft: 'auto' }}>v{healthResult.version}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt-3)', display: 'flex', gap: 14 }}>
                    <span>{healthResult.service}</span>
                    <span>{healthResult.totalApplications} app{healthResult.totalApplications !== 1 ? 's' : ''} registered</span>
                  </div>
                </div>
              )}
              {healthResult === 'error' && (
                <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid #ef444430', borderRadius: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>Unreachable</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 3 }}>Check the URL and try again</div>
                </div>
              )}
              {!healthResult && (
                <div style={{ fontSize: 11, color: 'var(--txt-4)', padding: '8px 0' }}>
                  Hit Test to verify the gateway is reachable
                </div>
              )}
            </div>
          </div>

          {/* Basic Auth */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(50,77,255,0.08) 0%, transparent 100%)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(50,77,255,0.15)', border: '1px solid rgba(50,77,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <KeyRound size={16} color="#324dff" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt-1)' }}>Basic Auth</div>
                <div style={{ fontSize: 11, color: 'var(--txt-4)' }}>Used to register new applications</div>
              </div>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Inp label="Username" value={cfgForm.user} onChangeValue={v => setCfgForm(f => ({ ...f, user: v }))} placeholder="lgzarue" />
              <Inp label="Password" type="password" value={cfgForm.pass} onChangeValue={v => setCfgForm(f => ({ ...f, pass: v }))} placeholder="••••••••" />
              <div style={{ fontSize: 11, color: 'var(--txt-4)', padding: '4px 0' }}>
                Sent as <code style={{ background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3 }}>Authorization: Basic …</code> on POST /register
              </div>
            </div>
          </div>

          {/* Management Token — full width */}
          <div style={{ gridColumn: '1 / -1', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, transparent 100%)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldOff size={15} color="#f59e0b" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt-1)' }}>Management Token</div>
                <div style={{ fontSize: 11, color: 'var(--txt-4)' }}>Bearer JWT — required to list &amp; manage applications · expires after 12 months</div>
              </div>
              {mgmtExpiry && (
                <div style={{
                  padding: '4px 12px', borderRadius: 20, fontWeight: 700, fontSize: 11, flexShrink: 0,
                  background: mgmtExpiry.expired ? 'rgba(239,68,68,0.15)' : mgmtExpiry.daysLeft < 30 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.12)',
                  color: mgmtExpiry.expired ? '#ef4444' : mgmtExpiry.daysLeft < 30 ? '#f59e0b' : '#10b981',
                  border: `1px solid ${mgmtExpiry.expired ? '#ef444435' : mgmtExpiry.daysLeft < 30 ? '#f59e0b35' : '#10b98135'}`,
                }}>
                  {mgmtExpiry.expired ? 'EXPIRED' : `Expires in ${mgmtExpiry.label}`}
                </div>
              )}
            </div>
            <div style={{ padding: '16px 18px' }}>
              <TextArea label="Bearer Token" value={cfgForm.token}
                onChange={v => setCfgForm(f => ({ ...f, token: v }))} placeholder="eyJhbGciOiJIUzUxMiJ9…" rows={3} />
              <div style={{ fontSize: 11, color: 'var(--txt-4)', marginTop: 8 }}>
                Rotate via the 🔑 button on any app in the Applications tab, then paste the new token here and save.
              </div>
            </div>
          </div>

          {/* Save */}
          <div style={{ gridColumn: '1 / -1' }}>
            <Btn variant="primary" icon={<Check size={14} />} onClick={saveConfig}>Save Configuration</Btn>
          </div>
        </div>
      ),
    },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>

      <div style={{ flexShrink: 0, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt-1)' }}>SMS Gateway</h2>
        <p style={{ margin: '2px 0 0', color: 'var(--txt-3)', fontSize: 13 }}>
          Manage registered applications, send messages, view logs and configure the gateway connection
        </p>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Tabs items={tabs} activeKey={activeTab} onChange={setActiveTab} />
      </div>

      {/* Register Drawer */}
      <Drawer title="Register Application" open={regDrawer} onClose={() => setRegDrawer(false)}
        footer={<Btn variant="primary" size="sm" loading={registerMutation.isPending}
          onClick={() => { if (validateReg()) registerMutation.mutate() }}>Register</Btn>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp label="Application Name *" value={regForm.applicationName} onChangeValue={v => setRegForm(f => ({ ...f, applicationName: v }))} error={regErrors.applicationName} placeholder="e.g. ZimParks Booking" />
          <Inp label="Description *" value={regForm.description} onChangeValue={v => setRegForm(f => ({ ...f, description: v }))} error={regErrors.description} placeholder="Brief description" />
          <Inp label="Email *" type="email" value={regForm.email} onChangeValue={v => setRegForm(f => ({ ...f, email: v }))} error={regErrors.email} placeholder="app@example.com" />
          <Inp label="Monthly SMS Limit *" type="number" value={regForm.maxLimit} onChangeValue={v => setRegForm(f => ({ ...f, maxLimit: v }))} error={regErrors.maxLimit} />
          <Sel label="Sender ID" options={SENDER_IDS} value={regForm.senderId} onChangeValue={v => setRegForm(f => ({ ...f, senderId: v }))} />
          <Sel label="Priority" options={PRIORITIES} value={regForm.priority} onChangeValue={v => setRegForm(f => ({ ...f, priority: v }))} />
        </div>
      </Drawer>

      {/* Edit Drawer */}
      <Drawer title={`Edit: ${editApp?.applicationName ?? ''}`} open={editDrawer} onClose={() => setEditDrawer(false)}
        footer={<Btn variant="primary" size="sm" loading={editMutation.isPending}
          onClick={() => { if (validateEdit()) editMutation.mutate() }}>Save Changes</Btn>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp label="Application Name *" value={editForm.applicationName} onChangeValue={v => setEditForm(f => ({ ...f, applicationName: v }))} error={editErrors.applicationName} />
          <Inp label="Description" value={editForm.description} onChangeValue={v => setEditForm(f => ({ ...f, description: v }))} />
          <Inp label="Email *" type="email" value={editForm.email} onChangeValue={v => setEditForm(f => ({ ...f, email: v }))} error={editErrors.email} />
          <Inp label="Monthly SMS Limit *" type="number" value={editForm.maxLimit} onChangeValue={v => setEditForm(f => ({ ...f, maxLimit: v }))} error={editErrors.maxLimit} />
          <Sel label="Sender ID" options={SENDER_IDS} value={editForm.senderId} onChangeValue={v => setEditForm(f => ({ ...f, senderId: v }))} />
          <Sel label="Priority" options={PRIORITIES} value={editForm.priority} onChangeValue={v => setEditForm(f => ({ ...f, priority: v }))} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="field-label">Monthly Limit Notification</span>
            <Switch checked={editForm.monthlyLimitNotification} onChange={v => setEditForm(f => ({ ...f, monthlyLimitNotification: v }))} />
          </div>
        </div>
      </Drawer>

      {/* Registration Result Modal */}
      <Modal title="Application Registered" open={regResult.open} onClose={() => setRegResult(r => ({ ...r, open: false }))} width={500}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => { useAsManagementToken(regResult.token); setRegResult(r => ({ ...r, open: false })) }}>
              Save as Management Token
            </Btn>
            <Btn variant="primary" onClick={() => setRegResult(r => ({ ...r, open: false }))}>Done</Btn>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>
            <strong>{regResult.name}</strong> registered. Copy the token now — it will not be shown again. Expires after <strong>12 months</strong>.
          </div>
          <div>
            <div className="field-label" style={{ marginBottom: 4 }}>Application ID</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', fontFamily: 'monospace', fontSize: 12 }}>
              <span style={{ flex: 1 }}>{regResult.appId}</span>
              <CopyBtn text={regResult.appId} />
            </div>
          </div>
          <div>
            <div className="field-label" style={{ marginBottom: 4 }}>Bearer Token</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6 }}>
              <span style={{ flex: 1, wordBreak: 'break-all' }}>{regResult.token}</span>
              <CopyBtn text={regResult.token} />
            </div>
          </div>
        </div>
      </Modal>

      {/* Renewed Token Modal */}
      <Modal title={`New Token — ${tokenModal.name}`} open={tokenModal.open} onClose={() => setTokenModal(m => ({ ...m, open: false }))} width={500}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => { useAsManagementToken(tokenModal.token); setTokenModal(m => ({ ...m, open: false })) }}>
              Save as Management Token
            </Btn>
            <Btn variant="primary" onClick={() => setTokenModal(m => ({ ...m, open: false }))}>Close</Btn>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>
            New token issued. Expires in <strong>12 months</strong>
            {tokenModal.expiresAt && <span style={{ color: 'var(--txt-3)', marginLeft: 4 }}>({new Date(tokenModal.expiresAt).toLocaleDateString()})</span>}.
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6 }}>
            <span style={{ flex: 1, wordBreak: 'break-all' }}>{tokenModal.token}</span>
            <CopyBtn text={tokenModal.token} />
          </div>
        </div>
      </Modal>

    </div>
  )
}
