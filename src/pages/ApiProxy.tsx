import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Plus, Trash2, Pencil, CheckCircle2, XCircle, HelpCircle,
  Zap, PlayCircle, Settings, Bug, RotateCcw, History,
  RefreshCw, Copy, Code2, FlaskConical, Maximize2,
  Globe, Lock, Unlock, Server, Fingerprint,
  ShieldCheck, Key, Info, AlertTriangle, Search, X, Tags,
  CopyPlus, GripVertical,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listApis, registerApi, updateApi, deleteApi,
  getApiHealth, triggerHealthCheck, setHealthStatus, getHealthSummary, getRequestLogs, getLogBody,
  listTransforms, createTransform, deleteTransform, updateTransform,
  listMocks, createMock, updateMock, deleteMock,
  listReplays, triggerReplay,
  listParameters, createParameter, deleteParameter,
  testApi,
  listTags, createTag, deleteTag,
} from '../api/proxy'
import type {
  ProxyApi, ProxyApiTag, HealthStatus, ProxyEnvironment, RequestLog, Transform, SandboxMock, ReplayRecord, ParameterSource, ParameterType,
} from '../api/proxy'
import { listKongLogs, syncApiToKong, deleteFromKong } from '../api/kong'
import type { KongSyncLog } from '../api/kong'
import { getPlatformConfig } from '../api/platform'
import { copyToClipboard as clipboardCopy } from '../utils/clipboard'
import {
  Btn, Inp, Sel, Tag, Switch, Alert, Spin, Tbl, Tabs, Drawer, Confirm, toast,
} from '../components/ui'
import Modal from '../components/ui/Modal'
import type { Column, TabItem } from '../components/ui'
import { useTheme } from '../context/ThemeContext'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { fmtTs, fmtTsDateTime } from '../utils/time'

dayjs.extend(relativeTime)

// ── Design tokens ─────────────────────────────────────────────────────────────

const ACCENT = '#324dff'
const HEALTH_HEX: Record<HealthStatus, string>   = { UP: '#10b981', DOWN: '#ef4444', DEGRADED: '#f59e0b', UNKNOWN: '#94a3b8' }
const HEALTH_BG:  Record<HealthStatus, string>   = { UP: '#f0fdf4', DOWN: '#fef2f2', DEGRADED: '#fffbeb', UNKNOWN: '#f8fafc' }
const HEALTH_TAG_COLOR: Record<HealthStatus, 'green'|'red'|'orange'|'muted'> = {
  UP: 'green', DOWN: 'red', DEGRADED: 'orange', UNKNOWN: 'muted',
}
const ENV_TAG_COLOR: Record<string, 'red'|'blue'|'green'|'muted'> = {
  prod: 'red', dev: 'blue', sandbox: 'green',
}
const METHOD_HEX: Record<string, string> = {
  GET: '#10b981', POST: '#3b82f6', PUT: '#f97316', PATCH: '#ca8a04', DELETE: '#ef4444',
}

const PARAM_SOURCE_COLOR: Record<ParameterSource, 'blue'|'muted'|'accent'|'orange'> = {
  CALLER: 'blue', STATIC: 'muted', AUTO_UUID: 'accent', AUTO_TIMESTAMP: 'orange',
}
const PARAM_SOURCE_LABEL: Record<ParameterSource, string> = {
  CALLER: 'Caller', STATIC: 'Static', AUTO_UUID: 'Auto UUID', AUTO_TIMESTAMP: 'Auto Time',
}
const PARAM_ACCENT: Record<ParameterSource, string> = {
  CALLER: '#3b82f6', STATIC: '#64748b', AUTO_UUID: ACCENT, AUTO_TIMESTAMP: '#f97316',
}

const HTTP_METHODS    = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const ENVIRONMENTS    = ['prod', 'dev', 'sandbox']
const TRANSFORM_TYPES = ['HEADER_INJECT', 'HEADER_STRIP', 'BODY_MASK', 'BODY_FILTER', 'STATUS_REMAP']

function envDomain(env: string, cfg?: { prodDomain: string; devDomain: string; sandboxDomain: string } | null): string {
  if (!cfg) return ''
  if (env === 'prod') return cfg.prodDomain
  if (env === 'dev')  return cfg.devDomain
  return cfg.sandboxDomain
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function prettyJson(s: string | null | undefined): string {
  if (!s) return ''
  try { return JSON.stringify(JSON.parse(s), null, 2) }
  catch { return s }
}

function toSlug(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
    .slice(0, 50).replace(/^-|-$/g, '')
}

// ── Saved snapshots ───────────────────────────────────────────────────────────

interface SavedSnapshot {
  id: string
  savedAt: string
  label: string
  statusCode: number
  responseTimeMs: number
  success: boolean
  requestBodySent: string | null
  responseBody: string | null
}

function loadSnapshots(apiId: string): SavedSnapshot[] {
  try { return JSON.parse(localStorage.getItem(`pus_snapshots_${apiId}`) ?? '[]') } catch { return [] }
}
function persistSnapshots(apiId: string, snaps: SavedSnapshot[]) {
  localStorage.setItem(`pus_snapshots_${apiId}`, JSON.stringify(snaps.slice(0, 30)))
}
function loadTestParams(apiId: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(`pus_params_${apiId}`) ?? '{}') } catch { return {} }
}
function persistTestParams(apiId: string, params: Record<string, string>) {
  localStorage.setItem(`pus_params_${apiId}`, JSON.stringify(params))
}

// ── JSON syntax highlighter ───────────────────────────────────────────────────

type JToken = { text: string; color: string }

const DARK_COLORS = { bg: '#0d1117', border: '#30363d', fg: '#e6edf3', key: '#79c0ff', str: '#a8d8a8', placeholder: '#fb923c', num: '#f9a825', kw: '#c792ea', punct: '#8892a4' }
const LIGHT_COLORS = { bg: '#f6f8fa', border: '#d0d7de', fg: '#24292f', key: '#0550ae', str: '#116329', placeholder: '#953800', num: '#953800', kw: '#8250df', punct: '#6e7781' }

function tokenizeJson(src: string, c: typeof DARK_COLORS): JToken[] {
  const out: JToken[] = []
  const re = /("(?:[^"\\]|\\.)*"(?:\s*:)?)|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],:])|(\s+|.)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    if (m[1]) {
      const isKey = m[1].trimEnd().endsWith(':')
      const raw   = isKey ? m[1].slice(0, m[1].lastIndexOf(':')) : m[1]
      const colon = isKey ? ':' : ''
      const inner = raw.slice(1, -1)
      const parts = inner.split(/({{[^}]*}})/)
      const strColor = isKey ? c.key : c.str
      out.push({ text: '"', color: strColor })
      for (const p of parts) {
        out.push({ text: p, color: /^{{.*}}$/.test(p) ? c.placeholder : strColor })
      }
      out.push({ text: '"', color: strColor })
      if (colon) out.push({ text: ':', color: c.punct })
    } else if (m[2]) out.push({ text: m[2], color: c.kw })
    else if (m[3])   out.push({ text: m[3], color: c.num })
    else if (m[4])   out.push({ text: m[4], color: c.punct })
    else             out.push({ text: m[5], color: c.fg })
  }
  return out
}

function JsonHighlight({ code, maxHeight = 280, isDark }: { code: string; maxHeight?: number; isDark: boolean }) {
  const c = isDark ? DARK_COLORS : LIGHT_COLORS
  const tokens = tokenizeJson(prettyJson(code) || code, c)
  return (
    <pre style={{
      margin: 0, fontSize: 11.5, fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      background: c.bg, color: c.fg,
      padding: '10px 14px 24px', borderRadius: 8, border: `1px solid ${c.border}`,
      maxHeight, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.65,
    }}>
      {tokens.map((t, i) => <span key={i} style={{ color: t.color }}>{t.text}</span>)}
    </pre>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HealthDot({ status, size = 9 }: { status: HealthStatus; size?: number }) {
  const color = HEALTH_HEX[status]
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: status === 'UP' ? `0 0 0 2px ${color}30` : 'none',
    }} />
  )
}

function MethodChip({ method }: { method: string }) {
  const color = METHOD_HEX[method] ?? '#64748b'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: `${color}18`, color, border: `1px solid ${color}40`,
      letterSpacing: '0.3px', flexShrink: 0,
    }}>{method}</span>
  )
}


function MethodPicker({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {HTTP_METHODS.map(m => {
        const color = METHOD_HEX[m] ?? '#64748b'
        const active = value === m
        return (
          <button key={m} type="button" onClick={() => onChange?.(m)} style={{
            padding: '6px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.3px',
            borderRadius: 7, border: `1.5px solid ${active ? color : 'var(--border)'}`,
            background: active ? color : 'var(--surface)',
            color: active ? 'white' : 'var(--txt-2)',
            cursor: 'pointer', outline: 'none',
            boxShadow: active ? `0 2px 10px ${color}40` : 'none',
            transition: 'all 0.15s var(--ease-snappy)',
          }}>{m}</button>
        )
      })}
    </div>
  )
}

const AUTH_OPTS = [
  { value: 'NONE',            label: 'None',            sub: 'No upstream auth needed',       icon: <Unlock size={14} /> },
  { value: 'API_KEY',         label: 'API Key',         sub: 'Custom header injection',       icon: <Key size={14} /> },
  { value: 'BEARER_TOKEN',    label: 'Bearer Token',    sub: 'Static JWT / access token',     icon: <ShieldCheck size={14} /> },
  { value: 'BASIC_AUTH',      label: 'Basic Auth',      sub: 'Username & password (RFC 7617)', icon: <Lock size={14} /> },
  { value: 'OAUTH2_PASSWORD', label: 'OAuth2 Password', sub: 'Auto-fetch & cache tokens',     icon: <RefreshCw size={14} /> },
]
function AuthTypeGrid({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {AUTH_OPTS.map(opt => {
        const active = value === opt.value
        return (
          <div key={opt.value} onClick={() => onChange?.(opt.value)} style={{
            padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
            transition: 'all 0.15s var(--ease-snappy)',
            border: `1.5px solid ${active ? ACCENT : 'var(--border)'}`,
            background: active ? `${ACCENT}0e` : 'var(--surface-2)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 7, flexShrink: 0,
              background: active ? ACCENT : 'var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', transition: 'background 0.15s',
            }}>
              {opt.icon}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? ACCENT : 'var(--txt-1)', marginBottom: 2 }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 11, color: active ? `${ACCENT}99` : 'var(--txt-3)' }}>
                {opt.sub}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Field wrapper (replaces Form.Item) ────────────────────────────────────────

function Field({ label, hint, error, children, style }: {
  label?: React.ReactNode; hint?: string; error?: string; children: React.ReactNode; style?: React.CSSProperties
}) {
  return (
    <div className="field" style={style}>
      {label && <div className="field-label">{label}</div>}
      {children}
      {hint && !error && <div className="field-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  )
}

// ── Register form state ────────────────────────────────────────────────────────

interface RegisterFormState {
  httpMethod: string
  internalBaseUrl: string
  requestBodyTemplate: string
  name: string
  publicPath: string
  description: string
  exposedDomain: string
  exposedPath: string
  environment: string
  authRequired: boolean
  healthCheckUrlUnavailable: boolean
  healthCheckUrl: string
  healthCheckIntervalSecs: string
  upstreamAuthType: string
  upstreamAuthHeader: string
  upstreamAuthValue: string
  upstreamAuthUrl: string
  upstreamAuthUsername: string
  upstreamAuthPassword: string
  upstreamClientId: string
  upstreamClientSecret: string
  tags: string[]
}

interface EditFormState {
  httpMethod: string
  internalBaseUrl: string
  requestBodyTemplate: string
  name: string
  description: string
  exposedDomain: string
  exposedPath: string
  environment: string
  authRequired: boolean
  healthCheckUrlUnavailable: boolean
  healthCheckUrl: string
  healthCheckIntervalSecs: string
  upstreamAuthType: string
  upstreamAuthHeader: string
  upstreamAuthValue: string
  upstreamAuthUrl: string
  upstreamAuthUsername: string
  upstreamAuthPassword: string
  upstreamClientId: string
  upstreamClientSecret: string
  tags: string[]
}

interface TransformFormState {
  name: string
  transformType: string
  config: string
  orderIndex: string
}

interface MockFormState {
  method: string
  path: string
  responseStatus: string
  responseBody: string
  latencyMs: string
  priority: string
}

interface ParamFormState {
  paramName: string
  paramSource: ParameterSource
  paramType: ParameterType
  staticValue: string
  description: string
  required: boolean
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ApiProxy() {
  const { isDark, colors } = useTheme()

  const [registerDrawer, setRegisterDrawer] = useState(false)
  const [editDrawer,     setEditDrawer]     = useState(false)
  const [editingApi,     setEditingApi]     = useState<ProxyApi | null>(null)
  const [selectedApi,    setSelectedApi]    = useState<ProxyApi | null>(null)
  const [detailTab,      setDetailTab]      = useState('overview')
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null)
  const [bodyModal, setBodyModal] = useState<{ title: string; body: string } | null>(null)
  const [bodyFetchingId, setBodyFetchingId] = useState<string | null>(null)
  const [logsPage,        setLogsPage]        = useState(0)
  const [logsSearchInput, setLogsSearchInput] = useState('')
  const [logsSearch,      setLogsSearch]      = useState('')
  const [replaysPage, setReplaysPage] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setLogsSearch(logsSearchInput), 300)
    return () => clearTimeout(t)
  }, [logsSearchInput])
  const [testParams,     setTestParams]     = useState<Record<string, string>>({})
  const [testResult,     setTestResult]     = useState<{
    success: boolean; statusCode: number; responseTimeMs: number;
    requestBodySent: string | null; responseBody: string | null; errorMessage: string | null
  } | null>(null)
  const [testLoading,    setTestLoading]    = useState(false)
  const [snapshots,      setSnapshots]      = useState<SavedSnapshot[]>([])
  const [showSnapshots,  setShowSnapshots]  = useState(false)

  // ── Register form state ──────────────────────────────────────────────────
  // ── Tag filter / search state ────────────────────────────────────────────
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [activeEnvTab, setActiveEnvTab] = useState<'all' | ProxyEnvironment>('all')
  const [apisPage, setApisPage] = useState(0)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [newTagForm, setNewTagForm] = useState({ name: '', description: '', color: '#6366f1' })

  const defaultRegister: RegisterFormState = {
    httpMethod: 'POST', internalBaseUrl: '', requestBodyTemplate: '', name: '',
    publicPath: '', description: '', exposedDomain: '', exposedPath: '',
    environment: 'prod', authRequired: true, healthCheckUrlUnavailable: false, healthCheckUrl: '',
    healthCheckIntervalSecs: '60', upstreamAuthType: 'NONE', upstreamAuthHeader: 'X-API-Key',
    upstreamAuthValue: '', upstreamAuthUrl: '', upstreamAuthUsername: '', upstreamAuthPassword: '',
    upstreamClientId: '', upstreamClientSecret: '', tags: [],
  }
  const [regForm, setRegForm] = useState<RegisterFormState>(defaultRegister)
  const [regErrors, setRegErrors] = useState<Record<string, string>>({})
  const [regStep, setRegStep] = useState<'endpoint' | 'identity' | 'routing' | 'security'>('endpoint')
  const [isCloneMode, setIsCloneMode] = useState(false)
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null)

  const [apiOrder, setApiOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('pus-api-order') ?? '[]') } catch { return [] }
  })
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // ── Edit form state ──────────────────────────────────────────────────────
  const defaultEdit: EditFormState = {
    httpMethod: 'POST', internalBaseUrl: '', requestBodyTemplate: '', name: '',
    description: '', exposedDomain: '', exposedPath: '', environment: 'prod',
    authRequired: true, healthCheckUrlUnavailable: false, healthCheckUrl: '', healthCheckIntervalSecs: '60',
    upstreamAuthType: 'NONE', upstreamAuthHeader: 'X-API-Key', upstreamAuthValue: '',
    upstreamAuthUrl: '', upstreamAuthUsername: '', upstreamAuthPassword: '',
    upstreamClientId: '', upstreamClientSecret: '', tags: [],
  }
  const [editForm, setEditForm] = useState<EditFormState>(defaultEdit)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [editStep, setEditStep] = useState<'endpoint' | 'identity' | 'routing' | 'security'>('endpoint')

  // ── Transform form state ─────────────────────────────────────────────────
  const [txForm, setTxForm] = useState<TransformFormState>({ name: '', transformType: '', config: '', orderIndex: '0' })
  const [txErrors, setTxErrors] = useState<Record<string, string>>({})
  const [showTxInfo, setShowTxInfo] = useState(false)
  const [editingTransform, setEditingTransform] = useState<Transform | null>(null)
  const [txEditForm, setTxEditForm] = useState({ config: '', orderIndex: '0', enabled: true })
  const [txBodyTab, setTxBodyTab] = useState<'edit' | 'preview'>('preview')

  // ── Mock form state ──────────────────────────────────────────────────────
  const [mockForm, setMockForm] = useState<MockFormState>({ method: '', path: '', responseStatus: '200', responseBody: '', latencyMs: '0', priority: '0' })
  const [showMockInfo, setShowMockInfo] = useState(false)
  const [showReplayInfo, setShowReplayInfo] = useState(false)
  const [showKongInfo, setShowKongInfo] = useState(false)
  const [mockErrors, setMockErrors] = useState<Record<string, string>>({})
  const [editingMock, setEditingMock] = useState<SandboxMock | null>(null)
  const [mockEditForm, setMockEditForm] = useState({ responseStatus: '', responseBody: '', latencyMs: '', priority: '', enabled: true })
  const [mockBodyTab, setMockBodyTab] = useState<'edit' | 'preview'>('preview')

  // ── Param form state ─────────────────────────────────────────────────────
  const [paramForm, setParamForm] = useState<ParamFormState>({ paramName: '', paramSource: 'CALLER', paramType: 'BODY', staticValue: '', description: '', required: true })
  const [paramErrors, setParamErrors] = useState<Record<string, string>>({})

  const qc = useQueryClient()

  // ── Queries ───────────────────────────────────────────────────────────────

  const API_PAGE_SIZE = 20
  const { data: apisData, isLoading: apisLoading } = useQuery({
    queryKey: ['proxy-apis'],
    queryFn: () => listApis({ size: 200 }),
    select: r => r.data,
  })
  const { data: platformConfig } = useQuery({ queryKey: ['platform-config'], queryFn: () => getPlatformConfig(), select: r => r.data, staleTime: 5 * 60_000 })
  const { data: healthSummary, isLoading: summaryLoading   } = useQuery({ queryKey: ['proxy-health-summary'], queryFn: () => getHealthSummary(), select: r => r.data, refetchInterval: 30_000 })
  const { data: apiHealth                                  } = useQuery({ queryKey: ['proxy-api-health', selectedApi?.id], queryFn: () => selectedApi ? getApiHealth(selectedApi.id) : null, enabled: !!selectedApi, select: r => r?.data, refetchInterval: 30_000 })
  const { data: logsData,        isLoading: logsLoading       } = useQuery({ queryKey: ['proxy-logs',       selectedApi?.id, logsPage, logsSearch],    queryFn: () => selectedApi ? getRequestLogs(selectedApi.id, { page: logsPage, size: 20, search: logsSearch || undefined }) : null, enabled: !!selectedApi && (detailTab === 'logs' || detailTab === 'replays'),       select: r => r?.data, refetchInterval: logsSearch ? false : 20_000 })
  const { data: transformsData,  isLoading: transformsLoading } = useQuery({ queryKey: ['proxy-transforms', selectedApi?.id], queryFn: () => selectedApi ? listTransforms(selectedApi.id, { size: 50 }) : null,   enabled: !!selectedApi && detailTab === 'transforms', select: r => r?.data })
  const { data: mocksData,       isLoading: mocksLoading      } = useQuery({ queryKey: ['proxy-mocks',      selectedApi?.id], queryFn: () => selectedApi ? listMocks(selectedApi.id, { size: 50 }) : null,         enabled: !!selectedApi && detailTab === 'mocks',      select: r => r?.data })
  const { data: replaysData,     isLoading: replaysLoading    } = useQuery({ queryKey: ['proxy-replays',    selectedApi?.id, replaysPage], queryFn: () => selectedApi ? listReplays(selectedApi.id, { page: replaysPage, size: 10 }) : null, enabled: !!selectedApi && (detailTab === 'replays' || detailTab === 'logs'),    select: r => r?.data, refetchInterval: detailTab === 'replays' ? 5_000 : false })
  const { data: kongLogsData,    isLoading: kongLogsLoading   } = useQuery({ queryKey: ['kong-logs',        selectedApi?.id], queryFn: () => selectedApi ? listKongLogs({ proxyApiId: selectedApi.id, size: 10 }) : null, enabled: !!selectedApi && detailTab === 'kong', select: r => r?.data })
  const { data: parametersData,  isLoading: parametersLoading } = useQuery({ queryKey: ['proxy-parameters', selectedApi?.id], queryFn: () => selectedApi ? listParameters(selectedApi.id) : null, enabled: !!selectedApi && (detailTab === 'parameters' || detailTab === 'test'), select: r => r?.data })
  const { data: tagsData } = useQuery({ queryKey: ['proxy-tags'], queryFn: () => listTags(), select: r => r.data })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const registerMutation = useMutation({
    mutationFn: registerApi,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-apis'] }); setRegisterDrawer(false); setRegForm(defaultRegister); setIsCloneMode(false); setCloneSourceId(null); toast.success('API registered') },
    onError: (err: unknown) => {
      const status = (err as any)?.response?.status
      const msg: string = (err as any)?.response?.data?.message ?? ''
      if (status === 409) {
        const lowerMsg = msg.toLowerCase()
        const nameConflict = lowerMsg.includes('name')
        const pathConflict = lowerMsg.includes('path') || lowerMsg.includes('public')
        const errors: Record<string, string> = {}
        if (nameConflict || (!nameConflict && !pathConflict)) errors.name = msg || 'An API with this name already exists — choose a different name'
        if (pathConflict || (!nameConflict && !pathConflict)) errors.publicPath = msg || 'This path is already registered — choose a different path'
        setRegErrors(errors)
        setRegStep('identity')
        toast.error('Conflict — update the highlighted fields and try again')
      } else {
        toast.error(msg || 'Registration failed')
      }
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateApi>[1] }) => updateApi(id, data),
    onSuccess: res => { qc.invalidateQueries({ queryKey: ['proxy-apis'] }); setEditDrawer(false); setEditingApi(null); if (selectedApi?.id === res.data.id) setSelectedApi(res.data); toast.success('API updated') },
    onError: () => toast.error('Update failed'),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteApi,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-apis'] }); if (selectedApi) setSelectedApi(null); toast.success('API removed') },
    onError: (err: unknown) => {
      const msg = (err as import('axios').AxiosError<{ message?: string }>).response?.data?.message
      toast.error(msg ?? 'Delete failed', 6000)
    },
  })

  const healthCheckMutation = useMutation({
    mutationFn: (id: string) => triggerHealthCheck(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proxy-api-health', selectedApi?.id] })
      qc.invalidateQueries({ queryKey: ['proxy-apis'] })
      qc.invalidateQueries({ queryKey: ['proxy-health-summary'] })
      toast.success('Health check triggered')
    },
    onError: () => toast.error('Health check failed'),
  })
  const setHealthStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: HealthStatus }) => setHealthStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proxy-apis'] })
      qc.invalidateQueries({ queryKey: ['proxy-health-summary'] })
      toast.success('Health status updated')
    },
    onError: () => toast.error('Failed to update health status'),
  })
  const kongSyncMutation = useMutation({
    mutationFn: (id: string) => syncApiToKong(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kong-logs', selectedApi?.id] }); toast.success('Synced to Kong') },
    onError: () => toast.error('Kong sync failed'),
  })
  const kongDeleteMutation = useMutation({
    mutationFn: (id: string) => deleteFromKong(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kong-logs', selectedApi?.id] }); toast.success('Removed from Kong') },
    onError: () => toast.error('Kong remove failed'),
  })
  const replayMutation = useMutation({
    mutationFn: (logId: string) => triggerReplay(selectedApi!.id, { originalLogId: logId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-replays', selectedApi?.id] }); toast.success('Replay triggered') },
    onError: () => toast.error('Replay failed'),
  })

  const createTransformMutation = useMutation({
    mutationFn: (d: Parameters<typeof createTransform>[1]) => createTransform(selectedApi!.id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-transforms', selectedApi?.id] }); setTxForm({ name: '', transformType: '', config: '', orderIndex: '0' }); toast.success('Transform created') },
    onError: () => toast.error('Failed'),
  })
  const deleteTransformMutation = useMutation({
    mutationFn: (id: string) => deleteTransform(selectedApi!.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-transforms', selectedApi?.id] }); toast.success('Deleted') },
    onError: () => toast.error('Failed'),
  })
  const toggleTransformMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateTransform(selectedApi!.id, id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxy-transforms', selectedApi?.id] }),
  })
  const updateTransformMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateTransform>[2] }) => updateTransform(selectedApi!.id, id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-transforms', selectedApi?.id] }); setEditingTransform(null); toast.success('Transform updated') },
    onError: () => toast.error('Failed to update'),
  })

  const createMockMutation = useMutation({
    mutationFn: (d: Parameters<typeof createMock>[1]) => createMock(selectedApi!.id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-mocks', selectedApi?.id] }); setMockForm({ method: '', path: '', responseStatus: '200', responseBody: '', latencyMs: '0', priority: '0' }); toast.success('Mock created') },
    onError: () => toast.error('Failed'),
  })
  const deleteMockMutation = useMutation({
    mutationFn: (id: string) => deleteMock(selectedApi!.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-mocks', selectedApi?.id] }); toast.success('Deleted') },
    onError: () => toast.error('Failed'),
  })
  const updateMockMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateMock>[2] }) => updateMock(selectedApi!.id, id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-mocks', selectedApi?.id] }); setEditingMock(null); toast.success('Mock updated') },
    onError: () => toast.error('Failed to update'),
  })

  function openEditMock(m: SandboxMock) {
    setEditingMock(m)
    setMockEditForm({ responseStatus: String(m.responseStatus), responseBody: m.responseBody ?? '', latencyMs: String(m.latencyMs), priority: String(m.priority), enabled: m.enabled })
    setMockBodyTab('preview')
  }
  function submitMockEdit() {
    if (!editingMock) return
    updateMockMutation.mutate({ id: editingMock.id, data: { responseStatus: Number(mockEditForm.responseStatus), responseBody: mockEditForm.responseBody || undefined, latencyMs: Number(mockEditForm.latencyMs), priority: Number(mockEditForm.priority), enabled: mockEditForm.enabled } })
  }

  const createParameterMutation = useMutation({
    mutationFn: (d: Parameters<typeof createParameter>[1]) => createParameter(selectedApi!.id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-parameters', selectedApi?.id] }); setParamForm({ paramName: '', paramSource: 'CALLER', paramType: 'BODY', staticValue: '', description: '', required: true }); toast.success('Parameter added') },
    onError: () => toast.error('Failed'),
  })
  const deleteParameterMutation = useMutation({
    mutationFn: (paramId: string) => deleteParameter(selectedApi!.id, paramId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-parameters', selectedApi?.id] }); toast.success('Removed') },
    onError: () => toast.error('Failed'),
  })
  const createTagMutation = useMutation({
    mutationFn: (d: { name: string; description?: string; color?: string }) => createTag(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-tags'] }); setNewTagForm({ name: '', description: '', color: '#6366f1' }); toast.success('Tag created') },
    onError: () => toast.error('Tag name already exists or invalid'),
  })
  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proxy-tags'] }); toast.success('Tag deleted') },
    onError: () => toast.error('Failed to delete tag'),
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function openEdit(api: ProxyApi) {
    setEditingApi(api)
    setEditForm({
      name: api.name ?? '',
      description: api.description ?? '',
      internalBaseUrl: api.internalBaseUrl ?? '',
      authRequired: api.authRequired,
      environment: api.environment ?? 'prod',
      healthCheckUrlUnavailable: !api.healthCheckUrl,
      healthCheckUrl: api.healthCheckUrl ?? '',
      healthCheckIntervalSecs: String(api.healthCheckIntervalSecs ?? 60),
      httpMethod: api.httpMethod ?? 'GET',
      requestBodyTemplate: api.requestBodyTemplate ?? '',
      exposedDomain: (api.exposedDomain ?? '').replace(/^https?:\/\//i, ''),
      exposedPath: api.exposedPath ?? '',
      upstreamAuthType: api.upstreamAuthType ?? 'NONE',
      upstreamAuthHeader: api.upstreamAuthHeader ?? 'X-API-Key',
      upstreamAuthValue: '',
      upstreamAuthUrl: api.upstreamAuthUrl ?? '',
      upstreamAuthUsername: api.upstreamAuthUsername ?? '',
      upstreamAuthPassword: '',
      upstreamClientId: api.upstreamClientId ?? '',
      upstreamClientSecret: '',
      tags: api.tags ?? [],
    })
    setEditErrors({})
    setEditDrawer(true)
  }

  function openClone(api: ProxyApi) {
    setRegForm({
      httpMethod: api.httpMethod ?? 'POST',
      internalBaseUrl: api.internalBaseUrl,
      requestBodyTemplate: api.requestBodyTemplate ?? '',
      name: `Copy of ${api.name}`,
      publicPath: `${api.publicPath}-copy`,
      description: api.description ?? '',
      exposedDomain: (api.exposedDomain ?? '').replace(/^https?:\/\//i, ''),
      exposedPath: api.exposedPath ?? '',
      environment: api.environment,
      authRequired: api.authRequired,
      healthCheckUrlUnavailable: !api.healthCheckUrl,
      healthCheckUrl: api.healthCheckUrl ?? '',
      healthCheckIntervalSecs: String(api.healthCheckIntervalSecs ?? 60),
      upstreamAuthType: api.upstreamAuthType ?? 'NONE',
      upstreamAuthHeader: api.upstreamAuthHeader ?? 'X-API-Key',
      upstreamAuthValue: '',
      upstreamAuthUrl: api.upstreamAuthUrl ?? '',
      upstreamAuthUsername: api.upstreamAuthUsername ?? '',
      upstreamAuthPassword: '',
      upstreamClientId: api.upstreamClientId ?? '',
      upstreamClientSecret: '',
      tags: api.tags ?? [],
    })
    setIsCloneMode(true)
    setCloneSourceId(api.id)
    setRegErrors({})
    setRegStep('identity')
    setRegisterDrawer(true)
  }

  useEffect(() => {
    if (selectedApi) {
      setSnapshots(loadSnapshots(selectedApi.id))
      setTestParams(loadTestParams(selectedApi.id))
    } else {
      setSnapshots([])
      setTestParams({})
    }
    setShowSnapshots(false)
  }, [selectedApi?.id])

  useEffect(() => {
    if (selectedApi) persistTestParams(selectedApi.id, testParams)
  }, [testParams])

  async function runTest() {
    if (!selectedApi) return
    setTestLoading(true); setTestResult(null)
    try {
      const params: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(testParams)) if (v !== '') params[k] = v
      const res = await testApi(selectedApi.id, params)
      setTestResult(res.data)
    } catch { toast.error('Test request failed') }
    finally { setTestLoading(false) }
  }

  function saveSnapshot() {
    if (!selectedApi || !testResult) return
    const snap: SavedSnapshot = {
      id: randomId(),
      savedAt: new Date().toISOString(),
      label: `${testResult.statusCode} · ${testResult.responseTimeMs}ms · ${dayjs().format('D MMM HH:mm')}`,
      statusCode: testResult.statusCode,
      responseTimeMs: testResult.responseTimeMs,
      success: testResult.success,
      requestBodySent: testResult.requestBodySent,
      responseBody: testResult.responseBody,
    }
    const updated = [snap, ...loadSnapshots(selectedApi.id)]
    persistSnapshots(selectedApi.id, updated)
    setSnapshots(updated)
    toast.success('Response saved')
  }

  function deleteSnapshot(id: string) {
    if (!selectedApi) return
    const updated = snapshots.filter(s => s.id !== id)
    persistSnapshots(selectedApi.id, updated)
    setSnapshots(updated)
  }

  function loadSnapshot(snap: SavedSnapshot) {
    setTestResult({ success: snap.success, statusCode: snap.statusCode, responseTimeMs: snap.responseTimeMs, requestBodySent: snap.requestBodySent, responseBody: snap.responseBody, errorMessage: null })
    setShowSnapshots(false)
  }

  function validateRegister(): boolean {
    const e: Record<string, string> = {}
    if (!regForm.internalBaseUrl) e.internalBaseUrl = 'Required'
    if (!regForm.name) e.name = 'Required'
    else if (apis.some(a => a.id !== cloneSourceId && a.name.toLowerCase() === regForm.name.toLowerCase() && a.environment === regForm.environment)) e.name = `An API with this name already exists in ${regForm.environment}`
    if (!regForm.publicPath) e.publicPath = 'Required'
    else if (!/^\/proxy\/[a-zA-Z0-9_-]+$/.test(regForm.publicPath)) e.publicPath = 'Must be /proxy/<slug>'
    else if (apis.some(a => a.id !== cloneSourceId && a.publicPath.toLowerCase() === regForm.publicPath.toLowerCase() && a.environment === regForm.environment)) e.publicPath = `This path is already registered in ${regForm.environment}`
    if (!regForm.environment) e.environment = 'Required'
    if (!regForm.httpMethod) e.httpMethod = 'Required'
    if (!regForm.healthCheckUrlUnavailable && !regForm.healthCheckUrl.trim()) e.healthCheckUrl = 'Enter a URL or tick "No dedicated health endpoint"'
    setRegErrors(e)
    return Object.keys(e).length === 0
  }

  const REG_STEPS = ['endpoint', 'identity', 'routing', 'security'] as const

  function advanceRegStep() {
    const idx = REG_STEPS.indexOf(regStep)
    const e: Record<string, string> = {}
    if (regStep === 'endpoint') {
      if (!regForm.httpMethod)      e.httpMethod      = 'Select a method'
      if (!regForm.internalBaseUrl) e.internalBaseUrl = 'Required'
    } else if (regStep === 'identity') {
      if (!regForm.name) e.name = 'Required'
      else if (apis.some(a => a.id !== cloneSourceId && a.name.toLowerCase() === regForm.name.toLowerCase() && a.environment === regForm.environment)) e.name = `An API with this name already exists in ${regForm.environment}`
      if (!regForm.publicPath) e.publicPath = 'Required'
      else if (!/^\/proxy\/[a-zA-Z0-9_-]+$/.test(regForm.publicPath)) e.publicPath = 'Must be /proxy/<slug>'
      else if (apis.some(a => a.id !== cloneSourceId && a.publicPath.toLowerCase() === regForm.publicPath.toLowerCase() && a.environment === regForm.environment)) e.publicPath = `This path is already registered in ${regForm.environment}`
    } else if (regStep === 'routing') {
      if (!regForm.healthCheckUrlUnavailable && !regForm.healthCheckUrl.trim()) e.healthCheckUrl = 'Enter a URL or tick "No dedicated health endpoint"'
    }
    if (Object.keys(e).length) { setRegErrors(e); return }
    setRegErrors({})
    if (idx < REG_STEPS.length - 1) setRegStep(REG_STEPS[idx + 1])
  }

  function submitRegister() {
    if (!validateRegister()) return
    registerMutation.mutate({
      httpMethod: regForm.httpMethod,
      internalBaseUrl: regForm.internalBaseUrl,
      requestBodyTemplate: regForm.requestBodyTemplate || undefined,
      name: regForm.name,
      publicPath: regForm.publicPath,
      description: regForm.description || undefined,
      exposedDomain: regForm.exposedDomain || undefined,
      exposedPath: regForm.exposedPath || undefined,
      environment: regForm.environment,
      authRequired: regForm.authRequired,
      healthCheckUrl: regForm.healthCheckUrlUnavailable ? undefined : (regForm.healthCheckUrl || undefined),
      healthCheckIntervalSecs: regForm.healthCheckIntervalSecs ? Number(regForm.healthCheckIntervalSecs) : 60,
      upstreamAuthType: regForm.upstreamAuthType,
      upstreamAuthHeader: regForm.upstreamAuthType === 'API_KEY' ? regForm.upstreamAuthHeader : undefined,
      upstreamAuthValue: ['API_KEY', 'BEARER_TOKEN'].includes(regForm.upstreamAuthType) ? regForm.upstreamAuthValue : undefined,
      upstreamAuthUrl: regForm.upstreamAuthType === 'OAUTH2_PASSWORD' ? regForm.upstreamAuthUrl : undefined,
      upstreamAuthUsername: ['OAUTH2_PASSWORD', 'BASIC_AUTH'].includes(regForm.upstreamAuthType) ? regForm.upstreamAuthUsername : undefined,
      upstreamAuthPassword: ['OAUTH2_PASSWORD', 'BASIC_AUTH'].includes(regForm.upstreamAuthType) ? regForm.upstreamAuthPassword : undefined,
      upstreamClientId: regForm.upstreamAuthType === 'OAUTH2_PASSWORD' ? regForm.upstreamClientId || undefined : undefined,
      upstreamClientSecret: regForm.upstreamAuthType === 'OAUTH2_PASSWORD' ? regForm.upstreamClientSecret || undefined : undefined,
      tags: regForm.tags.length > 0 ? regForm.tags : undefined,
    } as Parameters<typeof registerApi>[0])
  }

  function validateEdit(): boolean {
    const e: Record<string, string> = {}
    if (!editForm.internalBaseUrl) e.internalBaseUrl = 'Required'
    if (!editForm.name) e.name = 'Required'
    if (!editForm.healthCheckUrlUnavailable && !editForm.healthCheckUrl.trim()) e.healthCheckUrl = 'Enter a URL or tick "No dedicated health endpoint"'
    setEditErrors(e)
    return Object.keys(e).length === 0
  }

  function submitEdit() {
    if (!editingApi || !validateEdit()) return
    updateMutation.mutate({
      id: editingApi.id,
      data: {
        httpMethod: editForm.httpMethod,
        internalBaseUrl: editForm.internalBaseUrl,
        requestBodyTemplate: editForm.requestBodyTemplate || undefined,
        name: editForm.name,
        description: editForm.description || undefined,
        exposedDomain: editForm.exposedDomain || undefined,
        exposedPath: editForm.exposedPath || undefined,
        environment: editForm.environment as import('../api/proxy').ProxyEnvironment,
        authRequired: editForm.authRequired,
        healthCheckUrl: editForm.healthCheckUrlUnavailable ? null : (editForm.healthCheckUrl.trim() || null),
        healthCheckIntervalSecs: editForm.healthCheckIntervalSecs ? Number(editForm.healthCheckIntervalSecs) : undefined,
        upstreamAuthType: editForm.upstreamAuthType as import('../api/proxy').UpstreamAuthType,
        upstreamAuthHeader: editForm.upstreamAuthType === 'API_KEY' ? editForm.upstreamAuthHeader : undefined,
        upstreamAuthValue: ['API_KEY', 'BEARER_TOKEN'].includes(editForm.upstreamAuthType) && editForm.upstreamAuthValue ? editForm.upstreamAuthValue : undefined,
        upstreamAuthUrl: editForm.upstreamAuthType === 'OAUTH2_PASSWORD' ? editForm.upstreamAuthUrl : undefined,
        upstreamAuthUsername: ['OAUTH2_PASSWORD', 'BASIC_AUTH'].includes(editForm.upstreamAuthType) ? editForm.upstreamAuthUsername : undefined,
        upstreamAuthPassword: ['OAUTH2_PASSWORD', 'BASIC_AUTH'].includes(editForm.upstreamAuthType) && editForm.upstreamAuthPassword ? editForm.upstreamAuthPassword : undefined,
        upstreamClientId: editForm.upstreamAuthType === 'OAUTH2_PASSWORD' ? editForm.upstreamClientId || undefined : undefined,
        upstreamClientSecret: editForm.upstreamAuthType === 'OAUTH2_PASSWORD' && editForm.upstreamClientSecret ? editForm.upstreamClientSecret : undefined,
        tags: editForm.tags,
      },
    })
  }

  function validateTransform(): boolean {
    const e: Record<string, string> = {}
    if (!txForm.name) e.name = 'Required'
    if (!txForm.transformType) e.transformType = 'Required'
    if (!txForm.config) e.config = 'Required'
    setTxErrors(e)
    return Object.keys(e).length === 0
  }

  function submitTransform() {
    if (!validateTransform()) return
    createTransformMutation.mutate({ name: txForm.name, transformType: txForm.transformType as Transform['transformType'], config: txForm.config, orderIndex: Number(txForm.orderIndex) || 0 })
  }

  function validateMock(): boolean {
    const e: Record<string, string> = {}
    if (!mockForm.method) e.method = 'Required'
    if (!mockForm.path) e.path = 'Required'
    if (!mockForm.responseStatus) e.responseStatus = 'Required'
    setMockErrors(e)
    return Object.keys(e).length === 0
  }

  function submitMock() {
    if (!validateMock()) return
    createMockMutation.mutate({ method: mockForm.method, path: mockForm.path, responseStatus: Number(mockForm.responseStatus), responseBody: mockForm.responseBody || undefined, latencyMs: Number(mockForm.latencyMs) || 0, priority: Number(mockForm.priority) || 0 })
  }

  function validateParam(): boolean {
    const e: Record<string, string> = {}
    if (!paramForm.paramName) e.paramName = 'Required'
    if (paramForm.paramSource === 'STATIC' && !paramForm.staticValue) e.staticValue = 'Required for static source'
    setParamErrors(e)
    return Object.keys(e).length === 0
  }

  function submitParam() {
    if (!validateParam()) return
    createParameterMutation.mutate({ paramName: paramForm.paramName, paramSource: paramForm.paramSource, paramType: paramForm.paramType, staticValue: paramForm.paramSource === 'STATIC' ? paramForm.staticValue : undefined, description: paramForm.description || undefined, required: paramForm.required, orderIndex: 0 })
  }

  function copyToClipboard(text: string) {
    clipboardCopy(text).then(() => toast.success('Copied!')).catch(() => toast.error('Copy failed'))
  }

  const apis = apisData?.content ?? []
  const allTags: ProxyApiTag[] = tagsData ?? []
  const filteredApis = apis.filter(api => {
    const matchesEnv    = activeEnvTab === 'all' || api.environment === activeEnvTab
    const matchesSearch = !sidebarSearch || api.name.toLowerCase().includes(sidebarSearch.toLowerCase()) || api.publicPath.toLowerCase().includes(sidebarSearch.toLowerCase())
    const matchesTag    = !activeTagFilter || (api.tags ?? []).includes(activeTagFilter)
    return matchesEnv && matchesSearch && matchesTag
  })
  const apisTotalElements = filteredApis.length
  const apisTotalPages    = Math.max(1, Math.ceil(filteredApis.length / API_PAGE_SIZE))

  useEffect(() => {
    if (!apis.length) return
    setApiOrder(prev => {
      const current = new Set(apis.map(a => a.id))
      const merged = [...prev.filter(id => current.has(id)), ...apis.map(a => a.id).filter(id => !prev.includes(id))]
      localStorage.setItem('pus-api-order', JSON.stringify(merged))
      return merged
    })
  }, [apisData])

  const sortedFilteredApis = [...filteredApis]
    .sort((a, b) => {
      const ai = apiOrder.indexOf(a.id)
      const bi = apiOrder.indexOf(b.id)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
    .slice(apisPage * API_PAGE_SIZE, (apisPage + 1) * API_PAGE_SIZE)

  function handleDragStart(id: string) { setDraggedId(id) }
  function handleDragOver(e: React.DragEvent, id: string) { e.preventDefault(); if (id !== draggedId) setDragOverId(id) }
  function handleDragEnd() { setDraggedId(null); setDragOverId(null) }
  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return }
    setApiOrder(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(draggedId)
      const toIdx = next.indexOf(targetId)
      if (fromIdx === -1 || toIdx === -1) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, draggedId)
      localStorage.setItem('pus-api-order', JSON.stringify(next))
      return next
    })
    setDraggedId(null)
    setDragOverId(null)
  }
  const callerParams = (parametersData ?? []).filter(p => p.paramSource === 'CALLER')

  const testPreviewUrl = useMemo(() => {
    if (!selectedApi) return ''
    const base = selectedApi.internalBaseUrl
    const queryParams = (parametersData ?? []).filter(p => p.paramType === 'QUERY')
    if (!queryParams.length) return base
    const parts = queryParams.map(p => {
      const val = p.paramSource === 'STATIC'          ? p.staticValue
                : p.paramSource === 'AUTO_UUID'       ? '{uuid}'
                : p.paramSource === 'AUTO_TIMESTAMP'  ? '{timestamp}'
                : (testParams[p.paramName] || `{${p.paramName}}`)
      return val ? `${encodeURIComponent(p.paramName)}=${encodeURIComponent(val)}` : null
    }).filter(Boolean)
    return parts.length ? `${base}?${parts.join('&')}` : base
  }, [selectedApi, parametersData, testParams])

  // ── Pagination bar ────────────────────────────────────────────────────────

  function PaginationBar({ page, totalPages, totalElements, onPage }: {
    page: number; totalPages: number; totalElements: number; onPage: (p: number) => void
  }) {
    const from = totalElements === 0 ? 0 : page * 10 + 1
    const to   = Math.min((page + 1) * 10, totalElements)
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 2px', borderTop: `1px solid ${isDark ? '#1e2a3a' : '#e5e7eb'}`, marginTop: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>
          {totalElements === 0 ? 'No records' : `${from}–${to} of ${totalElements}`}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
            style={{ padding: '3px 10px', fontSize: 12, borderRadius: 4, border: `1px solid ${isDark ? '#2d3748' : '#d1d5db'}`, background: page === 0 ? 'transparent' : (isDark ? '#1e2a3a' : '#f9fafb'), color: page === 0 ? 'var(--txt-3)' : 'var(--txt-1)', cursor: page === 0 ? 'not-allowed' : 'pointer' }}
          >← Prev</button>
          <span style={{ padding: '3px 8px', fontSize: 12, color: 'var(--txt-2)' }}>
            {page + 1} / {Math.max(totalPages, 1)}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => onPage(page + 1)}
            style={{ padding: '3px 10px', fontSize: 12, borderRadius: 4, border: `1px solid ${isDark ? '#2d3748' : '#d1d5db'}`, background: page >= totalPages - 1 ? 'transparent' : (isDark ? '#1e2a3a' : '#f9fafb'), color: page >= totalPages - 1 ? 'var(--txt-3)' : 'var(--txt-1)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
          >Next →</button>
        </div>
      </div>
    )
  }

  // ── Column definitions ────────────────────────────────────────────────────

  const openLogBody = useCallback(async (r: RequestLog, part: 'request' | 'response') => {
    if (!selectedApi) return
    setBodyFetchingId(r.id)
    try {
      const resp = await getLogBody(selectedApi.id, r.id)
      const body = part === 'request' ? resp.data.requestBody : resp.data.responseBody
      if (body) {
        const title = part === 'request'
          ? `Request Body — ${r.method} ${r.path}`
          : `Response Body — ${r.statusCode ?? '?'} ${r.method} ${r.path}`
        setBodyModal({ title, body })
      } else {
        toast.error('No body captured for this log entry')
      }
    } catch { toast.error('Failed to load body') }
    finally { setBodyFetchingId(null) }
  }, [selectedApi])

  const logColumns: Column<RequestLog>[] = [
    { key: 'method', title: 'Method', width: 80, render: (r) => <MethodChip method={r.method} /> },
    { key: 'path', title: 'Path', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.path}</span> },
    { key: 'status', title: 'Status', width: 76, render: (r) => {
      if (!r.statusCode) return <span>—</span>
      const c: 'green'|'orange'|'red' = r.statusCode < 300 ? 'green' : r.statusCode < 500 ? 'orange' : 'red'
      return <Tag color={c}>{r.statusCode}</Tag>
    }},
    { key: 'latency', title: 'Latency', width: 90, render: (r) => r.responseTimeMs != null
      ? <span style={{ color: r.responseTimeMs > 1000 ? 'var(--red)' : r.responseTimeMs > 300 ? 'var(--orange)' : 'var(--green)', fontSize: 12 }}>{r.responseTimeMs} ms</span>
      : <span>—</span>
    },
    { key: 'ip', title: 'IP', width: 125, render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.clientIp}</span> },
    { key: 'time', title: 'Time', width: 145, render: (r) => <span style={{ fontSize: 11 }}>{fmtTs(r.createdAt)}</span> },
    { key: 'reqBody', title: '', width: 32, render: (r) => {
      if (!r.hasRequestBody) return null
      const loading = bodyFetchingId === r.id
      return (
        <Btn variant="ghost" size="sm" icon={loading ? <Spin size={12} /> : <Code2 size={12} />} iconOnly
          title="View request body" disabled={loading}
          onClick={() => openLogBody(r, 'request')}
        />
      )
    }},
    { key: 'respBody', title: '', width: 32, render: (r) => {
      if (!r.hasResponseBody) return null
      const loading = bodyFetchingId === r.id
      const c: 'green'|'orange'|'red' = !r.statusCode ? 'green' : r.statusCode < 300 ? 'green' : r.statusCode < 500 ? 'orange' : 'red'
      const iconColor = loading ? 'var(--txt-3)' : c === 'green' ? 'var(--green)' : c === 'orange' ? 'var(--orange)' : 'var(--red)'
      return (
        <Btn variant="ghost" size="sm" icon={loading ? <Spin size={12} /> : <Code2 size={12} style={{ color: iconColor }} />} iconOnly
          title="View response body" disabled={loading}
          onClick={() => openLogBody(r, 'response')}
        />
      )
    }},
    { key: 'actions', title: 'Replay', width: 130, render: (r) => {
      const replaysForLog = (replaysData?.content ?? []).filter(rep => rep.originalLogId === r.id)
      const latest = replaysForLog[0]
      const isRunning = latest?.status === 'RUNNING'
      const statusColor = !latest ? undefined
        : latest.status === 'COMPLETED' && (latest.responseStatus ?? 0) < 300 ? { bg: '#dcfce7', txt: '#15803d' }
        : latest.status === 'COMPLETED' ? { bg: '#ffedd5', txt: '#c2410c' }
        : latest.status === 'RUNNING'   ? { bg: '#dbeafe', txt: '#1d4ed8' }
        : { bg: '#fee2e2', txt: '#b91c1c' }
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {latest && statusColor && (
            <span
              style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: statusColor.bg, color: statusColor.txt, whiteSpace: 'nowrap', cursor: latest.responseBody ? 'pointer' : 'default' }}
              title={latest.responseBody ? 'Click to view replay response' : undefined}
              onClick={() => latest.responseBody && setBodyModal({ title: `Replay Response — ${latest.status} ${latest.responseStatus ?? ''}`, body: latest.responseBody })}
            >
              {isRunning ? '…' : latest.status === 'COMPLETED' ? `✓ ${latest.responseStatus ?? '—'}` : `✗ ${latest.responseStatus ?? 'ERR'}`}
            </span>
          )}
          <Btn variant="ghost" size="sm" icon={<RotateCcw size={12} />} iconOnly
            loading={replayMutation.isPending && replayMutation.variables === r.id}
            disabled={!!latest}
            onClick={() => replayMutation.mutate(r.id)}
            title={latest ? 'Already replayed — re-triggering may cause unintended side effects on non-idempotent endpoints' : 'Replay this request'}
          />
        </div>
      )
    }},
  ]

  const TX_TYPE_ACCENT: Record<string, string> = {
    HEADER_INJECT: '#3b82f6', HEADER_STRIP: '#f97316',
    BODY_MASK: '#a855f7', BODY_FILTER: '#22c55e', STATUS_REMAP: '#ef4444',
  }

  function openEditTransform(t: Transform) {
    setEditingTransform(t)
    setTxEditForm({ config: t.config, orderIndex: String(t.orderIndex), enabled: t.enabled })
    setTxBodyTab('preview')
  }
  function submitTransformEdit() {
    if (!editingTransform) return
    updateTransformMutation.mutate({ id: editingTransform.id, data: { config: txEditForm.config, orderIndex: Number(txEditForm.orderIndex), enabled: txEditForm.enabled } })
  }

  function mockStatusAccent(status: number) {
    if (status >= 500) return '#ef4444'
    if (status >= 400) return '#f97316'
    if (status >= 300) return '#3b82f6'
    return '#22c55e'
  }
  function mockStatusColor(status: number) {
    if (status >= 500) return { bg: isDark ? '#3b0f0f' : '#fee2e2', text: isDark ? '#fca5a5' : '#b91c1c' }
    if (status >= 400) return { bg: isDark ? '#3b1f0a' : '#ffedd5', text: isDark ? '#fdba74' : '#c2410c' }
    if (status >= 300) return { bg: isDark ? '#0f2240' : '#dbeafe', text: isDark ? '#93c5fd' : '#1d4ed8' }
    return { bg: isDark ? '#0a2e1a' : '#dcfce7', text: isDark ? '#86efac' : '#15803d' }
  }

  const replayColumns: Column<ReplayRecord>[] = [
    { key: 'status', title: 'Status', width: 110, render: (r) => {
      const c: 'green'|'red'|'blue'|'muted' = r.status === 'COMPLETED' ? 'green' : r.status === 'FAILED' ? 'red' : r.status === 'RUNNING' ? 'blue' : 'muted'
      return <Tag color={c}>{r.status}</Tag>
    }},
    { key: 'http', title: 'HTTP', width: 70, render: (r) => <span>{r.responseStatus ?? '—'}</span> },
    { key: 'latency', title: 'Latency', width: 90, render: (r) => <span>{r.responseTimeMs != null ? `${r.responseTimeMs} ms` : '—'}</span> },
    { key: 'source', title: 'Source Request', render: (r) => {
      const srcLog = r.originalLogId ? (logsData?.content ?? []).find(l => l.id === r.originalLogId) : null
      if (!srcLog) return <span style={{ color: 'var(--txt-3)', fontSize: 11 }}>—</span>
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 10, color: METHOD_HEX[srcLog.method] ?? 'var(--txt-2)' }}>{srcLog.method}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{srcLog.path}</span>
          <span style={{ fontSize: 10, color: 'var(--txt-3)' }}>{fmtTs(srcLog.createdAt, 'HH:mm:ss')}</span>
        </div>
      )
    }},
    { key: 'time', title: 'Replayed At', width: 145, render: (r) => <span>{fmtTs(r.createdAt)}</span> },
    { key: 'actions', title: '', width: 50, render: (r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {r.responseBody && (
          <Btn variant="ghost" size="sm" icon={<Code2 size={12} />} iconOnly
            title="View response body"
            onClick={() => setBodyModal({ title: `Replay Response — ${r.status} ${r.responseStatus ?? ''}`, body: r.responseBody! })}
          />
        )}
        {r.originalLogId && (
          <Btn variant="ghost" size="sm" icon={<History size={12} />} iconOnly
            title="Jump to source log"
            onClick={() => { setHighlightedLogId(r.originalLogId!); setDetailTab('logs') }}
          />
        )}
      </div>
    )},
  ]

  const kongColumns: Column<KongSyncLog>[] = [
    { key: 'action', title: 'Action', width: 100, render: (r) => <Tag color="blue">{r.action}</Tag> },
    { key: 'status', title: 'Status', width: 90, render: (r) => <Tag color={r.status === 'SUCCESS' ? 'green' : 'red'}>{r.status}</Tag> },
    { key: 'service', title: 'Kong Service', render: (r) => r.kongServiceId
      ? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.kongServiceId}</span>
      : <span>—</span>
    },
    { key: 'error', title: 'Error', render: (r) => r.errorMessage
      ? <span style={{ fontSize: 11, color: 'var(--red)' }}>{r.errorMessage}</span>
      : <span>—</span>
    },
    { key: 'time', title: 'Time', width: 140, render: (r) => <span>{fmtTs(r.createdAt)}</span> },
  ]

  // ── Auth conditionals (shared between register & edit forms) ──────────────

  type AuthFields = {
    upstreamAuthHeader: string
    upstreamAuthValue: string
    upstreamAuthUrl: string
    upstreamAuthUsername: string
    upstreamAuthPassword: string
    upstreamClientId: string
    upstreamClientSecret: string
  }

  function renderAuthConditionals(
    authType: string,
    form: AuthFields,
    patchForm: (patch: Partial<AuthFields>) => void,
    isEdit = false,
  ) {
    if (authType === 'API_KEY') return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px', marginTop: 10 }}>
        <Inp label="Header Name" value={form.upstreamAuthHeader} onChangeValue={v => patchForm({ upstreamAuthHeader: v })} placeholder="X-API-Key" hint="HTTP header the proxy injects into upstream requests" style={{ fontFamily: 'monospace' }} />
        <Inp label="Key Value" type="password" value={form.upstreamAuthValue} onChangeValue={v => patchForm({ upstreamAuthValue: v })} placeholder={isEdit ? 'leave blank to keep' : ''} hint="Secret stored encrypted — never exposed to callers" />
      </div>
    )
    if (authType === 'BEARER_TOKEN') return (
      <div style={{ marginTop: 10 }}>
        <Inp label="Bearer Token" type="password" value={form.upstreamAuthValue} onChangeValue={v => patchForm({ upstreamAuthValue: v })} placeholder={isEdit ? 'leave blank to keep' : 'eyJ…'} hint="Sent as Authorization: Bearer <token> on every upstream request" style={{ fontFamily: 'monospace' }} />
      </div>
    )
    if (authType === 'BASIC_AUTH') return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px', marginTop: 10 }}>
        <Inp label="Username" value={form.upstreamAuthUsername} onChangeValue={v => patchForm({ upstreamAuthUsername: v })} hint="Upstream service account username" />
        <Inp label="Password" type="password" value={form.upstreamAuthPassword} onChangeValue={v => patchForm({ upstreamAuthPassword: v })} placeholder={isEdit ? 'leave blank to keep' : ''} hint="Stored encrypted — sent as Authorization: Basic on every request" />
      </div>
    )
    if (authType === 'OAUTH2_PASSWORD') return (
      <div style={{ marginTop: 10 }}>
        <Inp label="Token URL" value={form.upstreamAuthUrl} onChangeValue={v => patchForm({ upstreamAuthUrl: v })} placeholder="https://auth-server/oauth/token" hint="TAG posts credentials here to obtain and auto-refresh the bearer token" style={{ fontFamily: 'monospace' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px', marginTop: 8 }}>
          <Inp label="Username" value={form.upstreamAuthUsername} onChangeValue={v => patchForm({ upstreamAuthUsername: v })} hint="Service account username" />
          <Inp label="Password" type="password" value={form.upstreamAuthPassword} onChangeValue={v => patchForm({ upstreamAuthPassword: v })} placeholder={isEdit ? 'leave blank to keep' : ''} hint="Stored encrypted — used only for token exchange" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px', marginTop: 8 }}>
          <Inp label="Client ID" value={form.upstreamClientId} onChangeValue={v => patchForm({ upstreamClientId: v })} placeholder="client_id" hint="Sent as client_id in the token request (optional)" style={{ fontFamily: 'monospace' }} />
          <Inp label="Client Secret" type="password" value={form.upstreamClientSecret} onChangeValue={v => patchForm({ upstreamClientSecret: v })} placeholder={isEdit ? 'leave blank to keep' : ''} hint="Sent as client_secret in the token request (optional)" />
        </div>
      </div>
    )
    return null
  }

  // ── Tab content ───────────────────────────────────────────────────────────

  const panelBg = isDark ? colors.cardBg : '#f8fafc'
  const cardStyle: React.CSSProperties = { background: isDark ? colors.cardBg : 'white', border: '1px solid var(--border)', borderRadius: 8 }

  const overviewTab: TabItem = {
    key: 'overview',
    label: 'Overview',
    icon: <Settings size={12} />,
    children: selectedApi ? (
      <div style={{ padding: '14px 18px', overflowY: 'auto', height: '100%', background: panelBg }}>

        {/* Config cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          {[
            { label: 'Status', value: <Tag color={selectedApi.status === 'ACTIVE' ? 'green' : 'muted'}>{selectedApi.status}</Tag> },
            { label: 'Health', value: (() => { const h = (apiHealth?.overallStatus ?? selectedApi.healthStatus) as HealthStatus; return <Tag color={HEALTH_TAG_COLOR[h]}>{h}</Tag> })() },
            { label: 'Client Auth', value: selectedApi.authRequired
              ? <Tag color="blue"><Lock size={10} style={{ display: 'inline', marginRight: 3 }} />Required</Tag>
              : <Tag color="muted"><Unlock size={10} style={{ display: 'inline', marginRight: 3 }} />Open</Tag>
            },
            selectedApi.healthCheckUrl
              ? { label: 'Check Interval', value: <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{selectedApi.healthCheckIntervalSecs}s</span> }
              : {
                  label: 'Manual Status',
                  value: (
                    <Sel
                      value={selectedApi.healthStatus}
                      onChangeValue={v => setHealthStatusMutation.mutate({ id: selectedApi.id, status: v as HealthStatus })}
                      options={[
                        { value: 'UP', label: 'UP' },
                        { value: 'DEGRADED', label: 'DEGRADED' },
                        { value: 'DOWN', label: 'DOWN' },
                        { value: 'UNKNOWN', label: 'UNKNOWN' },
                      ]}
                    />
                  ),
                },
          ].map(({ label, value }) => (
            <div key={label} style={{ padding: '10px 12px', ...cardStyle }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--txt-3)', marginBottom: 5 }}>{label}</div>
              {value}
            </div>
          ))}
        </div>

        {/* Upstream auth */}
        <div style={{ padding: '10px 14px', ...cardStyle, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--txt-3)', marginBottom: 6 }}>Upstream Authentication</div>
          {(() => {
            const t = selectedApi.upstreamAuthType ?? 'NONE'
            if (t === 'NONE') return <Tag color="muted">None — open upstream</Tag>
            if (t === 'API_KEY') return <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Tag color="accent">API Key</Tag><code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{selectedApi.upstreamAuthHeader ?? 'X-API-Key'}</code></span>
            if (t === 'BEARER_TOKEN') return <Tag color="blue">Bearer Token (static)</Tag>
            if (t === 'BASIC_AUTH') return <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Tag color="accent">Basic Auth</Tag><span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-2)' }}>{selectedApi.upstreamAuthUsername}</span></span>
            if (t === 'OAUTH2_PASSWORD') return <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><Tag color="orange">OAuth2 Password</Tag><span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-2)' }}>{selectedApi.upstreamAuthUsername} @ {selectedApi.upstreamAuthUrl}</span></span>
            return <Tag color="muted">{t}</Tag>
          })()}
        </div>

        {/* Request body template */}
        {selectedApi.requestBodyTemplate && (
          <div style={{ padding: '10px 14px', ...cardStyle, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--txt-3)', marginBottom: 6 }}>Request Body Template</div>
            <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', background: panelBg, padding: '8px 10px', borderRadius: 6, maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--txt-1)' }}>
              {selectedApi.requestBodyTemplate}
            </pre>
          </div>
        )}

        {/* Details */}
        <div style={{ padding: '10px 14px', ...cardStyle, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--txt-3)', marginBottom: 8 }}>Details</div>
          {([
            { label: 'Proxy URL', value: `${envDomain(selectedApi.environment, platformConfig)}${selectedApi.publicPath}`, mono: true, copy: true },
            { label: 'Internal URL', value: selectedApi.internalBaseUrl, mono: true, copy: true },
            selectedApi.healthCheckUrl ? { label: 'Health Check URL', value: selectedApi.healthCheckUrl, mono: true, copy: false } : null,
            { label: 'Registered By', value: selectedApi.registeredBy ?? '—', mono: false, copy: false },
            { label: 'Created', value: fmtTsDateTime(selectedApi.createdAt), mono: false, copy: false },
            { label: 'Last Checked', value: (apiHealth?.lastCheckedAt ?? selectedApi.lastCheckedAt) ? dayjs(apiHealth?.lastCheckedAt ?? selectedApi.lastCheckedAt as string).fromNow() : 'Never', mono: false, copy: false },
          ] as ({ label: string; value: string; mono: boolean; copy: boolean } | null)[])
            .filter(Boolean)
            .map(item => item && (
              <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6, fontSize: 12 }}>
                <span style={{ width: 120, flexShrink: 0, color: 'var(--txt-3)', fontSize: 11 }}>{item.label}</span>
                <span style={{ fontFamily: item.mono ? 'monospace' : 'inherit', color: 'var(--txt-1)', wordBreak: 'break-all' }}>{item.value}</span>
                {item.copy && (
                  <button type="button" onClick={() => copyToClipboard(item.value)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', padding: 2, borderRadius: 4, display: 'flex' }}>
                    <Copy size={11} />
                  </button>
                )}
              </div>
            ))}
        </div>

        {/* Health history */}
        {apiHealth && (apiHealth.recentHistory ?? []).length > 0 && (
          <div style={{ padding: '10px 14px', ...cardStyle }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--txt-3)', marginBottom: 8 }}>Recent Health Checks</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {apiHealth.recentHistory.slice(0, 3).map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: isDark ? 'var(--surface-2)' : HEALTH_BG[h.status as HealthStatus], fontSize: 12 }}>
                  <HealthDot status={h.status as HealthStatus} />
                  <Tag color={HEALTH_TAG_COLOR[h.status as HealthStatus]}>{h.status}</Tag>
                  {h.httpStatusCode && <span style={{ fontSize: 11 }}>HTTP {h.httpStatusCode}</span>}
                  {h.responseTimeMs != null && <span style={{ fontSize: 11, color: 'var(--txt-2)' }}>{h.responseTimeMs} ms</span>}
                  {h.errorMessage && <span style={{ fontSize: 11, color: 'var(--red)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.errorMessage}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-3)' }}>{dayjs(h.checkedAt).format('HH:mm:ss')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : null,
  }

  const testTab: TabItem = {
    key: 'test',
    label: 'Test',
    icon: <FlaskConical size={12} />,
    children: selectedApi ? (
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

        {/* Request panel */}
        <div style={{ width: '42%', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: panelBg, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--txt-3)' }}>Request</div>
              <Btn variant="primary" size="sm" icon={<PlayCircle size={13} />} loading={testLoading} onClick={runTest}>
                Send Request
              </Btn>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {selectedApi.httpMethod && <MethodChip method={selectedApi.httpMethod} />}
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {testPreviewUrl}
              </span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px' }}>
            {callerParams.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Parameters</div>
                  {Object.values(testParams).some(v => v !== '') && (
                    <button onClick={() => { const cleared = Object.fromEntries(callerParams.map(p => [p.paramName, ''])); setTestParams(cleared); if (selectedApi) persistTestParams(selectedApi.id, cleared) }} style={{ fontSize: 10, fontWeight: 600, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px' }}>Clear</button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 12px' }}>
                  {callerParams.map(p => (
                    <div key={p.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <code style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-1)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{p.paramName}</code>
                        {p.required && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700, flexShrink: 0 }}>required</span>}
                        {p.description && <span style={{ fontSize: 10, color: 'var(--txt-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>}
                      </div>
                      <input
                        className="pus-input"
                        placeholder={`Enter ${p.paramName}`}
                        value={testParams[p.paramName] ?? ''}
                        onChange={e => setTestParams(prev => ({ ...prev, [p.paramName]: e.target.value }))}
                        style={{ fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(parametersData ?? []).filter(p => p.paramSource !== 'CALLER').length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 7 }}>Auto-managed</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  {(parametersData ?? []).filter(p => p.paramSource !== 'CALLER').map(p => (
                    <div key={p.id} style={{
                      padding: '7px 9px', borderRadius: 7,
                      background: panelBg, border: '1px solid var(--border)',
                      borderLeft: `3px solid ${PARAM_ACCENT[p.paramSource]}`,
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <code style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-1)', background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{p.paramName}</code>
                        <Tag color={PARAM_SOURCE_COLOR[p.paramSource]} style={{ fontSize: 8, margin: 0, flexShrink: 0 }}>{PARAM_SOURCE_LABEL[p.paramSource]}</Tag>
                      </div>
                      {p.paramSource === 'STATIC' && (
                        <span title={p.staticValue ?? ''} style={{ fontSize: 10, color: 'var(--txt-2)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.staticValue}</span>
                      )}
                      {p.paramSource === 'AUTO_UUID' && (
                        <span style={{ fontSize: 10, color: 'var(--txt-3)', fontStyle: 'italic' }}>random UUID</span>
                      )}
                      {p.paramSource === 'AUTO_TIMESTAMP' && (
                        <span style={{ fontSize: 10, color: 'var(--txt-3)', fontStyle: 'italic' }}>ISO timestamp</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!selectedApi.requestBodyTemplate && !callerParams.length && (
              <Alert type="info" description="No parameters defined. Define them in the Parameters tab to enable body building." />
            )}

            {selectedApi.requestBodyTemplate && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Template</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button
                      onClick={() => copyToClipboard(selectedApi.requestBodyTemplate!)}
                      title="Copy template"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 2, borderRadius: 3 }}
                    ><Copy size={12} /></button>
                    <button
                      onClick={() => setBodyModal({ title: 'Request Body Template', body: selectedApi.requestBodyTemplate! })}
                      title="Expand"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 2, borderRadius: 3 }}
                    ><Maximize2 size={12} /></button>
                  </div>
                </div>
                <JsonHighlight code={selectedApi.requestBodyTemplate} maxHeight={160} isDark={isDark} />
              </div>
            )}
          </div>

        </div>

        {/* Response panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Response header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: panelBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--txt-3)' }}>Response</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {testResult && !showSnapshots && (
                <button onClick={saveSnapshot} title="Save this response" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5, border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`, background: 'none', cursor: 'pointer', color: 'var(--txt-2)' }}>
                  <Copy size={11} /> Save
                </button>
              )}
              <button
                onClick={() => setShowSnapshots(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5, border: `1px solid ${showSnapshots ? (isDark ? '#2a3a5c' : '#bfdbfe') : (isDark ? '#30363d' : '#d0d7de')}`, background: showSnapshots ? (isDark ? '#1a2a4a' : '#eff6ff') : 'none', cursor: 'pointer', color: showSnapshots ? (isDark ? '#93c5fd' : '#1d4ed8') : 'var(--txt-3)' }}
              >
                <History size={11} />
                Saved{snapshots.length > 0 && <span style={{ background: isDark ? '#2a3a5c' : '#dbeafe', color: isDark ? '#93c5fd' : '#1d4ed8', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>{snapshots.length}</span>}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px' }}>

            {/* Snapshots list */}
            {showSnapshots && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--txt-3)', marginBottom: 4 }}>
                  {snapshots.length === 0 ? 'No saved responses yet — run a test and click Save.' : `${snapshots.length} saved response${snapshots.length !== 1 ? 's' : ''}`}
                </div>
                {snapshots.map(s => (
                  <div key={s.id} onClick={() => loadSnapshot(s)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: isDark ? colors.cardBg : 'white', borderLeft: `3px solid ${s.success ? '#22c55e' : '#ef4444'}` }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isDark ? '#1e2a3a' : '#f0f4ff'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isDark ? colors.cardBg : 'white'}
                  >
                    <Tag color={s.statusCode < 300 ? 'green' : s.statusCode < 500 ? 'orange' : 'red'} style={{ fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{s.statusCode}</Tag>
                    <span style={{ fontSize: 11, color: 'var(--txt-3)', flexShrink: 0 }}>{s.responseTimeMs}ms</span>
                    <span style={{ fontSize: 11, color: 'var(--txt-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                      {s.responseBody ? s.responseBody.replace(/\s+/g, ' ').slice(0, 80) : '(empty)'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--txt-3)', flexShrink: 0 }}>{dayjs(s.savedAt).format('D MMM HH:mm')}</span>
                    <button onClick={e => { e.stopPropagation(); deleteSnapshot(s.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', padding: 2, display: 'flex', flexShrink: 0 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Normal response view */}
            {!showSnapshots && (
              <>
                {testLoading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Spin /></div>}

                {!testLoading && !testResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: 'var(--txt-3)' }}>
                    <PlayCircle size={32} style={{ opacity: 0.5 }} />
                    <span style={{ fontSize: 13 }}>Hit Send to see the response</span>
                  </div>
                )}

                {!testLoading && testResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: testResult.success ? (isDark ? '#052e1a' : '#f0fdf4') : (isDark ? '#2a0a0a' : '#fef2f2'), border: `1px solid ${testResult.success ? '#86efac' : '#fca5a5'}` }}>
                      {testResult.success ? <CheckCircle2 size={16} color="var(--green)" /> : <XCircle size={16} color="var(--red)" />}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {testResult.statusCode && (
                          <Tag color={testResult.statusCode < 300 ? 'green' : testResult.statusCode < 500 ? 'orange' : 'red'} style={{ fontWeight: 700, fontSize: 13 }}>{testResult.statusCode}</Tag>
                        )}
                        <span style={{ fontSize: 12, color: testResult.responseTimeMs > 1000 ? 'var(--red)' : 'var(--txt-2)' }}>{testResult.responseTimeMs} ms</span>
                      </div>
                      {testResult.errorMessage && <span style={{ fontSize: 11, color: 'var(--red)', flex: 1 }}>{testResult.errorMessage}</span>}
                    </div>

                    {testResult.requestBodySent && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--txt-3)' }}>Request Sent</span>
                          <button
                            onClick={() => setBodyModal({ title: 'Request Sent', body: testResult.requestBodySent! })}
                            title="Expand"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 2, borderRadius: 3 }}
                          ><Maximize2 size={12} /></button>
                        </div>
                        <JsonHighlight code={testResult.requestBodySent!} maxHeight={140} isDark={isDark} />
                      </div>
                    )}

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--txt-3)' }}>Response Body</span>
                        {testResult.responseBody && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <button
                              onClick={() => copyToClipboard(testResult.responseBody!)}
                              title="Copy response"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 2, borderRadius: 3 }}
                            ><Copy size={12} /></button>
                            <button
                              onClick={() => setBodyModal({ title: 'Response Body', body: testResult.responseBody! })}
                              title="Expand"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 2, borderRadius: 3 }}
                            ><Maximize2 size={12} /></button>
                          </div>
                        )}
                      </div>
                      {testResult.responseBody
                        ? <JsonHighlight code={testResult.responseBody} maxHeight={320} isDark={isDark} />
                        : <span style={{ fontSize: 11, color: 'var(--txt-3)', fontFamily: 'monospace' }}>(empty)</span>
                      }
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    ) : null,
  }

  const parametersTab: TabItem = {
    key: 'parameters',
    label: 'Parameters',
    icon: <Code2 size={12} />,
    children: selectedApi ? (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* Hint / warning bar */}
        {selectedApi.requestBodyTemplate ? (
          <div style={{ padding: '7px 16px', borderBottom: '1px solid var(--border)', background: isDark ? '#0c1929' : '#eff6ff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: isDark ? '#93c5fd' : '#1d4ed8' }}>
            <Info size={12} style={{ flexShrink: 0 }} />
            <span>Use <code style={{ background: isDark ? '#1e3a5f' : '#dbeafe', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>{'{{paramName}}'}</code> in the template.&nbsp;&nbsp;Built-ins: <code style={{ fontFamily: 'monospace' }}>{'{{$guid}}'}</code> · <code style={{ fontFamily: 'monospace' }}>{'{{$timestamp}}'}</code></span>
          </div>
        ) : (
          <div style={{ padding: '7px 16px', borderBottom: '1px solid var(--border)', background: isDark ? '#1a1100' : '#fffbeb', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: isDark ? '#fcd34d' : '#92400e' }}>
            <AlertTriangle size={12} style={{ flexShrink: 0 }} />
            <span>No body template set — open Edit and add a Request Body Template to use parameters.</span>
          </div>
        )}

        {/* Add parameter form */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: isDark ? colors.cardBg : 'white', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--txt-3)', marginBottom: 10 }}>Add Parameter</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            {/* Type toggle */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Type</div>
              <div style={{ display: 'flex', borderRadius: 7, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {(['BODY', 'QUERY'] as ParameterType[]).map(t => (
                  <button key={t} onClick={() => setParamForm(f => ({ ...f, paramType: t }))} style={{
                    padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: paramForm.paramType === t ? (t === 'QUERY' ? 'var(--accent)' : ACCENT) : 'var(--surface-2)',
                    color: paramForm.paramType === t ? '#fff' : 'var(--txt-2)',
                    transition: 'background 0.15s',
                  }}>{t === 'BODY' ? '{ } Body' : '? Query'}</button>
                ))}
              </div>
            </div>
            {/* Name */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Name</div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ padding: '6px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '7px 0 0 7px', fontSize: 12, color: 'var(--txt-3)', fontFamily: 'monospace', lineHeight: 1 }}>{paramForm.paramType === 'QUERY' ? '?' : '{{'}</span>
                <input className="pus-input" value={paramForm.paramName} onChange={e => setParamForm(f => ({ ...f, paramName: e.target.value.trim() }))} placeholder="paramName" style={{ width: 130, borderRadius: 0, fontFamily: 'monospace', border: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none' }} />
                <span style={{ padding: '6px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 7px 7px 0', fontSize: 12, color: 'var(--txt-3)', fontFamily: 'monospace', lineHeight: 1 }}>{paramForm.paramType === 'QUERY' ? '=…' : '}}'}</span>
              </div>
              {paramErrors.paramName && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>{paramErrors.paramName}</div>}
            </div>
            <Sel label="Source" value={paramForm.paramSource} onChangeValue={v => setParamForm(f => ({ ...f, paramSource: v as ParameterSource }))}
              options={[
                { value: 'CALLER',         label: 'Caller — supplied at runtime' },
                { value: 'STATIC',         label: 'Static — fixed value' },
                { value: 'AUTO_UUID',      label: 'Auto UUID' },
                { value: 'AUTO_TIMESTAMP', label: 'Auto Timestamp' },
              ]} style={{ width: 200 }} />
            {paramForm.paramSource === 'STATIC' && (
              <Inp label="Static Value" value={paramForm.staticValue} onChangeValue={v => setParamForm(f => ({ ...f, staticValue: v }))} error={paramErrors.staticValue} placeholder="the fixed value" style={{ width: 140, fontFamily: 'monospace' }} />
            )}
            <Inp label="Description" value={paramForm.description} onChangeValue={v => setParamForm(f => ({ ...f, description: v }))} placeholder="Optional note" style={{ width: 170 }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Required</div>
              <Switch size="sm" checked={paramForm.required} onChange={v => setParamForm(f => ({ ...f, required: v }))} />
            </div>
            <Btn variant="primary" icon={<Plus size={13} />} loading={createParameterMutation.isPending} onClick={submitParam}>Add</Btn>
          </div>
        </div>

        {/* Parameter cards */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', background: panelBg }}>
          {parametersLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spin /></div>}
          {!parametersLoading && (parametersData ?? []).length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 8, color: 'var(--txt-3)' }}>
              <Code2 size={30} style={{ opacity: 0.25 }} />
              <span style={{ fontSize: 13 }}>No parameters yet — add them above</span>
            </div>
          )}
          {!parametersLoading && (parametersData ?? []).filter(p => p.paramSource === 'CALLER').length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#3b82f6', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
                Caller — supplied at runtime
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {(parametersData ?? []).filter(p => p.paramSource === 'CALLER').map(p => {
                  const accent = PARAM_ACCENT[p.paramSource]
                  return (
                    <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 14, alignItems: 'center', padding: '11px 14px', background: isDark ? colors.cardBg : 'white', border: '1px solid var(--border)', borderLeft: `3px solid ${accent}`, borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {p.paramType === 'QUERY'
                          ? <code style={{ fontSize: 12, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', background: `${accent}15`, color: accent, padding: '3px 9px', borderRadius: 5, border: `1px solid ${accent}35`, whiteSpace: 'nowrap' }}>{`?${p.paramName}=…`}</code>
                          : <code style={{ fontSize: 12, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', background: `${accent}15`, color: accent, padding: '3px 9px', borderRadius: 5, border: `1px solid ${accent}35`, whiteSpace: 'nowrap' }}>{`{{${p.paramName}}}`}</code>
                        }
                        <Tag color={p.paramType === 'QUERY' ? 'accent' : 'muted'} style={{ fontSize: 9, margin: 0 }}>{p.paramType ?? 'BODY'}</Tag>
                        {p.description && <span style={{ fontSize: 11, color: 'var(--txt-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <Tag color={PARAM_SOURCE_COLOR[p.paramSource]} style={{ fontSize: 10, fontWeight: 600 }}>{PARAM_SOURCE_LABEL[p.paramSource]}</Tag>
                        <span style={{ fontSize: 11, color: 'var(--txt-3)', fontStyle: 'italic' }}>supplied by caller</span>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {p.required
                          ? <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: 10 }}>required</span>
                          : <span style={{ fontSize: 10, color: 'var(--txt-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 10 }}>optional</span>
                        }
                      </div>
                      <Confirm title={`Remove {{${p.paramName}}}?`} danger onConfirm={() => deleteParameterMutation.mutate(p.id)}>
                        <Btn variant="danger" size="sm" icon={<Trash2 size={13} />} iconOnly />
                      </Confirm>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {!parametersLoading && (parametersData ?? []).filter(p => p.paramSource !== 'CALLER').length > 0 && (
            <div>
              {(parametersData ?? []).filter(p => p.paramSource === 'CALLER').length > 0 && (
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--txt-3)', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--txt-3)', display: 'inline-block' }} />
                  Auto-managed
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(parametersData ?? []).filter(p => p.paramSource !== 'CALLER').map(p => {
                  const accent = PARAM_ACCENT[p.paramSource]
                  return (
                    <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 14, alignItems: 'center', padding: '11px 14px', background: isDark ? colors.cardBg : 'white', border: '1px solid var(--border)', borderLeft: `3px solid ${accent}`, borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {p.paramType === 'QUERY'
                          ? <code style={{ fontSize: 12, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', background: `${accent}15`, color: accent, padding: '3px 9px', borderRadius: 5, border: `1px solid ${accent}35`, whiteSpace: 'nowrap' }}>{`?${p.paramName}=…`}</code>
                          : <code style={{ fontSize: 12, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', background: `${accent}15`, color: accent, padding: '3px 9px', borderRadius: 5, border: `1px solid ${accent}35`, whiteSpace: 'nowrap' }}>{`{{${p.paramName}}}`}</code>
                        }
                        <Tag color={p.paramType === 'QUERY' ? 'accent' : 'muted'} style={{ fontSize: 9, margin: 0 }}>{p.paramType ?? 'BODY'}</Tag>
                        {p.description && <span style={{ fontSize: 11, color: 'var(--txt-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <Tag color={PARAM_SOURCE_COLOR[p.paramSource]} style={{ fontSize: 10, fontWeight: 600 }}>{PARAM_SOURCE_LABEL[p.paramSource]}</Tag>
                        {p.paramSource === 'STATIC'         && <code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4, color: 'var(--txt-1)', border: '1px solid var(--border)', fontFamily: 'monospace' }}>{p.staticValue}</code>}
                        {p.paramSource === 'AUTO_UUID'      && <span style={{ fontSize: 11, color: 'var(--txt-3)', fontStyle: 'italic' }}>random UUID per request</span>}
                        {p.paramSource === 'AUTO_TIMESTAMP' && <span style={{ fontSize: 11, color: 'var(--txt-3)', fontStyle: 'italic' }}>ISO timestamp per request</span>}
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {p.required
                          ? <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: 10 }}>required</span>
                          : <span style={{ fontSize: 10, color: 'var(--txt-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 10 }}>optional</span>
                        }
                      </div>
                      <Confirm title={`Remove {{${p.paramName}}}?`} danger onConfirm={() => deleteParameterMutation.mutate(p.id)}>
                        <Btn variant="danger" size="sm" icon={<Trash2 size={13} />} iconOnly />
                      </Confirm>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    ) : null,
  }

  const logsTab: TabItem = {
    key: 'logs',
    label: 'Logs',
    icon: <History size={12} />,
    children: selectedApi ? (
      <div style={{ padding: '8px 12px', background: panelBg, height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
          <input
            value={logsSearchInput}
            onChange={e => { setLogsSearchInput(e.target.value); setLogsPage(0) }}
            placeholder="Search by txGuid, IP address, or any request body field…"
            style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: logsSearch ? 28 : 10, paddingTop: 6, paddingBottom: 6, fontSize: 12, background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${isDark ? '#2a3a5c' : '#e2e8f0'}`, borderRadius: 6, color: 'var(--txt-1)', outline: 'none' }}
          />
          {logsSearchInput && (
            <button onClick={() => { setLogsSearchInput(''); setLogsSearch(''); setLogsPage(0) }} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 2 }}>
              <X size={12} />
            </button>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <Tbl
            columns={logColumns}
            data={logsData?.content ?? []}
            loading={logsLoading}
            rowKey="id"
            emptyText={logsSearchInput ? `No logs matching "${logsSearchInput}"` : 'No request logs yet'}
            onRow={(r) => ({
              style: highlightedLogId === r.id ? {
                background: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.10)',
                outline: '1px solid rgba(99,102,241,0.5)',
                outlineOffset: '-1px',
              } : undefined,
              onClick: highlightedLogId === r.id ? () => setHighlightedLogId(null) : undefined,
            })}
          />
        </div>
        <PaginationBar
          page={logsPage}
          totalPages={logsData?.totalPages ?? 0}
          totalElements={logsData?.totalElements ?? 0}
          onPage={p => { setLogsPage(p); setHighlightedLogId(null) }}
        />
      </div>
    ) : null,
  }

  const transformsTab: TabItem = {
    key: 'transforms',
    label: 'Transforms',
    icon: <Settings size={12} />,
    children: selectedApi ? (
      <div style={{ padding: '8px 12px', background: panelBg, height: '100%', overflowY: 'auto' }}>
        {/* Info toggle */}
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setShowTxInfo(v => !v)} title="What are Transforms?" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: showTxInfo ? (isDark ? '#93c5fd' : '#1d4ed8') : 'var(--txt-3)', fontSize: 11, padding: '2px 4px', borderRadius: 4 }}>
            <Info size={13} />
            <span>What are Transforms?</span>
          </button>
        </div>
        {showTxInfo && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: isDark ? '#1a2035' : '#f0f4ff', border: `1px solid ${isDark ? '#2a3a5c' : '#c7d7f8'}`, borderRadius: 8, fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: 'var(--txt-1)', marginBottom: 4 }}>What are Transforms?</div>
            <div>
              After TAG receives the upstream response, transforms run <em>in order</em> to modify it before it reaches the caller.
              Use them to inject or strip headers, mask sensitive fields, filter the response body, or remap HTTP status codes.
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {[
                { type: 'HEADER_INJECT', desc: 'Add a header to the response', example: '{"key":"X-Tenant","value":"zw"}' },
                { type: 'HEADER_STRIP',  desc: 'Remove a header from the response', example: '{"key":"Authorization"}' },
                { type: 'BODY_MASK',     desc: 'Redact a field value', example: '{"field":"client_secret"}' },
                { type: 'BODY_FILTER',   desc: 'Keep or drop response fields', example: '{"keep":["access_token","expires_in"]}' },
                { type: 'STATUS_REMAP',  desc: 'Change the HTTP status code', example: '{"from":401,"to":403}' },
              ].map(t => (
                <span key={t.type} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <code style={{ fontSize: 10, fontWeight: 700, background: isDark ? '#2a3a5c' : '#dbeafe', color: isDark ? '#93c5fd' : '#1d4ed8', padding: '1px 5px', borderRadius: 3 }}>{t.type}</code>
                  <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>{t.desc}</span>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 6, color: 'var(--txt-3)', fontSize: 11 }}>
              If your upstream already returns the shape the caller expects, you don't need any transforms.
            </div>
          </div>
        )}
        {/* Add transform form */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12, padding: '10px 12px', background: isDark ? colors.cardBg : 'white', borderRadius: 8, border: '1px solid var(--border)' }}>
          <Inp
            label="Name"
            value={txForm.name}
            onChangeValue={v => setTxForm(f => ({ ...f, name: v }))}
            error={txErrors.name}
            placeholder="Name"
            style={{ width: 130 }}
          />
          <Sel
            label="Type"
            value={txForm.transformType}
            onChangeValue={v => setTxForm(f => ({ ...f, transformType: v }))}
            error={txErrors.transformType}
            options={TRANSFORM_TYPES.map(t => ({ value: t, label: t }))}
            placeholder="Type"
            style={{ width: 150 }}
          />
          <Inp
            label='Config (JSON)'
            value={txForm.config}
            onChangeValue={v => setTxForm(f => ({ ...f, config: v }))}
            error={txErrors.config}
            placeholder='{"key":"X-Tenant"}'
            style={{ width: 220, fontFamily: 'monospace' }}
          />
          <Inp
            label="Order"
            type="number"
            value={txForm.orderIndex}
            onChangeValue={v => setTxForm(f => ({ ...f, orderIndex: v }))}
            style={{ width: 65 }}
          />
          <Btn variant="primary" size="sm" icon={<Plus size={13} />} loading={createTransformMutation.isPending} onClick={submitTransform}>Add</Btn>
        </div>

        {/* Transform cards */}
        {transformsLoading ? <Spin /> : (transformsData?.content ?? []).length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--txt-3)', fontSize: 12, padding: '32px 0' }}>No transforms configured</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(transformsData?.content ?? []).map(t => {
              const accent = TX_TYPE_ACCENT[t.transformType] ?? '#64748b'
              return (
                <div key={t.id} style={{ borderRadius: 8, border: `1px solid ${t.enabled ? (isDark ? `${accent}40` : `${accent}30`) : 'var(--border)'}`, background: isDark ? colors.cardBg : 'white', borderLeft: `3px solid ${accent}`, opacity: t.enabled ? 1 : 0.45, transition: 'opacity 0.2s, border-color 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: accent, width: 22, textAlign: 'center', flexShrink: 0, opacity: 0.85 }}>#{t.orderIndex}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: accent, color: 'white', padding: '2px 8px', borderRadius: 4, flexShrink: 0, fontFamily: 'monospace', letterSpacing: '0.03em', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>{t.transformType}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-1)', flex: 1 }}>{t.name}</span>
                    <code style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#475569', fontFamily: 'monospace', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{t.config}</code>
                    <button
                      onClick={() => toggleTransformMutation.mutate({ id: t.id, enabled: !t.enabled })}
                      title={t.enabled ? 'Disable' : 'Enable'}
                      style={{ flexShrink: 0, background: t.enabled ? '#22c55e' : 'var(--surface-2)', border: 'none', borderRadius: 12, width: 36, height: 20, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                    >
                      <span style={{ position: 'absolute', top: 3, left: t.enabled ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                    </button>
                    <Btn variant="ghost" size="sm" icon={<Pencil size={12} />} iconOnly onClick={() => openEditTransform(t)} style={{ flexShrink: 0 }} />
                    <Confirm title="Delete transform?" danger onConfirm={() => deleteTransformMutation.mutate(t.id)}>
                      <Btn variant="danger" size="sm" icon={<Trash2 size={12} />} iconOnly style={{ flexShrink: 0 }} />
                    </Confirm>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Edit transform modal */}
        <Modal
          open={!!editingTransform}
          onClose={() => setEditingTransform(null)}
          title={editingTransform
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt-1)' }}>Edit Transform</span>
                <span style={{ fontSize: 11, fontWeight: 700, background: TX_TYPE_ACCENT[editingTransform.transformType] ?? '#64748b', color: 'white', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace', letterSpacing: '0.03em', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>{editingTransform.transformType}</span>
                <span style={{ fontSize: 13, color: 'var(--txt-2)' }}>{editingTransform.name}</span>
              </div>
            : null}
          width={540}
          footer={<>
            <Btn variant="ghost" size="sm" onClick={() => setEditingTransform(null)}>Cancel</Btn>
            <Btn variant="primary" size="sm" loading={updateTransformMutation.isPending} onClick={submitTransformEdit}>Save changes</Btn>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Order</div>
                <input type="number" value={txEditForm.orderIndex} onChange={e => setTxEditForm(f => ({ ...f, orderIndex: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-1)', color: 'var(--txt-1)', fontSize: 13, fontFamily: 'monospace', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, border: `1px solid ${txEditForm.enabled ? (isDark ? '#166534' : '#bbf7d0') : 'var(--border)'}`, transition: 'border-color 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: txEditForm.enabled ? '#22c55e' : 'var(--txt-3)', transition: 'background 0.2s' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-1)' }}>{txEditForm.enabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <Switch checked={txEditForm.enabled} onChange={v => setTxEditForm(f => ({ ...f, enabled: v }))} />
                </div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Config (JSON)</span>
                <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 6, padding: 2, gap: 2 }}>
                  {(['edit', 'preview'] as const).map(tab => (
                    <button key={tab} onClick={() => setTxBodyTab(tab)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', background: txBodyTab === tab ? (isDark ? '#2a3a5c' : 'white') : 'transparent', color: txBodyTab === tab ? (isDark ? '#93c5fd' : '#1d4ed8') : 'var(--txt-3)', transition: 'all 0.15s' }}>
                      {tab === 'edit' ? 'Edit' : 'Preview'}
                    </button>
                  ))}
                </div>
              </div>
              {txBodyTab === 'edit' ? (
                <textarea value={txEditForm.config} onChange={e => setTxEditForm(f => ({ ...f, config: e.target.value }))} rows={6} spellCheck={false}
                  style={{ width: '100%', boxSizing: 'border-box', fontFamily: '"JetBrains Mono","Fira Code",monospace', fontSize: 12, background: isDark ? '#0d1117' : '#f6f8fa', color: isDark ? '#e6edf3' : '#24292f', border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`, borderRadius: 8, padding: '10px 14px', resize: 'vertical', outline: 'none', lineHeight: 1.65 }}
                  placeholder='{"key":"value"}' />
              ) : (
                <JsonHighlight code={txEditForm.config || '{}'} maxHeight={180} isDark={isDark} />
              )}
            </div>
          </div>
        </Modal>
      </div>
    ) : null,
  }

  const mocksTab: TabItem = {
    key: 'mocks',
    label: 'Mocks',
    icon: <Bug size={12} />,
    children: selectedApi ? (
      <div style={{ padding: '8px 12px', background: panelBg, height: '100%', overflowY: 'auto' }}>
        {/* Info toggle */}
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setShowMockInfo(v => !v)} title="What are Mocks?" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: showMockInfo ? (isDark ? '#93c5fd' : '#1d4ed8') : 'var(--txt-3)', fontSize: 11, padding: '2px 4px', borderRadius: 4 }}>
            <Info size={13} />
            <span>What are Mocks?</span>
          </button>
        </div>
        {showMockInfo && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: isDark ? '#1a2035' : '#f0f4ff', border: `1px solid ${isDark ? '#2a3a5c' : '#c7d7f8'}`, borderRadius: 8, fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: 'var(--txt-1)', marginBottom: 4 }}>What are Mocks?</div>
            <div>
              When an API is in <strong>sandbox</strong> environment, TAG intercepts the request and returns the mock response you define here — the real upstream is never called.
              Use mocks to simulate responses during development or testing without burning real API calls.
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
              {[
                { label: 'Method + Path', desc: 'Matches the incoming request e.g. POST /' },
                { label: 'HTTP Status', desc: 'Status code to return e.g. 200, 401, 500' },
                { label: 'Response Body', desc: 'JSON body returned to the caller' },
                { label: 'Latency ms', desc: 'Simulated delay before responding' },
              ].map(f => (
                <span key={f.label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <code style={{ fontSize: 10, fontWeight: 700, background: isDark ? '#2a3a5c' : '#dbeafe', color: isDark ? '#93c5fd' : '#1d4ed8', padding: '1px 5px', borderRadius: 3 }}>{f.label}</code>
                  <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>{f.desc}</span>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 6, color: 'var(--txt-3)', fontSize: 11 }}>
              Only active when the API environment is set to <strong>sandbox</strong>. Switch to <strong>prod</strong> or <strong>dev</strong> to hit the real upstream.
            </div>
          </div>
        )}
        {/* Add mock form */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12, padding: '10px 12px', background: isDark ? colors.cardBg : 'white', borderRadius: 8, border: '1px solid var(--border)' }}>
          <Sel
            label="Method"
            value={mockForm.method}
            onChangeValue={v => setMockForm(f => ({ ...f, method: v }))}
            error={mockErrors.method}
            options={HTTP_METHODS.map(m => ({ value: m, label: m }))}
            placeholder="Method"
            style={{ width: 85 }}
          />
          <Inp
            label="Path"
            value={mockForm.path}
            onChangeValue={v => setMockForm(f => ({ ...f, path: v }))}
            error={mockErrors.path}
            placeholder="/endpoint"
            style={{ width: 160 }}
          />
          <Inp
            label="HTTP Status"
            type="number"
            value={mockForm.responseStatus}
            onChangeValue={v => setMockForm(f => ({ ...f, responseStatus: v }))}
            error={mockErrors.responseStatus}
            placeholder="200"
            style={{ width: 68 }}
          />
          <Inp
            label='Response Body'
            value={mockForm.responseBody}
            onChangeValue={v => setMockForm(f => ({ ...f, responseBody: v }))}
            placeholder='{"ok":true}'
            style={{ width: 120 }}
          />
          <Inp
            label="Latency ms"
            type="number"
            value={mockForm.latencyMs}
            onChangeValue={v => setMockForm(f => ({ ...f, latencyMs: v }))}
            placeholder="0"
            style={{ width: 90 }}
          />
          <Inp
            label="Priority"
            type="number"
            value={mockForm.priority}
            onChangeValue={v => setMockForm(f => ({ ...f, priority: v }))}
            placeholder="0"
            style={{ width: 70 }}
          />
          <Btn variant="primary" size="sm" icon={<Plus size={13} />} loading={createMockMutation.isPending} onClick={submitMock}>Add</Btn>
        </div>

        {/* Mock cards */}
        {mocksLoading ? <Spin /> : (mocksData?.content ?? []).length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--txt-3)', fontSize: 12, padding: '32px 0' }}>No mocks configured</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(mocksData?.content ?? []).map(m => {
              const accent = mockStatusAccent(m.responseStatus)
              const statusColors = mockStatusColor(m.responseStatus)
              return (
                <div key={m.id} style={{ borderRadius: 8, border: '1px solid var(--border)', background: isDark ? colors.cardBg : 'white', borderLeft: `3px solid ${accent}`, opacity: m.enabled ? 1 : 0.5, transition: 'opacity 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                    {/* Priority */}
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-3)', width: 20, textAlign: 'center', flexShrink: 0 }}>P{m.priority}</span>
                    {/* Method */}
                    <MethodChip method={m.method} />
                    {/* Path */}
                    <code style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--txt-1)', flex: 1 }}>{m.path}</code>
                    {/* Status badge */}
                    <span style={{ fontSize: 11, fontWeight: 700, background: statusColors.bg, color: statusColors.text, padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>{m.responseStatus}</span>
                    {/* Latency */}
                    <span style={{ fontSize: 11, color: 'var(--txt-3)', width: 60, textAlign: 'right', flexShrink: 0 }}>{m.latencyMs > 0 ? `${m.latencyMs} ms` : '—'}</span>
                    {/* On/Off toggle */}
                    <button
                      onClick={() => updateMockMutation.mutate({ id: m.id, data: { enabled: !m.enabled } })}
                      title={m.enabled ? 'Disable mock' : 'Enable mock'}
                      style={{ flexShrink: 0, background: m.enabled ? '#22c55e' : 'var(--surface-2)', border: 'none', borderRadius: 12, width: 36, height: 20, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                    >
                      <span style={{ position: 'absolute', top: 3, left: m.enabled ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                    </button>
                    {/* Edit */}
                    <Btn variant="ghost" size="sm" icon={<Pencil size={12} />} iconOnly onClick={() => openEditMock(m)} style={{ flexShrink: 0 }} />
                    {/* Delete */}
                    <Confirm title="Delete mock?" danger onConfirm={() => deleteMockMutation.mutate(m.id)}>
                      <Btn variant="danger" size="sm" icon={<Trash2 size={12} />} iconOnly style={{ flexShrink: 0 }} />
                    </Confirm>
                  </div>
                  {m.responseBody && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '6px 14px 8px', fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.responseBody}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Edit modal */}
        <Modal
          open={!!editingMock}
          onClose={() => setEditingMock(null)}
          title={editingMock
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt-1)' }}>Edit Mock</span>
                <MethodChip method={editingMock.method} />
                <code style={{ fontSize: 12, background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 4, color: 'var(--txt-1)' }}>{editingMock.path}</code>
              </div>
            : null}
          width={560}
          footer={<>
            <Btn variant="ghost" size="sm" onClick={() => setEditingMock(null)}>Cancel</Btn>
            <Btn variant="primary" size="sm" loading={updateMockMutation.isPending} onClick={submitMockEdit}>Save changes</Btn>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Metrics row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                { label: 'HTTP Status', field: 'responseStatus', hint: mockEditForm.responseStatus ? (() => { const s = Number(mockEditForm.responseStatus); const c = mockStatusColor(s); return <span style={{ fontSize: 10, fontWeight: 700, background: c.bg, color: c.text, padding: '1px 6px', borderRadius: 3 }}>{s >= 500 ? 'Server Error' : s >= 400 ? 'Client Error' : s >= 300 ? 'Redirect' : 'Success'}</span> })() : null },
                { label: 'Latency ms', field: 'latencyMs', hint: <span style={{ fontSize: 10, color: 'var(--txt-3)' }}>0 = instant</span> },
                { label: 'Priority', field: 'priority', hint: <span style={{ fontSize: 10, color: 'var(--txt-3)' }}>Lower runs first</span> },
              ].map(({ label, field, hint }) => (
                <div key={field}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{label}</span>{hint}
                  </div>
                  <input
                    type="number"
                    value={(mockEditForm as unknown as Record<string, string>)[field]}
                    onChange={e => setMockEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-1)', color: 'var(--txt-1)', fontSize: 13, fontFamily: 'monospace', outline: 'none' }}
                  />
                </div>
              ))}
            </div>

            {/* Response body with edit/preview tabs */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Response Body</span>
                <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 6, padding: 2, gap: 2 }}>
                  {(['edit', 'preview'] as const).map(t => (
                    <button key={t} onClick={() => setMockBodyTab(t)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', background: mockBodyTab === t ? (isDark ? '#2a3a5c' : 'white') : 'transparent', color: mockBodyTab === t ? (isDark ? '#93c5fd' : '#1d4ed8') : 'var(--txt-3)', transition: 'all 0.15s' }}>
                      {t === 'edit' ? 'Edit' : 'Preview'}
                    </button>
                  ))}
                </div>
              </div>
              {mockBodyTab === 'edit' ? (
                <textarea
                  value={mockEditForm.responseBody}
                  onChange={e => setMockEditForm(f => ({ ...f, responseBody: e.target.value }))}
                  rows={9}
                  spellCheck={false}
                  style={{ width: '100%', boxSizing: 'border-box', fontFamily: '"JetBrains Mono","Fira Code",monospace', fontSize: 12, background: isDark ? '#0d1117' : '#f6f8fa', color: isDark ? '#e6edf3' : '#24292f', border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`, borderRadius: 8, padding: '10px 14px', resize: 'vertical', outline: 'none', lineHeight: 1.65 }}
                  placeholder={'{\n  "access_token": "mock-token",\n  "token_type": "Bearer",\n  "expires_in": 3600\n}'}
                />
              ) : (
                <JsonHighlight code={mockEditForm.responseBody || '{}'} maxHeight={220} isDark={isDark} />
              )}
            </div>

            {/* Enabled toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 10, border: `1px solid ${mockEditForm.enabled ? (isDark ? '#166534' : '#bbf7d0') : 'var(--border)'}`, transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: mockEditForm.enabled ? '#22c55e' : 'var(--txt-3)', flexShrink: 0, transition: 'background 0.2s' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-1)' }}>{mockEditForm.enabled ? 'Enabled' : 'Disabled'}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>{mockEditForm.enabled ? 'Will be matched when a request hits this path in sandbox mode' : 'Skipped — another enabled mock will be tried'}</div>
                </div>
              </div>
              <Switch checked={mockEditForm.enabled} onChange={v => setMockEditForm(f => ({ ...f, enabled: v }))} />
            </div>

          </div>
        </Modal>
      </div>
    ) : null,
  }

  const replaysTab: TabItem = {
    key: 'replays',
    label: 'Replays',
    icon: <PlayCircle size={12} />,
    children: selectedApi ? (
      <div style={{ padding: '8px 12px', background: panelBg, height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button onClick={() => setShowReplayInfo(v => !v)} title="How do Replays work?" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: showReplayInfo ? (isDark ? '#93c5fd' : '#1d4ed8') : 'var(--txt-3)', fontSize: 11, padding: '2px 4px', borderRadius: 4 }}>
              <Info size={13} />
              <span>How do Replays work?</span>
            </button>
          </div>
          <div style={{ marginBottom: 8, padding: '7px 10px', background: isDark ? '#0f2320' : '#f0fdf4', border: `1px solid ${isDark ? '#14532d' : '#bbf7d0'}`, borderRadius: 6, fontSize: 12, color: 'var(--txt-2)' }}>
            <span style={{ fontWeight: 600, color: isDark ? '#4ade80' : '#15803d' }}>txGuid auto-generated: </span>
            <span>If the original request body contains a <code style={{ fontSize: 11, padding: '0 3px', background: isDark ? '#1a3a2a' : '#dcfce7', borderRadius: 3 }}>txGuid</code> field, a new UUID is automatically generated for each replay to prevent duplicate-transaction rejections from the upstream service.</span>
          </div>

          {showReplayInfo && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: isDark ? '#1a2035' : '#f0f4ff', border: `1px solid ${isDark ? '#2a3a5c' : '#c7d7f8'}`, borderRadius: 8, fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 600, color: 'var(--txt-1)', marginBottom: 4 }}>How do Replays work?</div>
              <div>
                A replay re-fires the exact same request that was captured in the <strong>Logs</strong> tab — same method and path — directly through TAG to the upstream service.
                This is useful for debugging a failed request or verifying that a fix works without having to reconstruct the call manually.
              </div>
              <div style={{ marginTop: 8, padding: '8px 10px', background: isDark ? '#2a1f10' : '#fff7ed', border: `1px solid ${isDark ? '#92400e' : '#fed7aa'}`, borderRadius: 6 }}>
                <span style={{ fontWeight: 600, color: isDark ? '#fb923c' : '#c2410c' }}>Note: </span>
                <span>Replays resend the stored request body (if captured). Headers and auth are re-injected by TAG. Each log entry can only be replayed once — re-triggering the same request may cause unintended side effects on non-idempotent endpoints.</span>
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
                {[
                  { label: 'PENDING', desc: 'Replay queued, not started yet' },
                  { label: 'RUNNING', desc: 'Request is in-flight to upstream' },
                  { label: 'COMPLETED', desc: 'Upstream responded successfully' },
                  { label: 'FAILED', desc: 'Request errored or upstream rejected it' },
                ].map(f => (
                  <span key={f.label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <code style={{ fontSize: 10, fontWeight: 700, background: isDark ? '#2a3a5c' : '#dbeafe', color: isDark ? '#93c5fd' : '#1d4ed8', padding: '1px 5px', borderRadius: 3 }}>{f.label}</code>
                    <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>{f.desc}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <Tbl
            columns={replayColumns}
            data={replaysData?.content ?? []}
            loading={replaysLoading}
            rowKey="id"
            emptyText="No replays yet"
          />
        </div>
        <PaginationBar
          page={replaysPage}
          totalPages={replaysData?.totalPages ?? 0}
          totalElements={replaysData?.totalElements ?? 0}
          onPage={setReplaysPage}
        />
      </div>
    ) : null,
  }

  const kongTab: TabItem = {
    key: 'kong',
    label: 'Kong',
    icon: <RefreshCw size={12} />,
    children: selectedApi ? (
      <div style={{ padding: '8px 12px', background: panelBg, height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Confirm title="Sync this API to Kong?" onConfirm={() => kongSyncMutation.mutate(selectedApi!.id)}>
              <Btn variant="primary" size="sm" icon={<RefreshCw size={13} />} loading={kongSyncMutation.isPending}>Sync to Kong</Btn>
            </Confirm>
            {!selectedApi?.builtIn && (
              <Confirm title="Remove from Kong?" danger onConfirm={() => kongDeleteMutation.mutate(selectedApi!.id)}>
                <Btn variant="danger" size="sm" icon={<Trash2 size={13} />} loading={kongDeleteMutation.isPending}>Remove</Btn>
              </Confirm>
            )}
          </div>
          <button onClick={() => setShowKongInfo(v => !v)} title="What is Kong sync?" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: showKongInfo ? (isDark ? '#93c5fd' : '#1d4ed8') : 'var(--txt-3)', fontSize: 11, padding: '2px 4px', borderRadius: 4 }}>
            <Info size={13} />
            <span>What is Kong sync?</span>
          </button>
        </div>

        {/* Kong Gateway URL — shown only when exposed domain is configured */}
        {selectedApi.exposedPath && platformConfig && (
          <div style={{ marginBottom: 10, padding: '10px 12px', background: `${ACCENT}08`, border: `1px solid ${ACCENT}25`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={13} color={ACCENT} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Kong Gateway URL</div>
              <code style={{ fontSize: 12, color: 'var(--txt-1)', wordBreak: 'break-all' }}>{`${envDomain(selectedApi.environment, platformConfig)}${selectedApi.exposedPath}`}</code>
              <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 2 }}>External traffic entry point — only active after a successful Kong sync</div>
            </div>
            <button type="button" onClick={() => copyToClipboard(`${envDomain(selectedApi.environment, platformConfig)}${selectedApi.exposedPath}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 4, borderRadius: 4, flexShrink: 0 }}>
              <Copy size={13} />
            </button>
          </div>
        )}

        {showKongInfo && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: isDark ? '#1a2035' : '#f0f4ff', border: `1px solid ${isDark ? '#2a3a5c' : '#c7d7f8'}`, borderRadius: 8, fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.75 }}>
            <div style={{ fontWeight: 600, color: 'var(--txt-1)', marginBottom: 6 }}>What is Kong and why sync?</div>
            <div style={{ marginBottom: 8 }}>
              <strong>Kong</strong> is the external API gateway that public or partner traffic hits first. Syncing an API to Kong creates two things inside Kong:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {[
                { label: 'Kong Service', desc: 'Points to the TAG runtime URL for this API — NOT directly to the upstream. All traffic flows: Kong → TAG → Upstream.' },
                { label: 'Kong Route', desc: 'Maps the Exposed Domain + Exposed Path you configured to the Kong Service, so external callers know where to send requests.' },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <code style={{ fontSize: 10, fontWeight: 700, background: isDark ? '#2a3a5c' : '#dbeafe', color: isDark ? '#93c5fd' : '#1d4ed8', padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap', marginTop: 1 }}>{f.label}</code>
                  <span style={{ fontSize: 11, color: 'var(--txt-2)' }}>{f.desc}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ padding: '8px 10px', background: isDark ? '#0f2a1a' : '#f0fdf4', border: `1px solid ${isDark ? '#166534' : '#bbf7d0'}`, borderRadius: 6 }}>
                <div style={{ fontWeight: 600, color: isDark ? '#4ade80' : '#15803d', marginBottom: 3, fontSize: 11 }}>Sync SUCCESS</div>
                <div style={{ fontSize: 11, color: 'var(--txt-2)' }}>External traffic can reach this API via the Kong gateway using the exposed domain and path. The route is live.</div>
              </div>
              <div style={{ padding: '8px 10px', background: isDark ? '#2a1010' : '#fff1f2', border: `1px solid ${isDark ? '#7f1d1d' : '#fecaca'}`, borderRadius: 6 }}>
                <div style={{ fontWeight: 600, color: isDark ? '#f87171' : '#dc2626', marginBottom: 3, fontSize: 11 }}>Sync FAILED</div>
                <div style={{ fontSize: 11, color: 'var(--txt-2)' }}>Kong does not have a route for this API — external callers using the exposed domain will get a 404 from Kong. TAG direct access still works.</div>
              </div>
            </div>

            <div style={{ padding: '8px 10px', background: isDark ? '#1a1a2a' : '#fafafa', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, borderRadius: 6 }}>
              <div style={{ fontWeight: 600, color: 'var(--txt-1)', marginBottom: 4, fontSize: 11 }}>Does sync failure affect Rate Limiting, Blacklists, Transforms?</div>
              <div style={{ fontSize: 11, color: 'var(--txt-2)', lineHeight: 1.7 }}>
                <strong>No.</strong> Rate limiting, IP blacklisting, transforms, upstream auth, and sandbox mocks are all enforced by <strong>TAG</strong> — not by Kong plugins.
                Since Kong always routes to TAG (not directly to the upstream), these policies apply to every request regardless of sync status.
                A sync failure only means the Kong entry point is missing — once a request reaches TAG, all governance is in full effect.
              </div>
            </div>
          </div>
        )}

        <Tbl
          columns={kongColumns}
          data={kongLogsData?.content ?? []}
          loading={kongLogsLoading}
          rowKey="id"
          emptyText="No Kong sync logs"
        />
      </div>
    ) : null,
  }

  const detailTabs: TabItem[] = [overviewTab, testTab, parametersTab, logsTab, transformsTab, mocksTab, replaysTab, kongTab]

  // ── Render ────────────────────────────────────────────────────────────────

  const leftBg = isDark ? colors.sidebarBg : '#f8fafc'
  const headerBg = isDark ? colors.cardBg : 'white'

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '14px 18px' }}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: `linear-gradient(135deg, ${ACCENT} 0%, #7c3aed 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap size={17} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt-1)', lineHeight: 1.2 }}>API Proxy Management</div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 1 }}>Securely expose internal APIs to external stakeholders via Kong + TAG</div>
          </div>
        </div>
        <Btn variant="primary" icon={<Plus size={15} />} onClick={() => { setRegForm(defaultRegister); setRegErrors({}); setRegisterDrawer(true) }}>
          Register API
        </Btn>
      </div>

      {/* ── Health strip ────────────────────────────────────────────────────── */}
      {!summaryLoading && healthSummary && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexShrink: 0 }}>
          {([
            { label: 'Total APIs',   count: healthSummary.totalApis,     color: ACCENT,     icon: <Zap size={13} /> },
            { label: 'Healthy',      count: healthSummary.upCount,       color: '#10b981',  icon: <CheckCircle2 size={13} /> },
            { label: 'Degraded',     count: healthSummary.degradedCount, color: '#f59e0b',  icon: <AlertTriangle size={13} /> },
            { label: 'Down',         count: healthSummary.downCount,     color: '#ef4444',  icon: <XCircle size={13} /> },
            { label: 'Unknown',      count: healthSummary.unknownCount,  color: '#94a3b8',  icon: <HelpCircle size={13} /> },
          ] as { label: string; count: number; color: string; icon: React.ReactNode }[]).map(({ label, count, color, icon }) => (
            <div key={label} style={{
              flex: 1, padding: '9px 13px', borderRadius: 10,
              background: isDark ? `${color}10` : `${color}09`,
              border: `1px solid ${color}28`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: `${color}18`, border: `1px solid ${color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color, flexShrink: 0,
              }}>
                {icon}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.3px' }}>{count}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {healthSummary && (healthSummary.downCount > 0 || healthSummary.degradedCount > 0) && (
        <div style={{ marginBottom: 8, flexShrink: 0 }}>
          <Alert type="error" description={`${healthSummary.downCount} API(s) down, ${healthSummary.degradedCount} degraded — ${healthSummary.degradedOrDown.map((a: ProxyApi) => a.name).join(', ')}`} />
        </div>
      )}

      {/* ── Split pane ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', display: 'flex' }}>

        {/* ── Left: API list ──────────────────────────────────────────────── */}
        <div style={{ width: 320, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>

          {/* Search bar */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', background: headerBg, flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
              <input
                value={sidebarSearch}
                onChange={e => { setSidebarSearch(e.target.value); setApisPage(0) }}
                placeholder="Search APIs…"
                style={{ width: '100%', paddingLeft: 28, paddingRight: sidebarSearch ? 28 : 10, paddingTop: 6, paddingBottom: 6, fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: isDark ? '#1e2a3a' : '#f8fafc', color: 'var(--txt-1)', outline: 'none', boxSizing: 'border-box' }}
              />
              {sidebarSearch && (
                <button onClick={() => setSidebarSearch('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 2 }}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Environment tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: headerBg, flexShrink: 0 }}>
            {(['all', 'prod', 'sandbox', 'dev'] as const).map(env => {
              const active = activeEnvTab === env
              return (
                <button
                  key={env}
                  onClick={() => { setActiveEnvTab(env); setApisPage(0) }}
                  style={{
                    flex: 1, padding: '7px 4px', fontSize: 11, fontWeight: active ? 700 : 500,
                    background: 'none', border: 'none', borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`,
                    color: active ? ACCENT : 'var(--txt-3)', cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: '0.4px', transition: 'all 0.15s',
                  }}
                >
                  {env === 'all' ? 'All' : env}
                </button>
              )
            })}
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', background: headerBg, flexShrink: 0, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => setActiveTagFilter(null)}
                style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, border: `1px solid ${!activeTagFilter ? ACCENT : 'var(--border)'}`, background: !activeTagFilter ? `${ACCENT}18` : 'transparent', color: !activeTagFilter ? ACCENT : 'var(--txt-3)', cursor: 'pointer' }}
              >
                All
              </button>
              {allTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => { setActiveTagFilter(activeTagFilter === tag.name ? null : tag.name); setApisPage(0) }}
                  title={tag.description ?? tag.name}
                  style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, border: `1px solid ${activeTagFilter === tag.name ? tag.color : 'var(--border)'}`, background: activeTagFilter === tag.name ? `${tag.color}20` : 'transparent', color: activeTagFilter === tag.name ? tag.color : 'var(--txt-3)', cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  {tag.name}
                </button>
              ))}
              <button
                onClick={() => setTagManagerOpen(true)}
                title="Manage tags"
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 2 }}
              >
                <Tags size={13} />
              </button>
            </div>
          )}

          {/* Tag manager trigger when no tags yet */}
          {allTags.length === 0 && (
            <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', background: headerBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <button onClick={() => setTagManagerOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Tags size={12} /> Manage tags
              </button>
            </div>
          )}

          {/* List body */}
          <div style={{ flex: 1, overflowY: 'auto', background: leftBg }}>
            {apisLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spin /></div>
            )}
            {!apisLoading && apis.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--txt-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Zap size={32} style={{ opacity: 0.25 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-2)' }}>No APIs registered yet</div>
                <div style={{ fontSize: 11, lineHeight: 1.5 }}>Click "Register API" to add your first proxied endpoint</div>
              </div>
            )}
            {!apisLoading && sortedFilteredApis.length === 0 && apis.length > 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--txt-3)', fontSize: 12 }}>
                No APIs match your search{activeTagFilter ? ` or tag "${activeTagFilter}"` : ''}.
              </div>
            )}
            {!apisLoading && sortedFilteredApis.map(api => {
              const active = selectedApi?.id === api.id
              const isDragging = draggedId === api.id
              const isDragOver = dragOverId === api.id
              const apiTags = (api.tags ?? []).map(name => allTags.find(t => t.name === name)).filter(Boolean) as ProxyApiTag[]
              return (
                <div
                  key={api.id}
                  draggable
                  onDragStart={() => handleDragStart(api.id)}
                  onDragOver={e => handleDragOver(e, api.id)}
                  onDragEnd={handleDragEnd}
                  onDrop={() => handleDrop(api.id)}
                  onClick={() => { setSelectedApi(api); setDetailTab('overview'); setTestResult(null); setTestParams({}); setLogsPage(0); setLogsSearchInput(''); setLogsSearch(''); setReplaysPage(0) }}
                  style={{
                    padding: '11px 14px 11px 10px', cursor: 'pointer', transition: 'background 0.1s',
                    background: isDragOver ? `${ACCENT}14` : active ? (isDark ? `${ACCENT}18` : `${ACCENT}0c`) : 'transparent',
                    borderLeft: `3px solid ${isDragOver ? ACCENT : active ? ACCENT : 'transparent'}`,
                    borderTop: isDragOver ? `2px solid ${ACCENT}` : '2px solid transparent',
                    borderBottom: '1px solid var(--divider)',
                    opacity: isDragging ? 0.45 : 1,
                    display: 'flex', alignItems: 'flex-start', gap: 6,
                  }}
                >
                  {/* Drag handle */}
                  <div
                    style={{ color: 'var(--txt-4)', paddingTop: 2, flexShrink: 0, cursor: 'grab' }}
                    title="Drag to reorder"
                    onClick={e => e.stopPropagation()}
                  >
                    <GripVertical size={12} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Row 1: name + action icons only */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
                      <HealthDot status={api.healthStatus} />
                      <span
                        title={api.name}
                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {api.name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 4 }} onClick={e => e.stopPropagation()}>
                      {!api.builtIn && <Btn variant="ghost" size="sm" icon={<Pencil size={11} />} iconOnly onClick={() => openEdit(api)} style={{ height: 20, padding: '0 4px', color: 'var(--txt-3)' }} />}
                      <Btn variant="ghost" size="sm" icon={<CopyPlus size={11} />} iconOnly onClick={() => openClone(api)} style={{ height: 20, padding: '0 4px', color: 'var(--txt-3)' }} />
                      {api.builtIn
                        ? <span title="Built-in APIs cannot be deleted" style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: 'var(--txt-4)', cursor: 'not-allowed' }}><Lock size={11} /></span>
                        : (
                          <Confirm title="Remove this API?" danger onConfirm={() => deleteMutation.mutate(api.id)}>
                            <Btn variant="danger" size="sm" icon={<Trash2 size={11} />} iconOnly style={{ height: 20, padding: '0 4px' }} />
                          </Confirm>
                        )
                      }
                    </div>
                  </div>

                  {/* Row 2: method + path */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {api.httpMethod && <MethodChip method={api.httpMethod} />}
                    <span style={{ fontSize: 11, color: 'var(--txt-3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {api.publicPath}
                    </span>
                    {api.exposedDomain && (
                      <span title="Kong gateway configured" style={{ display: 'inline-flex', flexShrink: 0 }}>
                        <Globe size={9} color={ACCENT} />
                      </span>
                    )}
                  </div>

                  {/* Row 3: env/built-in + status + tag chips */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    {api.builtIn && (
                      <Tag color="accent" style={{ fontSize: 9, padding: '0 5px', lineHeight: '14px', margin: 0 }}>BUILT-IN</Tag>
                    )}
                    <Tag color={ENV_TAG_COLOR[api.environment] ?? 'muted'} style={{ fontSize: 9, padding: '0 5px', lineHeight: '14px', margin: 0 }}>{api.environment}</Tag>
                    <Tag color={api.status === 'ACTIVE' ? 'green' : 'muted'} style={{ fontSize: 9, padding: '0 5px', lineHeight: '14px', margin: 0 }}>
                      {api.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </Tag>
                    {api.authRequired
                      ? <Tag color="blue" style={{ fontSize: 9, padding: '0 5px', lineHeight: '14px', margin: 0 }}><Lock size={8} style={{ display: 'inline', marginRight: 2 }} />Auth</Tag>
                      : <Tag color="muted" style={{ fontSize: 9, padding: '0 5px', lineHeight: '14px', margin: 0 }}><Unlock size={8} style={{ display: 'inline', marginRight: 2 }} />Open</Tag>
                    }
                    <Tag color={HEALTH_TAG_COLOR[api.healthStatus]} style={{ fontSize: 9, padding: '0 5px', lineHeight: '14px', margin: 0 }}>{api.healthStatus}</Tag>
                    {apiTags.map(t => (
                      <span key={t.id} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: `${t.color}20`, color: t.color, border: `1px solid ${t.color}40`, lineHeight: '14px' }}>{t.name}</span>
                    ))}
                  </div>
                  </div>{/* end flex:1 content wrapper */}
                </div>
              )
            })}
          </div>

          {/* Pagination footer */}
          <div style={{
            flexShrink: 0, borderTop: '1px solid var(--border)',
            padding: '6px 10px', background: headerBg,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          }}>
            <span style={{ fontSize: 11, color: 'var(--txt-3)', whiteSpace: 'nowrap' }}>
              {apisTotalElements} API{apisTotalElements !== 1 ? 's' : ''}
              {activeEnvTab !== 'all' ? ` · ${activeEnvTab}` : ''}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setApisPage(p => Math.max(0, p - 1))}
                disabled={apisPage === 0}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: apisPage === 0 ? 'var(--txt-4)' : 'var(--txt-2)', cursor: apisPage === 0 ? 'not-allowed' : 'pointer' }}
              >
                ←
              </button>
              <span style={{ fontSize: 11, color: 'var(--txt-2)', minWidth: 60, textAlign: 'center' }}>
                {apisPage + 1} / {Math.max(1, apisTotalPages)}
              </span>
              <button
                onClick={() => setApisPage(p => p + 1)}
                disabled={apisPage + 1 >= apisTotalPages}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: apisPage + 1 >= apisTotalPages ? 'var(--txt-4)' : 'var(--txt-2)', cursor: apisPage + 1 >= apisTotalPages ? 'not-allowed' : 'pointer' }}
              >
                →
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: detail pane ──────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: headerBg }}>
          {!selectedApi ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: panelBg, flexDirection: 'column', gap: 10, color: 'var(--txt-3)' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: `${ACCENT}12`, border: `1px solid ${ACCENT}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={24} color={ACCENT} style={{ opacity: 0.6 }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt-2)', marginBottom: 4 }}>Select an API</div>
                <div style={{ fontSize: 12, color: 'var(--txt-3)', lineHeight: 1.5 }}>Choose an API from the list to view details,<br />run tests, and manage configuration</div>
              </div>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div style={{ flexShrink: 0, padding: '12px 18px', borderBottom: '1px solid var(--border)', background: headerBg }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <HealthDot status={selectedApi.healthStatus} size={10} />
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt-1)' }}>{selectedApi.name}</span>
                      <Tag color={ENV_TAG_COLOR[selectedApi.environment] ?? 'muted'} style={{ fontSize: 10, fontWeight: 700 }}>{selectedApi.environment}</Tag>
                      <Tag color={selectedApi.status === 'ACTIVE' ? 'green' : 'muted'} style={{ fontSize: 10 }}>{selectedApi.status}</Tag>
                    </div>
                    {/* Internal URL */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {selectedApi.httpMethod && <MethodChip method={selectedApi.httpMethod} />}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, minWidth: 0 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedApi.internalBaseUrl}</span>
                        <button type="button" onClick={() => copyToClipboard(selectedApi.internalBaseUrl)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 0, borderRadius: 4, flexShrink: 0 }}>
                          <Copy size={10} />
                        </button>
                      </div>
                    </div>
                    {/* URL Access Block */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                      {/* Direct Proxy URL — partners call TAG directly */}
                      {envDomain(selectedApi.environment, platformConfig) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, minWidth: 0 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {`${envDomain(selectedApi.environment, platformConfig)}${selectedApi.publicPath}`}
                            </span>
                            <button type="button" onClick={() => copyToClipboard(`${envDomain(selectedApi.environment, platformConfig)}${selectedApi.publicPath}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 0, borderRadius: 4, flexShrink: 0 }}>
                              <Copy size={10} />
                            </button>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--txt-3)', whiteSpace: 'nowrap' }}>Partner Proxy URL — call with CLIENT token</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Btn
                      size="sm"
                      icon={<RotateCcw size={13} />}
                      loading={healthCheckMutation.isPending}
                      disabled={!selectedApi.healthCheckUrl}
                      title={!selectedApi.healthCheckUrl ? 'No health endpoint configured — set status manually' : undefined}
                      onClick={() => healthCheckMutation.mutate(selectedApi.id)}
                    >
                      Health Check
                    </Btn>
                    <Confirm title="Sync this API to Kong?" onConfirm={() => kongSyncMutation.mutate(selectedApi.id)}>
                      <Btn size="sm" icon={<RefreshCw size={13} />} loading={kongSyncMutation.isPending}>Sync Kong</Btn>
                    </Confirm>
                    <Btn variant="primary" size="sm" icon={<Pencil size={13} />} onClick={() => openEdit(selectedApi)}>Edit</Btn>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Tabs
                  items={detailTabs}
                  activeKey={detailTab}
                  onChange={key => { setDetailTab(key); setTestResult(null) }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Register API Drawer
      ═══════════════════════════════════════════════════════════════════════ */}
      <Drawer
        open={registerDrawer}
        onClose={() => { setRegisterDrawer(false); setRegForm(defaultRegister); setRegErrors({}); setRegStep('endpoint'); setIsCloneMode(false); setCloneSourceId(null) }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${ACCENT} 0%, #7c3aed 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={14} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{isCloneMode ? 'Clone API' : 'Register New API'}</div>
              <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 400 }}>{isCloneMode ? 'Edit the pre-filled fields and register as a new API' : 'Define an upstream API to expose through the proxy'}</div>
            </div>
          </div>
        }
        width={620}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Btn variant="ghost" size="sm"
              disabled={REG_STEPS.indexOf(regStep) === 0}
              onClick={() => setRegStep(REG_STEPS[REG_STEPS.indexOf(regStep) - 1])}
            >← Back</Btn>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>
                Step {REG_STEPS.indexOf(regStep) + 1} of {REG_STEPS.length}
              </span>
              {regStep !== 'security'
                ? <Btn variant="primary" onClick={advanceRegStep}>Continue →</Btn>
                : <Btn variant="primary" loading={registerMutation.isPending} onClick={submitRegister}>Register API</Btn>
              }
            </div>
          </div>
        }
      >
        {/* ── Stepper ── */}
        {(() => {
          const steps = [
            { key: 'endpoint', label: 'Endpoint', icon: <Server size={13} />,      hasError: !!(regErrors.httpMethod || regErrors.internalBaseUrl) },
            { key: 'identity', label: 'Identity',  icon: <Fingerprint size={13} />, hasError: !!(regErrors.name || regErrors.publicPath) },
            { key: 'routing',  label: 'Routing',   icon: <Globe size={13} />,       hasError: false },
            { key: 'security', label: 'Security',  icon: <ShieldCheck size={13} />, hasError: false },
          ]
          const currentIdx = REG_STEPS.indexOf(regStep)
          return (
            <div style={{ margin: '-20px -20px 24px', padding: '16px 24px', background: isDark ? '#0d1526' : '#f8faff', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {steps.map((s, i) => {
                  const done    = i < currentIdx
                  const active  = i === currentIdx
                  const circleColor = s.hasError ? '#ef4444' : done || active ? ACCENT : 'var(--border)'
                  const textColor   = s.hasError ? '#ef4444' : active ? ACCENT : done ? 'var(--txt-2)' : 'var(--txt-3)'
                  return (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : undefined }}>
                      <button type="button" onClick={() => setRegStep(s.key as typeof regStep)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', minWidth: 60 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: `2px solid ${circleColor}`,
                          background: done || active ? circleColor : 'transparent',
                          color: done || active ? 'white' : circleColor,
                          transition: 'all 0.2s', flexShrink: 0,
                          boxShadow: active ? `0 0 0 4px ${ACCENT}20` : 'none',
                        }}>
                          {done ? <CheckCircle2 size={14} /> : s.hasError ? <XCircle size={14} /> : <span style={{ fontSize: 11, fontWeight: 700 }}>{i + 1}</span>}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: textColor, whiteSpace: 'nowrap' }}>{s.label}</span>
                      </button>
                      {i < steps.length - 1 && (
                        <div style={{ flex: 1, height: 2, background: i < currentIdx ? ACCENT : 'var(--border)', margin: '0 4px', marginBottom: 18, borderRadius: 1, transition: 'background 0.3s' }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── Clone warning ── */}
        {isCloneMode && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16,
            padding: '10px 14px', borderRadius: 'var(--r-sm)',
            background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.4)',
          }}>
            <CopyPlus size={14} color="#eab308" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.5 }}>
              Cloned from an existing API — update the <strong>Name</strong> and <strong>Path</strong> before registering. Secrets have been cleared and must be re-entered.
            </span>
          </div>
        )}

        {/* ── Step 1: Endpoint ── */}
        {regStep === 'endpoint' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>
                HTTP Method <span style={{ color: '#ef4444' }}>*</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {HTTP_METHODS.map(m => {
                  const color = METHOD_HEX[m] ?? '#64748b'
                  const active = regForm.httpMethod === m
                  return (
                    <button key={m} type="button" onClick={() => { setRegForm(f => ({ ...f, httpMethod: m })); setRegErrors(e => ({ ...e, httpMethod: '' })) }}
                      style={{
                        padding: '10px 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
                        borderRadius: 8, border: `1.5px solid ${active ? color : 'var(--border)'}`,
                        background: active ? `${color}15` : 'var(--surface-2)',
                        color: active ? color : 'var(--txt-3)',
                        cursor: 'pointer', transition: 'all 0.15s',
                        boxShadow: active ? `0 2px 8px ${color}30` : 'none',
                      }}>{m}</button>
                  )
                })}
              </div>
              {regErrors.httpMethod && <div className="field-error" style={{ marginTop: 4 }}>{regErrors.httpMethod}</div>}
            </div>

            <Inp
              label="Upstream URL *"
              value={regForm.internalBaseUrl}
              onChangeValue={v => { setRegForm(f => ({ ...f, internalBaseUrl: v })); setRegErrors(e => ({ ...e, internalBaseUrl: '' })) }}
              error={regErrors.internalBaseUrl}
              placeholder="https://api.internal.com/endpoint"
              hint="Full URL of the internal service — TAG forwards every request to this URL"
              style={{ fontFamily: 'monospace' }}
            />

            {['POST', 'PUT', 'PATCH'].includes(regForm.httpMethod) && (
              <div style={{ borderTop: `1px dashed var(--border)`, paddingTop: 16 }}>
                <Field
                  label={<span>Request Body Template <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--txt-3)' }}>— optional, use <code style={{ background: 'var(--surface-2)', padding: '0 4px', borderRadius: 3 }}>{'{{param}}'}</code></span></span>}
                  hint="Placeholders are substituted at request time. Leave blank to forward the caller's body as-is."
                >
                  <textarea className="pus-textarea" rows={5} value={regForm.requestBodyTemplate}
                    onChange={e => setRegForm(f => ({ ...f, requestBodyTemplate: e.target.value }))}
                    placeholder={'{\n  "txVersion": "1.1.0",\n  "txGuid": "{{$guid}}",\n  "vrn": "{{vrn}}",\n  "amount": {{amount}}\n}'}
                    style={{ fontFamily: 'monospace', fontSize: 12, width: '100%' }} />
                </Field>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {['{{$guid}}', '{{$timestamp}}', '{{$isoDate}}'].map(b => (
                    <code key={b} style={{ fontSize: 10, background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border)', color: 'var(--txt-2)', cursor: 'pointer' }}
                      onClick={() => setRegForm(f => ({ ...f, requestBodyTemplate: (f.requestBodyTemplate || '') + b }))}
                    >{b}</code>
                  ))}
                  <span style={{ fontSize: 10, color: 'var(--txt-3)', alignSelf: 'center' }}>click to insert</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Identity ── */}
        {regStep === 'identity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Inp
              label="API Name *"
              value={regForm.name}
              onChangeValue={v => {
                const slug = toSlug(v)
                setRegForm(f => ({ ...f, name: v, publicPath: slug ? `/proxy/${slug}` : f.publicPath }))
                setRegErrors(e => ({ ...e, name: '' }))
              }}
              error={regErrors.name}
              placeholder="ICE Engine Vehicle Quote"
              hint="Human-readable name shown in the portal and API catalogue"
              autoFocus
            />

            <div className="field">
              <div className="field-label">
                Gateway Path <span style={{ color: '#ef4444' }}>*</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--txt-3)', marginLeft: 6 }}>auto-generated · editable</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <span style={{
                  padding: '0 10px', display: 'flex', alignItems: 'center',
                  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRight: 'none',
                  borderRadius: '8px 0 0 8px', fontSize: 12, color: 'var(--txt-3)', fontFamily: 'monospace',
                  whiteSpace: 'nowrap', flexShrink: 0, userSelect: 'none',
                }}>/proxy/</span>
                <input
                  className={`pus-input ${regErrors.publicPath ? 'error' : ''}`}
                  value={regForm.publicPath.replace(/^\/proxy\//, '')}
                  onChange={e => { setRegForm(f => ({ ...f, publicPath: `/proxy/${e.target.value}` })); setRegErrors(e2 => ({ ...e2, publicPath: '' })) }}
                  placeholder="ice-vehicle-quote"
                  style={{ fontFamily: 'monospace', borderRadius: '0 8px 8px 0', borderLeft: 'none', fontSize: 12, flex: 1 }}
                />
              </div>
              {regErrors.publicPath
                ? <div className="field-error">{regErrors.publicPath}</div>
                : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    <AlertTriangle size={10} color="var(--txt-3)" />
                    <span className="field-hint" style={{ margin: 0 }}>Cannot be changed after registration</span>
                  </div>
                )
              }
            </div>

            <Field label="Description" hint="Optional — shown in the portal and API catalogue for internal documentation">
              <textarea className="pus-textarea" rows={3} value={regForm.description}
                onChange={e => setRegForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of what this API does and who uses it"
                style={{ width: '100%' }} />
            </Field>

            <Field label="Tags" hint="Group this API by assigning one or more tags">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allTags.map(tag => {
                  const selected = regForm.tags.includes(tag.name)
                  return (
                    <button key={tag.id} onClick={() => setRegForm(f => ({ ...f, tags: selected ? f.tags.filter(t => t !== tag.name) : [...f.tags, tag.name] }))}
                      title={tag.description ?? tag.name}
                      style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 12, border: `1px solid ${selected ? tag.color : 'var(--border)'}`, background: selected ? `${tag.color}20` : 'transparent', color: selected ? tag.color : 'var(--txt-3)', cursor: 'pointer', transition: 'all 0.15s' }}>
                      {selected && <span style={{ marginRight: 4 }}>✓</span>}{tag.name}
                    </button>
                  )
                })}
                <button onClick={() => setTagManagerOpen(true)} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 12, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--txt-3)', cursor: 'pointer' }}>
                  {allTags.length === 0 ? '+ Create tags' : '+ New tag'}
                </button>
              </div>
            </Field>
          </div>
        )}

        {/* ── Step 3: Routing ── */}
        {regStep === 'routing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Environment & Access */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <Settings size={13} color={ACCENT} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-1)' }}>Environment & Access</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Sel label="Environment *" value={regForm.environment} onChangeValue={v => setRegForm(f => ({ ...f, environment: v }))}
                  options={ENVIRONMENTS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))} />
                <div className="field">
                  <div className="field-label">Client Authentication</div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                    border: `1.5px solid ${regForm.authRequired ? ACCENT : 'var(--border)'}`,
                    borderRadius: 8, background: regForm.authRequired ? `${ACCENT}08` : 'var(--surface-2)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }} onClick={() => setRegForm(f => ({ ...f, authRequired: !f.authRequired }))}>
                    <Switch checked={regForm.authRequired} onChange={v => setRegForm(f => ({ ...f, authRequired: v }))} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: regForm.authRequired ? ACCENT : 'var(--txt-3)' }}>
                      {regForm.authRequired ? 'Callers must authenticate' : 'Open access'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20, paddingTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <Globe size={13} color="var(--txt-3)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-1)' }}>External Access</span>
                <span style={{ fontSize: 10, color: 'var(--txt-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '1px 7px', borderRadius: 10 }}>optional</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--txt-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Custom domain that Kong exposes to external partners. Leave blank to use the default TAG proxy path only.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '0 10px' }}>
                <Inp label="Exposed Domain" value={regForm.exposedDomain} onChangeValue={v => setRegForm(f => ({ ...f, exposedDomain: v.replace(/^https?:\/\//i, '') }))} placeholder="uat-ice-engine.1010tech.io" hint="Domain only — https:// is added automatically" style={{ fontFamily: 'monospace' }} />
                <Inp label="Path" value={regForm.exposedPath} onChangeValue={v => setRegForm(f => ({ ...f, exposedPath: v }))} placeholder="/oauth" hint="Path suffix" style={{ fontFamily: 'monospace' }} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <AlertTriangle size={13} color="var(--txt-3)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-1)' }}>Health Monitoring</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--txt-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                TAG polls this URL periodically to track upstream availability.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', width: 'fit-content' }}>
                <input
                  type="checkbox"
                  checked={regForm.healthCheckUrlUnavailable}
                  onChange={e => setRegForm(f => ({ ...f, healthCheckUrlUnavailable: e.target.checked, healthCheckUrl: e.target.checked ? '' : f.healthCheckUrl }))}
                  style={{ width: 14, height: 14, cursor: 'pointer', accentColor: ACCENT }}
                />
                <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>No dedicated health endpoint</span>
              </label>
              {!regForm.healthCheckUrlUnavailable && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '0 10px' }}>
                  <Inp label="Health Check URL *" value={regForm.healthCheckUrl} onChangeValue={v => setRegForm(f => ({ ...f, healthCheckUrl: v }))} placeholder="https://api.internal.com/health" hint="TAG polls this endpoint to determine availability" style={{ fontFamily: 'monospace' }} error={regErrors.healthCheckUrl} />
                  <Inp label="Interval (s)" type="number" value={regForm.healthCheckIntervalSecs} onChangeValue={v => setRegForm(f => ({ ...f, healthCheckIntervalSecs: v }))} hint="Seconds between checks" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 4: Security ── */}
        {regStep === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-1)', marginBottom: 4 }}>Upstream Authentication</div>
              <div style={{ fontSize: 12, color: 'var(--txt-3)', lineHeight: 1.5 }}>
                How TAG authenticates itself to the upstream service when forwarding requests. This is separate from how callers authenticate to TAG.
              </div>
            </div>
            <AuthTypeGrid value={regForm.upstreamAuthType} onChange={v => setRegForm(f => ({ ...f, upstreamAuthType: v }))} />
            {renderAuthConditionals(regForm.upstreamAuthType, regForm, patch => setRegForm(f => ({ ...f, ...patch })), false)}
          </div>
        )}

      </Drawer>

      {/* ═══════════════════════════════════════════════════════════════════════
          Edit API Drawer
      ═══════════════════════════════════════════════════════════════════════ */}
      <Drawer
        open={editDrawer}
        onClose={() => { setEditDrawer(false); setEditingApi(null); setEditErrors({}); setEditStep('endpoint') }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Pencil size={13} color="var(--txt-2)" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{editingApi?.name ?? 'Edit API'}</div>
              <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 400 }}>Update configuration for this proxied API</div>
            </div>
          </div>
        }
        width={620}
        footer={
          <Btn variant="primary" loading={updateMutation.isPending} onClick={submitEdit}>
            Save Changes
          </Btn>
        }
      >
        {/* ── Step tab bar ── */}
        {(() => {
          const steps = [
            { key: 'endpoint', label: 'Endpoint', icon: <Server size={12} />,      hasError: !!(editErrors.internalBaseUrl) },
            { key: 'identity', label: 'Identity',  icon: <Fingerprint size={12} />, hasError: !!(editErrors.name) },
            { key: 'routing',  label: 'Routing',   icon: <Globe size={12} />,       hasError: false },
            { key: 'security', label: 'Security',  icon: <ShieldCheck size={12} />, hasError: false },
          ]
          return (
            <div style={{ margin: '-20px -20px 20px', display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              {steps.map(s => (
                <button key={s.key} type="button" onClick={() => setEditStep(s.key as typeof editStep)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '11px 18px',
                  background: 'none', border: 'none',
                  borderBottom: `2px solid ${editStep === s.key ? ACCENT : 'transparent'}`,
                  marginBottom: -1, cursor: 'pointer',
                  color: s.hasError ? '#ef4444' : editStep === s.key ? ACCENT : 'var(--txt-3)',
                  fontSize: 12, fontWeight: editStep === s.key ? 700 : 500,
                  transition: 'color 0.15s, border-color 0.15s',
                }}>
                  <span style={{ display: 'flex' }}>{s.icon}</span>
                  {s.label}
                  {s.hasError && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          )
        })()}

        {/* ── Tab: Endpoint ── */}
        {editStep === 'endpoint' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="HTTP Method">
              <MethodPicker value={editForm.httpMethod} onChange={v => setEditForm(f => ({ ...f, httpMethod: v }))} />
            </Field>
            <Inp
              label="Upstream URL"
              value={editForm.internalBaseUrl}
              onChangeValue={v => setEditForm(f => ({ ...f, internalBaseUrl: v }))}
              error={editErrors.internalBaseUrl}
              hint="Full URL of the internal service this proxy will forward requests to"
              style={{ fontFamily: 'monospace' }}
            />
            {['POST', 'PUT', 'PATCH'].includes(editForm.httpMethod) && (
              <Field
                label={<span>Request Body Template <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--txt-3)' }}>— use <code style={{ background: 'var(--surface-2)', padding: '0 4px', borderRadius: 3 }}>{'{{paramName}}'}</code></span></span>}
                hint="Placeholders are substituted at request time from caller-supplied or auto-generated parameters"
              >
                <textarea className="pus-textarea" rows={5} value={editForm.requestBodyTemplate}
                  onChange={e => setEditForm(f => ({ ...f, requestBodyTemplate: e.target.value }))}
                  placeholder={'{\n  "txGuid": "{{$guid}}",\n  "vrn": "{{vrn}}"\n}'}
                  style={{ fontFamily: 'monospace', fontSize: 12, width: '100%' }} />
              </Field>
            )}
          </div>
        )}

        {/* ── Tab: Identity ── */}
        {editStep === 'identity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Inp label="API Name" value={editForm.name} onChangeValue={v => setEditForm(f => ({ ...f, name: v }))} error={editErrors.name} hint="Human-readable name displayed in the portal and API lists" autoFocus />
            <Field label="Description" hint="Shown in the portal and API catalogue for internal documentation">
              <textarea className="pus-textarea" rows={3} value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                style={{ width: '100%' }} />
            </Field>
            <Field label="Tags" hint="Group this API by assigning one or more tags">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allTags.map(tag => {
                  const selected = editForm.tags.includes(tag.name)
                  return (
                    <button key={tag.id} onClick={() => setEditForm(f => ({ ...f, tags: selected ? f.tags.filter(t => t !== tag.name) : [...f.tags, tag.name] }))}
                      title={tag.description ?? tag.name}
                      style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, border: `1px solid ${selected ? tag.color : 'var(--border)'}`, background: selected ? `${tag.color}20` : 'transparent', color: selected ? tag.color : 'var(--txt-3)', cursor: 'pointer', transition: 'all 0.15s' }}>
                      {tag.name}
                    </button>
                  )
                })}
                <button onClick={() => setTagManagerOpen(true)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--txt-3)', cursor: 'pointer' }}>
                  {allTags.length === 0 ? '+ Create tags' : '+ New tag'}
                </button>
              </div>
            </Field>
          </div>
        )}

        {/* ── Tab: Routing ── */}
        {editStep === 'routing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', background: `${ACCENT}08`, borderRadius: 8, border: `1px solid ${ACCENT}1e` }}>
              <Info size={13} color={ACCENT} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.55 }}>
                Update the external domain for partner access. Changes take effect after the next Kong sync.
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '0 10px' }}>
              <Inp label="Exposed Domain" value={editForm.exposedDomain} onChangeValue={v => setEditForm(f => ({ ...f, exposedDomain: v.replace(/^https?:\/\//i, '') }))} placeholder="uat-ice-engine.1010tech.io" hint="Domain only — https:// is added automatically" style={{ fontFamily: 'monospace' }} />
              <Inp label="Path" value={editForm.exposedPath} onChangeValue={v => setEditForm(f => ({ ...f, exposedPath: v }))} placeholder="/oauth" hint="URL path appended after the domain" style={{ fontFamily: 'monospace' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Sel label="Environment" value={editForm.environment} onChangeValue={v => setEditForm(f => ({ ...f, environment: v }))}
                options={ENVIRONMENTS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))} />
              <div>
                <div className="field-label">Client Auth</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Switch checked={editForm.authRequired} onChange={v => setEditForm(f => ({ ...f, authRequired: v }))} />
                  <span style={{ fontSize: 12, color: editForm.authRequired ? 'var(--txt-1)' : 'var(--txt-3)' }}>
                    {editForm.authRequired ? 'Callers must authenticate' : 'Open access'}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer', width: 'fit-content' }}>
                <input
                  type="checkbox"
                  checked={editForm.healthCheckUrlUnavailable}
                  onChange={e => setEditForm(f => ({ ...f, healthCheckUrlUnavailable: e.target.checked, healthCheckUrl: e.target.checked ? '' : f.healthCheckUrl }))}
                  style={{ width: 14, height: 14, cursor: 'pointer', accentColor: ACCENT }}
                />
                <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>No dedicated health endpoint</span>
              </label>
              {!editForm.healthCheckUrlUnavailable && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '0 10px' }}>
                  <Inp label="Health Check URL *" value={editForm.healthCheckUrl} onChangeValue={v => setEditForm(f => ({ ...f, healthCheckUrl: v }))} hint="TAG polls this URL periodically to monitor upstream availability" style={{ fontFamily: 'monospace' }} error={editErrors.healthCheckUrl} />
                  <Inp label="Interval (s)" type="number" value={editForm.healthCheckIntervalSecs} onChangeValue={v => setEditForm(f => ({ ...f, healthCheckIntervalSecs: v }))} hint="Seconds between checks" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Security ── */}
        {editStep === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <AuthTypeGrid value={editForm.upstreamAuthType} onChange={v => setEditForm(f => ({ ...f, upstreamAuthType: v }))} />
            {renderAuthConditionals(editForm.upstreamAuthType, editForm, patch => setEditForm(f => ({ ...f, ...patch })), true)}
          </div>
        )}

      </Drawer>

      {/* ── Tag Manager Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Tags size={15} /><span>Manage Tags</span></div>}
        width={480}
        footer={<Btn variant="ghost" size="sm" onClick={() => setTagManagerOpen(false)}>Close</Btn>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Create new tag */}
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-1)', marginBottom: 10 }}>Create new tag</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <Inp label="Name" value={newTagForm.name} onChangeValue={v => setNewTagForm(f => ({ ...f, name: v }))} placeholder="e.g. gov, payments, internal" />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', marginBottom: 4 }}>Color</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['#6366f1','#3b82f6','#22c55e','#f97316','#ef4444','#a855f7','#14b8a6','#f59e0b'].map(c => (
                    <button key={c} onClick={() => setNewTagForm(f => ({ ...f, color: c }))} style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: newTagForm.color === c ? `2px solid var(--txt-1)` : '2px solid transparent', cursor: 'pointer', outline: 'none' }} />
                  ))}
                </div>
              </div>
            </div>
            <Inp label="Description" value={newTagForm.description} onChangeValue={v => setNewTagForm(f => ({ ...f, description: v }))} placeholder="What does this tag represent?" />
            <div style={{ marginTop: 10 }}>
              <Btn variant="primary" size="sm" loading={createTagMutation.isPending} onClick={() => { if (newTagForm.name.trim()) createTagMutation.mutate({ name: newTagForm.name.trim(), description: newTagForm.description.trim() || undefined, color: newTagForm.color }) }}>
                Create Tag
              </Btn>
            </div>
          </div>

          {/* Existing tags */}
          {allTags.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--txt-3)', fontSize: 12, padding: '8px 0' }}>No tags yet. Create one above.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {allTags.map(tag => (
                <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: tag.color, minWidth: 80 }}>{tag.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--txt-3)', flex: 1 }}>{tag.description ?? '—'}</span>
                  <span style={{ fontSize: 10, color: 'var(--txt-3)' }}>{apis.filter(a => (a.tags ?? []).includes(tag.name)).length} APIs</span>
                  <Confirm title={`Delete tag "${tag.name}"?`} danger onConfirm={() => deleteTagMutation.mutate(tag.id)}>
                    <Btn variant="danger" size="sm" icon={<Trash2 size={11} />} iconOnly />
                  </Confirm>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Body viewer modal ───────────────────────────────────────────── */}
      <Modal open={!!bodyModal} onClose={() => setBodyModal(null)} title={bodyModal?.title ?? ''} width={760}>
        {bodyModal && (() => {
          let pretty = bodyModal.body
          try { pretty = JSON.stringify(JSON.parse(bodyModal.body), null, 2) } catch {}
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button
                  onClick={() => { navigator.clipboard.writeText(pretty); toast.success('Copied to clipboard') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 11, borderRadius: 5, border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`, background: isDark ? '#161b22' : '#f6f8fa', color: 'var(--txt-2)', cursor: 'pointer' }}
                >
                  <Copy size={11} /> Copy
                </button>
              </div>
              <pre style={{
                margin: 0, padding: '12px 14px', borderRadius: 6, overflowX: 'auto', overflowY: 'auto',
                maxHeight: 560, fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace',
                background: isDark ? '#0d1117' : '#f6f8fa', color: isDark ? '#e6edf3' : '#24292f',
                border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
              }}>{pretty}</pre>
            </div>
          )
        })()}
      </Modal>

    </div>
  )
}
