import { useState, type ReactNode } from 'react'
import { copyToClipboard } from '../utils/clipboard'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listPartners, createPartner, updatePartner, deletePartner,
  listBundles, createBundle, updateBundle, deleteBundle,
  getWorkflowHistory, submitWorkflowStep, approveWorkflowStep, rejectWorkflowStep, skipLegal,
  listIpRequests, createIpRequest, reviewIpRequest, getEffectiveWhitelist,
} from '../api/partners'
import type { Partner, PartnerBundle, OnboardingStep, IpRequest } from '../api/partners'
import { listApis } from '../api/proxy'
import type { ProxyApi } from '../api/proxy'
import {
  Btn, Inp, Sel, Tag, Tbl, Tabs, Modal, Drawer, Confirm, toast, PermissionPicker, IpCidrInput,
} from '../components/ui'
import type { Column, TabItem } from '../components/ui'
import {
  Plus, Trash2, Pencil, CheckCircle2, XCircle,
  GitBranch, Shield, Zap, ExternalLink, ChevronRight, Search,
  Mail, Phone, Building2, Clock, Check, X, BarChart3,
  Key, RotateCcw, Lock, Copy, Info,
} from 'lucide-react'
import {
  listPartnerClients, createPartnerClient, rotateSecret, revokeClient, updateClient,
} from '../api/clients'
import type { ClientCredential } from '../api/clients'
import dayjs from 'dayjs'
import { useAuth } from '../context/AuthContext'
import { getPostmanCollection, getOpenApiSpec, getCodeSnippet, downloadBlob } from '../api/sdk'
import { getPlatformConfig } from '../api/platform'

// ── Colour helpers ─────────────────────────────────────────────────────────────

function partnerStatusColor(s: string): 'green' | 'red' | 'orange' | 'muted' {
  if (s === 'ACTIVE') return 'green'
  if (s === 'SUSPENDED') return 'red'
  if ((s as string) === 'PENDING') return 'orange'
  return 'muted'
}

function partnerTypeColor(t: string): 'blue' | 'accent' | 'orange' | 'green' | 'muted' {
  if (t === 'MINISTRY')   return 'blue'
  if (t === 'DEPARTMENT') return 'accent'
  if (t === 'AGENCY')     return 'orange'
  if (t === 'PARASTATAL') return 'green'
  return 'muted'
}

function onboardingColor(s: string): 'muted' | 'blue' | 'green' | 'red' {
  if (s === 'IN_PROGRESS') return 'blue'
  if (s === 'COMPLETED') return 'green'
  if (s === 'FAILED') return 'red'
  return 'muted'
}

function ipStatusColor(s: string): 'orange' | 'green' | 'red' | 'blue' | 'muted' {
  if (s === 'PENDING') return 'orange'
  if (s === 'APPROVED') return 'green'
  if (s === 'REJECTED') return 'red'
  if (s === 'AUTO_APPROVED') return 'blue'
  return 'muted'
}

// ── Avatar helpers ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[Math.abs(h)]
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }: { label: string; value: number; color?: string; icon?: ReactNode }) {
  return (
    <div className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
      {icon && (
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: color ? `color-mix(in srgb, ${color} 12%, transparent)` : 'var(--surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: color ?? 'var(--txt-3)', flexShrink: 0,
        }}>
          {icon}
        </div>
      )}
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--txt-1)', lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 1 }}>{label}</div>
      </div>
    </div>
  )
}

// ── Timeline step ──────────────────────────────────────────────────────────────

function WorkflowStep({
  step, isAdmin,
  onApprove, onReject, approving, rejecting,
}: {
  step: OnboardingStep
  isAdmin: boolean
  onApprove: (stepId: string) => void
  onReject: (stepId: string) => void
  approving: boolean
  rejecting: boolean
}) {
  const isCompleted = step.status === 'COMPLETED'
  const isFailed    = step.status === 'FAILED'
  const dotColor    = isCompleted ? 'var(--green)' : isFailed ? 'var(--red)' : 'var(--accent)'
  const dotIcon     = isCompleted ? <Check size={9} /> : isFailed ? <X size={9} /> : <Clock size={9} />

  return (
    <div style={{ display: 'flex', gap: 12, paddingBottom: 18, position: 'relative' }}>
      {/* vertical line */}
      <div style={{ position: 'absolute', left: 9, top: 22, bottom: 0, width: 1, background: 'var(--divider)' }} />
      {/* dot */}
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: dotColor,
        flexShrink: 0, marginTop: 1, zIndex: 1,
        border: '2px solid var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', boxShadow: `0 0 0 3px color-mix(in srgb, ${dotColor} 18%, transparent)`,
      }}>
        {dotIcon}
      </div>
      <div style={{ flex: 1, paddingTop: 1 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt-1)' }}>{step.step}</span>
          <Tag color={onboardingColor(step.status)} style={{ fontSize: 10 }}>{step.status}</Tag>
          {isAdmin && step.status === 'PENDING' && (
            <>
              <Btn variant="link" size="sm" loading={approving} onClick={() => onApprove(step.id)} style={{ color: 'var(--green)', padding: 0, fontSize: 12 }}>
                Approve
              </Btn>
              <Btn variant="link" size="sm" loading={rejecting} onClick={() => onReject(step.id)} style={{ color: 'var(--red)', padding: 0, fontSize: 12 }}>
                Reject
              </Btn>
            </>
          )}
        </div>
        {step.notes && (
          <div style={{ fontSize: 12, color: 'var(--txt-2)', marginBottom: 3, lineHeight: 1.5 }}>{step.notes}</div>
        )}
        <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>{dayjs(step.createdAt).format('MMM D, YYYY · HH:mm')}</div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Partners() {
  const { isAdmin } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Partner | null>(null)
  const [selected, setSelected] = useState<Partner | null>(null)
  const [detailTab, setDetailTab] = useState('workflow')
  const [submitStepOpen, setSubmitStepOpen] = useState(false)
  const [reviewModal, setReviewModal] = useState<{ id: string; action: 'APPROVED' | 'REJECTED' } | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [sdkLanguage, setSdkLanguage] = useState<'curl' | 'python' | 'javascript' | 'java'>('curl')
  const [sdkSnippet, setSdkSnippet] = useState<string | null>(null)

  // Partner form
  const [partnerForm, setPartnerForm] = useState({
    name: '', shortCode: '', email: '', phone: '',
    type: 'MINISTRY', status: 'ACTIVE', contractRef: '',
  })
  const [partnerErrors, setPartnerErrors] = useState<Record<string, string>>({})

  // Workflow step form
  const [stepForm, setStepForm] = useState({ step: '', status: 'PENDING', notes: '' })
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({})

  // Bundle form
  const [bundleModalOpen, setBundleModalOpen] = useState(false)
  const [bundleForm, setBundleForm] = useState({ name: '', description: '', rateLimitOverride: '', selectedApiIds: [] as string[] })
  const [bundleErrors, setBundleErrors] = useState<Record<string, string>>({})

  // Edit bundle form
  const [editingBundle, setEditingBundle] = useState<PartnerBundle | null>(null)
  const [editBundleForm, setEditBundleForm] = useState({ name: '', description: '', rateLimitOverride: '', selectedApiIds: [] as string[] })
  const [editBundleErrors, setEditBundleErrors] = useState<Record<string, string>>({})

  // Partner list search
  const [partnerSearch, setPartnerSearch] = useState('')

  // Credentials tab state
  const [credDrawerOpen, setCredDrawerOpen]   = useState(false)
  const [editingCred, setEditingCred]         = useState<ClientCredential | null>(null)
  const [secretModal, setSecretModal]         = useState<{ title: string; clientId: string; secret: string } | null>(null)
  const [curlEnv, setCurlEnv]                 = useState<'prod' | 'dev' | 'sandbox'>('sandbox')
  const [credForm, setCredForm]               = useState({ name: '', description: '', permissions: [] as string[], expiresAt: '' })
  const [credErrors, setCredErrors]           = useState<Record<string, string>>({})
  const [editCredForm, setEditCredForm]       = useState({ name: '', description: '', permissions: [] as string[] })
  const [editCredErrors, setEditCredErrors]   = useState<Record<string, string>>({})

  // Inline IP form (inside the tab)
  const [showIpInfo, setShowIpInfo] = useState(false)
  const [ipInline, setIpInline] = useState({ ipCidr: '', action: 'ADD', reason: '' })
  const [ipInlineErrors, setIpInlineErrors] = useState<Record<string, string>>({})

  const qc = useQueryClient()

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['partners'],
    queryFn: () => listPartners({ size: 50 }),
    select: (res) => res.data,
  })

  const { data: bundles, isLoading: bundlesLoading } = useQuery({
    queryKey: ['partner-bundles', selected?.id],
    queryFn: () => selected ? listBundles(selected.id, { size: 50 }) : null,
    enabled: !!selected,
    select: (res) => res?.data,
  })

  const { data: workflow, isLoading: workflowLoading } = useQuery({
    queryKey: ['partner-workflow', selected?.id],
    queryFn: () => selected ? getWorkflowHistory(selected.id) : null,
    enabled: !!selected,
    select: (res) => res?.data,
  })

  const { data: ipRequests, isLoading: ipLoading } = useQuery({
    queryKey: ['partner-ip-requests', selected?.id],
    queryFn: () => selected ? listIpRequests(selected.id, { size: 50 }) : null,
    enabled: !!selected,
    select: (res) => res?.data,
  })

  const { data: effectiveWhitelist } = useQuery({
    queryKey: ['partner-ip-whitelist', selected?.id],
    queryFn: () => selected ? getEffectiveWhitelist(selected.id) : null,
    enabled: !!selected,
    select: (res) => res?.data ?? [],
  })

  const { data: proxyApis } = useQuery({
    queryKey: ['proxy-apis-all'],
    queryFn: () => listApis({ size: 100 }),
    select: (res) => res.data.content,
  })

  const { data: partnerClients, isLoading: clientsLoading } = useQuery({
    queryKey: ['partner-clients', selected?.id],
    queryFn: () => selected ? listPartnerClients(selected.id) : null,
    enabled: !!selected,
    select: (res) => res?.data ?? [],
  })

  const { data: platformConfig } = useQuery({
    queryKey: ['platform-config'],
    queryFn: () => getPlatformConfig(),
    select: (res) => res.data,
    staleTime: 5 * 60_000,
  })

  function credCurlBase(): string {
    if (!platformConfig) return ''
    if (curlEnv === 'prod')    return platformConfig.prodDomain
    if (curlEnv === 'dev')     return platformConfig.devDomain
    return platformConfig.sandboxDomain
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: createPartner,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners'] })
      setDrawerOpen(false)
      toast.success('Partner created')
    },
    onError: () => toast.error('Failed to create partner'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePartner>[1] }) => updatePartner(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['partners'] })
      setSelected(res.data)
      setDrawerOpen(false)
      setEditing(null)
      toast.success('Partner updated')
    },
    onError: () => toast.error('Failed to update partner'),
  })

  const deleteMutation = useMutation({
    mutationFn: deletePartner,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partners'] }); toast.success('Partner deleted') },
    onError: () => toast.error('Failed to delete partner'),
  })

  const submitStepMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof submitWorkflowStep>[1] }) => submitWorkflowStep(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-workflow', selected?.id] })
      setSubmitStepOpen(false)
      setStepForm({ step: '', status: 'PENDING', notes: '' })
      toast.success('Workflow step submitted')
    },
    onError: () => toast.error('Failed to submit step'),
  })

  const approveStepMutation = useMutation({
    mutationFn: ({ partnerId, stepId }: { partnerId: string; stepId: string }) => approveWorkflowStep(partnerId, stepId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partner-workflow', selected?.id] }); toast.success('Step approved') },
    onError: () => toast.error('Failed to approve step'),
  })

  const rejectStepMutation = useMutation({
    mutationFn: ({ partnerId, stepId }: { partnerId: string; stepId: string }) => rejectWorkflowStep(partnerId, stepId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partner-workflow', selected?.id] }); toast.success('Step rejected') },
    onError: () => toast.error('Failed to reject step'),
  })

  const skipLegalMutation = useMutation({
    mutationFn: (partnerId: string) => skipLegal(partnerId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partner-workflow', selected?.id] }); toast.success('Legal review skipped') },
    onError: () => toast.error('Failed to skip legal review'),
  })

  const createIpMutation = useMutation({
    mutationFn: ({ partnerId, data }: { partnerId: string; data: Parameters<typeof createIpRequest>[1] }) => createIpRequest(partnerId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-ip-requests', selected?.id] })
      setIpInline({ ipCidr: '', action: 'ADD', reason: '' })
      toast.success('IP request submitted')
    },
    onError: () => toast.error('Failed to submit IP request'),
  })

  const reviewIpMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof reviewIpRequest>[1] }) => reviewIpRequest(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-ip-requests', selected?.id] })
      qc.invalidateQueries({ queryKey: ['partner-ip-whitelist', selected?.id] })
      setReviewModal(null)
      setReviewNotes('')
      toast.success('IP request reviewed')
    },
    onError: () => toast.error('Failed to review IP request'),
  })

  const downloadPostmanMutation = useMutation({
    mutationFn: (partnerId: string) => getPostmanCollection(partnerId),
    onSuccess: (res, partnerId) => downloadBlob(res.data, `postman-${partnerId}.json`, 'application/json'),
    onError: () => toast.error('Failed to download Postman collection'),
  })

  const downloadOpenApiMutation = useMutation({
    mutationFn: (partnerId: string) => getOpenApiSpec(partnerId),
    onSuccess: (res, partnerId) => downloadBlob(res.data, `openapi-${partnerId}.yaml`, 'application/yaml'),
    onError: () => toast.error('Failed to download OpenAPI spec'),
  })

  const createBundleMutation = useMutation({
    mutationFn: ({ partnerId, data }: { partnerId: string; data: Parameters<typeof createBundle>[1] }) => createBundle(partnerId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-bundles', selected?.id] })
      setBundleModalOpen(false)
      setBundleForm({ name: '', description: '', rateLimitOverride: '', selectedApiIds: [] })
      setBundleErrors({})
      toast.success('Bundle created')
    },
    onError: () => toast.error('Failed to create bundle'),
  })

  const deleteBundleMutation = useMutation({
    mutationFn: (bundleId: string) => deleteBundle(bundleId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partner-bundles', selected?.id] }); toast.success('Bundle removed') },
    onError: () => toast.error('Failed to remove bundle'),
  })

  const updateBundleMutation = useMutation({
    mutationFn: ({ bundleId, data }: { bundleId: string; data: Parameters<typeof updateBundle>[1] }) => updateBundle(bundleId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-bundles', selected?.id] })
      setEditingBundle(null)
      toast.success('Bundle updated')
    },
    onError: () => toast.error('Failed to update bundle'),
  })

  function openEditBundle(b: PartnerBundle) {
    setEditingBundle(b)
    setEditBundleForm({
      name: b.name,
      description: b.description ?? '',
      rateLimitOverride: b.rateLimitOverride != null ? String(b.rateLimitOverride) : '',
      selectedApiIds: b.apiIds ?? [],
    })
    setEditBundleErrors({})
  }

  function submitEditBundle() {
    const e: Record<string, string> = {}
    if (!editBundleForm.name.trim()) e.name = 'Required'
    if (editBundleForm.selectedApiIds.length === 0) e.apis = 'Select at least one API'
    setEditBundleErrors(e)
    if (Object.keys(e).length || !editingBundle) return
    updateBundleMutation.mutate({
      bundleId: editingBundle.id,
      data: {
        name: editBundleForm.name.trim(),
        description: editBundleForm.description.trim() || undefined,
        apiIds: editBundleForm.selectedApiIds,
        rateLimitOverride: editBundleForm.rateLimitOverride ? Number(editBundleForm.rateLimitOverride) : undefined,
      },
    })
  }

  function submitBundle() {
    const e: Record<string, string> = {}
    if (!bundleForm.name.trim()) e.name = 'Required'
    if (bundleForm.selectedApiIds.length === 0) e.apis = 'Select at least one API'
    setBundleErrors(e)
    if (Object.keys(e).length || !selected) return
    createBundleMutation.mutate({
      partnerId: selected.id,
      data: {
        name: bundleForm.name.trim(),
        description: bundleForm.description.trim() || undefined,
        apiIds: bundleForm.selectedApiIds,
        rateLimitOverride: bundleForm.rateLimitOverride ? Number(bundleForm.rateLimitOverride) : undefined,
      },
    })
  }

  function toggleBundleApi(apiId: string) {
    setBundleForm(f => ({
      ...f,
      selectedApiIds: f.selectedApiIds.includes(apiId)
        ? f.selectedApiIds.filter(id => id !== apiId)
        : [...f.selectedApiIds, apiId],
    }))
  }

  const createCredMutation = useMutation({
    mutationFn: ({ partnerId, data }: { partnerId: string; data: Parameters<typeof createPartnerClient>[1] }) =>
      createPartnerClient(partnerId, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['partner-clients', selected?.id] })
      setCredDrawerOpen(false)
      setCredForm({ name: '', description: '', permissions: [], expiresAt: '' })
      setSecretModal({ title: 'Credential Created — Save Your Secret', clientId: res.data.clientId, secret: res.data.clientSecret })
    },
    onError: () => toast.error('Failed to create credential'),
  })

  const updateCredMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateClient>[1] }) => updateClient(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-clients', selected?.id] })
      setEditingCred(null)
      toast.success('Credential updated')
    },
    onError: () => toast.error('Failed to update credential'),
  })

  const rotateCredMutation = useMutation({
    mutationFn: (id: string) => rotateSecret(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['partner-clients', selected?.id] })
      setSecretModal({ title: 'Secret Rotated — Save Your New Secret', clientId: res.data.clientId, secret: res.data.newClientSecret })
    },
    onError: () => toast.error('Failed to rotate secret'),
  })

  const revokeCredMutation = useMutation({
    mutationFn: (id: string) => revokeClient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-clients', selected?.id] })
      toast.success('Credential revoked')
    },
    onError: () => toast.error('Failed to revoke credential'),
  })

  const fetchSnippetMutation = useMutation({
    mutationFn: ({ partnerId, lang }: { partnerId: string; lang: typeof sdkLanguage }) => getCodeSnippet(partnerId, lang),
    onSuccess: (res) => setSdkSnippet(res.data),
    onError: () => toast.error('Failed to fetch snippet'),
  })

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null)
    setPartnerForm({ name: '', shortCode: '', email: '', phone: '', type: 'MINISTRY', status: 'ACTIVE', contractRef: '' })
    setPartnerErrors({})
    setDrawerOpen(true)
  }

  function openEdit(p: Partner) {
    setEditing(p)
    setPartnerForm({ name: p.name, shortCode: '', email: p.email, phone: p.phone ?? '', type: p.type, status: p.status, contractRef: p.contractRef ?? '' })
    setPartnerErrors({})
    setDrawerOpen(true)
  }

  function validatePartner() {
    const e: Record<string, string> = {}
    if (!partnerForm.name.trim()) e.name = 'Required'
    if (!editing && !partnerForm.shortCode.trim()) e.shortCode = 'Required'
    if (!editing && !/^[A-Z0-9_-]{2,12}$/.test(partnerForm.shortCode)) e.shortCode = 'Uppercase letters/numbers, 2-12 chars'
    if (!partnerForm.email.trim()) e.email = 'Required'
    if (!partnerForm.type) e.type = 'Required'
    setPartnerErrors(e)
    return Object.keys(e).length === 0
  }

  function validateStep() {
    const e: Record<string, string> = {}
    if (!stepForm.step.trim()) e.step = 'Required'
    if (!stepForm.status) e.status = 'Required'
    setStepErrors(e)
    return Object.keys(e).length === 0
  }

  function validateCred() {
    const e: Record<string, string> = {}
    if (!credForm.name.trim()) e.name = 'Required'
    setCredErrors(e)
    return Object.keys(e).length === 0
  }

  function validateEditCred() {
    const e: Record<string, string> = {}
    if (!editCredForm.name.trim()) e.name = 'Required'
    setEditCredErrors(e)
    return Object.keys(e).length === 0
  }

  function validateIpInline() {
    const e: Record<string, string> = {}
    if (!ipInline.ipCidr.trim()) e.ipCidr = 'Required'
    if (!ipInline.action) e.action = 'Required'
    setIpInlineErrors(e)
    return Object.keys(e).length === 0
  }

  const partners = data?.content ?? []
  const filteredPartners = partnerSearch
    ? partners.filter(p =>
        p.name.toLowerCase().includes(partnerSearch.toLowerCase()) ||
        p.email.toLowerCase().includes(partnerSearch.toLowerCase()) ||
        p.shortCode.toLowerCase().includes(partnerSearch.toLowerCase())
      )
    : partners

  // ── Column definitions ────────────────────────────────────────────────────────

  const ipColumns: Column<IpRequest>[] = [
    { key: 'ip', title: 'IP / CIDR', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.ipCidr}</span> },
    { key: 'action', title: 'Action', width: 80, render: (r) => <Tag color={r.action === 'ADD' ? 'green' : 'red'}>{r.action}</Tag> },
    { key: 'status', title: 'Status', width: 110, render: (r) => <Tag color={ipStatusColor(r.status)}>{r.status}</Tag> },
    { key: 'reason', title: 'Reason', render: (r) => r.reason ?? '—' },
    { key: 'created', title: 'Created', width: 110, render: (r) => dayjs(r.createdAt).format('MMM D, YYYY') },
    {
      key: 'review',
      title: '',
      width: 160,
      render: (r) => isAdmin && r.status === 'PENDING' ? (
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn
            size="sm"
            variant="link"
            icon={<CheckCircle2 size={12} />}
            style={{ color: 'var(--green)' }}
            onClick={() => setReviewModal({ id: r.id, action: 'APPROVED' })}
          >
            Approve
          </Btn>
          <Btn
            size="sm"
            variant="link"
            icon={<XCircle size={12} />}
            style={{ color: 'var(--red)' }}
            onClick={() => setReviewModal({ id: r.id, action: 'REJECTED' })}
          >
            Reject
          </Btn>
        </div>
      ) : null,
    },
  ]

  // ── Detail pane tabs ──────────────────────────────────────────────────────────

  const detailTabs: TabItem[] = selected ? [
    {
      key: 'workflow',
      label: 'Onboarding',
      icon: <GitBranch size={13} />,
      children: (() => {
        const allSteps    = workflow ?? []
        const displaySteps = allSteps.slice(0, 6)
        const completed   = allSteps.filter(s => s.status === 'COMPLETED').length
        const hasMore     = allSteps.length > 6

        const stepDotColor = (s: OnboardingStep | undefined) =>
          !s                       ? 'var(--surface-2)'
          : s.status === 'COMPLETED'  ? 'var(--green)'
          : s.status === 'FAILED'     ? 'var(--red)'
          : s.status === 'IN_PROGRESS'? 'var(--accent)'
          : 'var(--border)'

        return (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>

            {/* Toolbar */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {allSteps.length > 0 && (
                  <>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} style={{
                          width: 22, height: 4, borderRadius: 3,
                          background: stepDotColor(displaySteps[i]),
                          transition: 'background 0.2s',
                        }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>
                      {completed} completed · {allSteps.length} total
                    </span>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isAdmin && (
                  <Confirm danger title="Skip the legal review step for this partner?" onConfirm={() => skipLegalMutation.mutate(selected.id)}>
                    <Btn size="sm" variant="ghost" loading={skipLegalMutation.isPending} style={{ color: 'var(--orange)', fontSize: 12 }}>
                      Skip Legal
                    </Btn>
                  </Confirm>
                )}
                <Btn size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => setSubmitStepOpen(true)}>
                  Add Step
                </Btn>
              </div>
            </div>

            {/* Steps list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {workflowLoading ? (
                <div style={{ padding: '20px 0', color: 'var(--txt-3)', fontSize: 13, textAlign: 'center' }}>Loading…</div>
              ) : allSteps.length === 0 ? (
                <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <GitBranch size={18} color="var(--txt-3)" />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-2)' }}>No steps yet</div>
                  <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>Add the first onboarding step to get started</div>
                </div>
              ) : (
                <div style={{ paddingTop: 4 }}>
                  {displaySteps.map((step: OnboardingStep) => (
                    <WorkflowStep
                      key={step.id}
                      step={step}
                      isAdmin={isAdmin}
                      onApprove={(stepId) => approveStepMutation.mutate({ partnerId: selected.id, stepId })}
                      onReject={(stepId) => rejectStepMutation.mutate({ partnerId: selected.id, stepId })}
                      approving={approveStepMutation.isPending}
                      rejecting={rejectStepMutation.isPending}
                    />
                  ))}
                  {hasMore && (
                    <div style={{ textAlign: 'center', padding: '4px 0 8px', fontSize: 11, color: 'var(--txt-3)', borderTop: '1px solid var(--divider)', marginTop: 4 }}>
                      Showing 6 most recent of {allSteps.length} steps
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )
      })(),
    },
    {
      key: 'bundles',
      label: 'API Bundles',
      icon: <Zap size={13} />,
      children: (
        <div style={{ padding: '8px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <Btn variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setBundleModalOpen(true)}>
              Add Bundle
            </Btn>
          </div>

          {bundlesLoading ? (
            <span style={{ color: 'var(--txt-3)', fontSize: 13 }}>Loading…</span>
          ) : (bundles?.content ?? []).length === 0 ? (
            <span style={{ color: 'var(--txt-3)', fontSize: 13 }}>No bundles assigned</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(bundles?.content ?? []).map((b: PartnerBundle) => {
                const apiNames = (b.apiIds ?? []).map(id => proxyApis?.find((a: ProxyApi) => a.id === id)?.name ?? id)
                return (
                  <div key={b.id} style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-1)', padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt-1)' }}>{b.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--surface-2)', color: 'var(--txt-2)', padding: '1px 7px', borderRadius: 10 }}>
                            {b.apiIds?.length ?? 0} API{(b.apiIds?.length ?? 0) !== 1 ? 's' : ''}
                          </span>
                          {b.rateLimitOverride && (
                            <span style={{ fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e', padding: '1px 7px', borderRadius: 10 }}>
                              {b.rateLimitOverride} req/min
                            </span>
                          )}
                        </div>
                        {b.description && (
                          <div style={{ fontSize: 12, color: 'var(--txt-2)', marginBottom: 6 }}>{b.description}</div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {apiNames.map((name, i) => (
                            <span key={i} style={{ fontSize: 11, fontFamily: 'monospace', background: 'var(--surface-2)', color: 'var(--txt-2)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Btn variant="ghost" size="sm" icon={<Pencil size={12} />} iconOnly onClick={() => openEditBundle(b)} />
                        <Confirm title={`Remove bundle "${b.name}"?`} danger onConfirm={() => deleteBundleMutation.mutate(b.id)}>
                          <Btn variant="danger" size="sm" icon={<Trash2 size={12} />} iconOnly />
                        </Confirm>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add Bundle Modal */}
          <Modal
            open={bundleModalOpen}
            onClose={() => { setBundleModalOpen(false); setBundleErrors({}) }}
            title="Add API Bundle"
            width={520}
            footer={<>
              <Btn variant="ghost" size="sm" onClick={() => setBundleModalOpen(false)}>Cancel</Btn>
              <Btn variant="primary" size="sm" loading={createBundleMutation.isPending} onClick={submitBundle}>Create Bundle</Btn>
            </>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Inp label="Bundle Name" value={bundleForm.name} onChangeValue={v => setBundleForm(f => ({ ...f, name: v }))} error={bundleErrors.name} placeholder="e.g. Payments Bundle" />
              <Inp label="Description" value={bundleForm.description} onChangeValue={v => setBundleForm(f => ({ ...f, description: v }))} placeholder="Optional description" />
              <Inp label="Rate Limit Override (req/min)" type="number" value={bundleForm.rateLimitOverride} onChangeValue={v => setBundleForm(f => ({ ...f, rateLimitOverride: v }))} placeholder="Leave blank to use default" />

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-2)', marginBottom: 6 }}>
                  Select APIs
                  {bundleErrors.apis && <span style={{ color: 'var(--red)', marginLeft: 8, fontWeight: 400 }}>{bundleErrors.apis}</span>}
                </div>
                {!proxyApis || proxyApis.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>No proxy APIs registered yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: bundleErrors.apis ? '1px solid var(--red)' : '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                    {(proxyApis as ProxyApi[]).map((api: ProxyApi) => {
                      const checked = bundleForm.selectedApiIds.includes(api.id)
                      return (
                        <label key={api.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', background: checked ? (api.environment === 'prod' ? '#f0fdf4' : api.environment === 'sandbox' ? '#fefce8' : '#eff6ff') : 'transparent', transition: 'background 0.15s' }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleBundleApi(api.id)} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }} />
                          <span style={{ flex: 1, fontSize: 13, fontWeight: checked ? 600 : 400, color: 'var(--txt-1)' }}>{api.name}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: api.environment === 'prod' ? '#dcfce7' : api.environment === 'sandbox' ? '#fef9c3' : '#dbeafe', color: api.environment === 'prod' ? '#166534' : api.environment === 'sandbox' ? '#854d0e' : '#1e40af' }}>
                            {api.environment.toUpperCase()}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: api.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2', color: api.status === 'ACTIVE' ? '#166534' : '#dc2626' }}>
                            {api.status}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
                {bundleForm.selectedApiIds.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--txt-3)' }}>
                    {bundleForm.selectedApiIds.length} API{bundleForm.selectedApiIds.length !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            </div>
          </Modal>

          {/* Edit Bundle Modal */}
          <Modal
            open={!!editingBundle}
            onClose={() => setEditingBundle(null)}
            title={`Edit Bundle — ${editingBundle?.name ?? ''}`}
            width={520}
            footer={<>
              <Btn variant="ghost" size="sm" onClick={() => setEditingBundle(null)}>Cancel</Btn>
              <Btn variant="primary" size="sm" loading={updateBundleMutation.isPending} onClick={submitEditBundle}>Save Changes</Btn>
            </>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Inp label="Bundle Name" value={editBundleForm.name} onChangeValue={v => setEditBundleForm(f => ({ ...f, name: v }))} error={editBundleErrors.name} placeholder="e.g. Payments Bundle" />
              <Inp label="Description" value={editBundleForm.description} onChangeValue={v => setEditBundleForm(f => ({ ...f, description: v }))} placeholder="Optional description" />
              <Inp label="Rate Limit Override (req/min)" type="number" value={editBundleForm.rateLimitOverride} onChangeValue={v => setEditBundleForm(f => ({ ...f, rateLimitOverride: v }))} placeholder="Leave blank to use default" />

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-2)', marginBottom: 6 }}>
                  Select APIs
                  {editBundleErrors.apis && <span style={{ color: 'var(--red)', marginLeft: 8, fontWeight: 400 }}>{editBundleErrors.apis}</span>}
                </div>
                {!proxyApis || proxyApis.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>No proxy APIs registered yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: editBundleErrors.apis ? '1px solid var(--red)' : '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                    {(proxyApis as ProxyApi[]).map((api: ProxyApi) => {
                      const checked = editBundleForm.selectedApiIds.includes(api.id)
                      return (
                        <label key={api.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', background: checked ? (api.environment === 'prod' ? '#f0fdf4' : api.environment === 'sandbox' ? '#fefce8' : '#eff6ff') : 'transparent', transition: 'background 0.15s' }}>
                          <input type="checkbox" checked={checked} onChange={() => setEditBundleForm(f => ({ ...f, selectedApiIds: checked ? f.selectedApiIds.filter(id => id !== api.id) : [...f.selectedApiIds, api.id] }))} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }} />
                          <span style={{ flex: 1, fontSize: 13, fontWeight: checked ? 600 : 400, color: 'var(--txt-1)' }}>{api.name}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: api.environment === 'prod' ? '#dcfce7' : api.environment === 'sandbox' ? '#fef9c3' : '#dbeafe', color: api.environment === 'prod' ? '#166534' : api.environment === 'sandbox' ? '#854d0e' : '#1e40af' }}>
                            {api.environment.toUpperCase()}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: api.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2', color: api.status === 'ACTIVE' ? '#166534' : '#dc2626' }}>
                            {api.status}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
                {editBundleForm.selectedApiIds.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--txt-3)' }}>
                    {editBundleForm.selectedApiIds.length} API{editBundleForm.selectedApiIds.length !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            </div>
          </Modal>
        </div>
      ),
    },
    {
      key: 'ip-requests',
      label: 'IP Requests',
      icon: <Shield size={13} />,
      children: (
        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Info toggle */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowIpInfo(v => !v)}
              title="How do IP Requests work?"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: showIpInfo ? 'var(--accent)' : 'var(--txt-3)', fontSize: 11, padding: '2px 4px', borderRadius: 4 }}
            >
              <Info size={13} />
              <span>How do IP Requests work?</span>
            </button>
          </div>
          {showIpInfo && (
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.7, marginBottom: 2 }}>
              <div style={{ fontWeight: 600, color: 'var(--txt-1)', marginBottom: 6 }}>IP Whitelist Requests</div>
              <div style={{ marginBottom: 8 }}>
                IP Requests control which IP addresses and CIDR ranges are permitted to reach this partner's APIs.
                Every change goes through an approval workflow before it takes effect.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { action: 'ADD', color: 'var(--green)', desc: 'Whitelist an IP / CIDR — requests that the address be added to the allowed list. Once approved, traffic from that range is permitted through.' },
                  { action: 'REMOVE', color: 'var(--red)', desc: 'De-whitelist an IP / CIDR — requests that the address be removed from the allowed list. Once approved, traffic from that range is blocked.' },
                ].map(r => (
                  <div key={r.action} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: r.color + '22', color: r.color, flexShrink: 0 }}>{r.action}</span>
                    <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>{r.desc}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--txt-3)' }}>
                Pending requests can be <strong style={{ color: 'var(--green)' }}>Approved</strong> or <strong style={{ color: 'var(--red)' }}>Rejected</strong> by an administrator. Approved and rejected requests are kept for audit purposes.
              </div>
            </div>
          )}
          {/* Active whitelist summary */}
          <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Currently Enforced Whitelist
            </div>
            {effectiveWhitelist && effectiveWhitelist.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {effectiveWhitelist.map(cidr => (
                  <span key={cidr} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: 'monospace', padding: '3px 10px', borderRadius: 'var(--r-sm)', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: 'var(--green)' }}>
                    <Check size={10} />
                    {cidr}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>
                No restrictions — all IPs permitted. Add and approve an IP request to enforce a whitelist.
              </span>
            )}
          </div>

          {/* Inline add form */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 160 }}>
              <IpCidrInput
                label="IP / CIDR"
                value={ipInline.ipCidr}
                onChange={v => setIpInline(f => ({ ...f, ipCidr: v }))}
                error={ipInlineErrors.ipCidr}
              />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <Sel
                label="Action"
                options={[{ value: 'ADD', label: 'Add (Allow)' }, { value: 'REMOVE', label: 'Remove (Block)' }]}
                value={ipInline.action}
                onChangeValue={v => setIpInline(f => ({ ...f, action: v }))}
                error={ipInlineErrors.action}
              />
            </div>
            <div style={{ flex: 2, minWidth: 140 }}>
              <Inp
                label="Reason"
                value={ipInline.reason}
                onChangeValue={v => setIpInline(f => ({ ...f, reason: v }))}
                placeholder="Optional"
              />
            </div>
            <Btn
              variant="primary"
              size="sm"
              icon={<Plus size={13} />}
              loading={createIpMutation.isPending}
              onClick={() => {
                if (validateIpInline()) createIpMutation.mutate({ partnerId: selected.id, data: { ...ipInline, action: ipInline.action as 'ADD' | 'REMOVE' } })
              }}
            >
              Submit
            </Btn>
          </div>

          <Tbl
            columns={ipColumns}
            data={ipRequests?.content ?? []}
            rowKey="id"
            loading={ipLoading}
            emptyText="No IP requests"
          />
        </div>
      ),
    },
    {
      key: 'credentials',
      label: 'Credentials',
      icon: <Key size={13} />,
      children: (() => {
        const creds = partnerClients ?? []
        return (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'hidden' }}>

            {/* Toolbar */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>
                  {creds.filter(c => c.status === 'ACTIVE').length} active · {creds.length} total
                </span>
              </div>
              <Btn size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => { setCredDrawerOpen(true); setCredErrors({}) }}>
                New Credential
              </Btn>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clientsLoading ? (
                <div style={{ padding: '20px 0', color: 'var(--txt-3)', fontSize: 13, textAlign: 'center' }}>Loading…</div>
              ) : creds.length === 0 ? (
                <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Key size={18} color="var(--txt-3)" />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-2)' }}>No credentials yet</div>
                  <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>Create a credential so this partner's services can authenticate</div>
                </div>
              ) : creds.map((c: ClientCredential) => (
                <div key={c.id} style={{
                  borderRadius: 9, border: '1px solid var(--border)',
                  background: c.status === 'REVOKED' ? 'transparent' : 'var(--surface)',
                  padding: '10px 14px',
                  opacity: c.status === 'REVOKED' ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    background: c.status === 'ACTIVE' ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'var(--surface-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: c.status === 'ACTIVE' ? 'var(--green)' : 'var(--txt-3)',
                  }}>
                    <Key size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt-1)' }}>{c.name}</span>
                      <Tag color={c.status === 'ACTIVE' ? 'green' : 'red'} style={{ fontSize: 10 }}>{c.status}</Tag>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-3)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                        {c.clientId}
                      </span>
                      {c.permissions?.length > 0 && c.permissions.slice(0, 3).map(p => (
                        <span key={p} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--txt-2)' }}>{p}</span>
                      ))}
                      {(c.permissions?.length ?? 0) > 3 && (
                        <span style={{ fontSize: 10, color: 'var(--txt-3)' }}>+{c.permissions.length - 3}</span>
                      )}
                      {c.expiresAt && (
                        <span style={{ fontSize: 11, color: dayjs(c.expiresAt).isBefore(dayjs()) ? 'var(--red)' : 'var(--txt-3)' }}>
                          Expires {dayjs(c.expiresAt).format('MMM D, YYYY')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <Btn
                      variant="ghost" size="sm" iconOnly icon={<Pencil size={12} />}
                      onClick={() => {
                        setEditingCred(c)
                        setEditCredForm({ name: c.name, description: c.description ?? '', permissions: c.permissions ?? [] })
                        setEditCredErrors({})
                      }}
                    />
                    <Confirm title="Rotate this secret? The new secret will be shown once." onConfirm={() => rotateCredMutation.mutate(c.id)}>
                      <Btn variant="ghost" size="sm" icon={<RotateCcw size={12} />} disabled={c.status === 'REVOKED'} loading={rotateCredMutation.isPending}>
                        Rotate
                      </Btn>
                    </Confirm>
                    <Confirm danger title="Revoke this credential? This cannot be undone." onConfirm={() => revokeCredMutation.mutate(c.id)}>
                      <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={12} />} disabled={c.status === 'REVOKED'} style={{ color: 'var(--red)' }} />
                    </Confirm>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })(),
    },
    {
      key: 'sdk',
      label: 'SDK',
      icon: <ExternalLink size={13} />,
      children: (() => {
        const bundleApiIds = [...new Set((bundles?.content ?? []).flatMap(b => b.apiIds ?? []))]
        const bundleApis   = bundleApiIds.map(id => proxyApis?.find(a => a.id === id)).filter(Boolean)

        return (
          <div style={{ padding: '12px 16px', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Bundle-compiled API list */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                APIs included in this partner's bundles
              </div>
              {bundleApis.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>No API bundles assigned yet — add bundles to populate the SDK.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {bundleApis.map(api => api && (
                    <div key={api.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 7,
                      border: '1px solid var(--border)', background: 'var(--surface)',
                      fontSize: 12,
                    }}>
                      <Zap size={11} color="var(--accent)" />
                      <span style={{ fontWeight: 500, color: 'var(--txt-1)' }}>{api.name}</span>
                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: api.status === 'ACTIVE' ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'var(--surface-2)', color: api.status === 'ACTIVE' ? 'var(--green)' : 'var(--txt-3)', fontWeight: 600 }}>
                        {api.environment?.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ height: 1, background: 'var(--divider)', flexShrink: 0 }} />

            {/* Downloads */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Export
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="secondary" loading={downloadPostmanMutation.isPending} onClick={() => selected && downloadPostmanMutation.mutate(selected.id)}>
                  Postman Collection
                </Btn>
                <Btn size="sm" variant="secondary" loading={downloadOpenApiMutation.isPending} onClick={() => selected && downloadOpenApiMutation.mutate(selected.id)}>
                  OpenAPI Spec
                </Btn>
              </div>
            </div>

            {/* Code snippet */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Code Snippet
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ width: 140 }}>
                  <Sel
                    label="Language"
                    options={[
                      { value: 'curl',       label: 'cURL' },
                      { value: 'python',     label: 'Python' },
                      { value: 'javascript', label: 'JavaScript' },
                      { value: 'java',       label: 'Java' },
                    ]}
                    value={sdkLanguage}
                    onChangeValue={(v) => setSdkLanguage(v as typeof sdkLanguage)}
                  />
                </div>
                <Btn size="sm" variant="secondary" loading={fetchSnippetMutation.isPending} onClick={() => selected && fetchSnippetMutation.mutate({ partnerId: selected.id, lang: sdkLanguage })}>
                  Generate
                </Btn>
              </div>
              {sdkSnippet && (
                <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 12, overflowX: 'auto', fontFamily: 'monospace', maxHeight: 220, margin: '10px 0 0', }}>
                  {sdkSnippet}
                </pre>
              )}
            </div>

          </div>
        )
      })(),
    },
  ] : []

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt-1)' }}>Partner Management</h2>
          <p style={{ margin: '2px 0 0', color: 'var(--txt-3)', fontSize: 13 }}>
            Onboard and manage API consumer partners
          </p>
        </div>
        <Btn variant="primary" size="sm" icon={<Plus size={14} />} onClick={openCreate}>
          New Partner
        </Btn>
      </div>

      {/* Stats */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        <StatCard label="Total Partners"  value={partners.length}                                                       icon={<BarChart3 size={16} />} />
        <StatCard label="Active"          value={partners.filter(p => p.status === 'ACTIVE').length}                    icon={<CheckCircle2 size={16} />} color="var(--green)" />
        <StatCard label="Pending"         value={partners.filter(p => (p.status as string) === 'PENDING').length}       icon={<Clock size={16} />}       color="var(--orange)" />
        <StatCard label="Suspended"       value={partners.filter(p => p.status === 'SUSPENDED').length}                 icon={<XCircle size={16} />}      color="var(--red)" />
      </div>

      {/* Split pane */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>

        {/* Left pane — partner list */}
        <div style={{ width: '35%', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
              <input
                value={partnerSearch}
                onChange={e => setPartnerSearch(e.target.value)}
                placeholder="Search partners…"
                style={{ width: '100%', paddingLeft: 28, paddingRight: 8, paddingTop: 6, paddingBottom: 6, fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-1)', color: 'var(--txt-1)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {isLoading ? (
              <div style={{ padding: 20, color: 'var(--txt-3)', fontSize: 13 }}>Loading…</div>
            ) : filteredPartners.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--txt-3)', fontSize: 13 }}>{partnerSearch ? 'No matches.' : 'No partners yet.'}</div>
            ) : (
              filteredPartners.map((p) => {
                const isActive = selected?.id === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => { setSelected(p); setDetailTab('workflow') }}
                    style={{
                      padding: '11px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      background: isActive ? 'var(--surface-2)' : 'transparent',
                      borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                      borderBottom: '1px solid var(--divider)',
                      transition: 'background var(--dur-fast)',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface-1)' }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: avatarColor(p.name), color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, flexShrink: 0, userSelect: 'none',
                      boxShadow: isActive ? `0 0 0 2px color-mix(in srgb, ${avatarColor(p.name)} 35%, transparent)` : 'none',
                    }}>
                      {initials(p.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                          {p.name}
                        </span>
                        <Tag color={partnerStatusColor(p.status)} style={{ fontSize: 10, padding: '0 5px', flexShrink: 0 }}>{p.status}</Tag>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Tag color={partnerTypeColor(p.type)} style={{ fontSize: 10, padding: '0 5px', flexShrink: 0 }}>{p.type}</Tag>
                        <span style={{ fontSize: 11, color: 'var(--txt-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{p.email}</span>
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--txt-3)', background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>{p.shortCode}</span>
                      </div>
                    </div>
                    {isActive && <ChevronRight size={12} color="var(--accent)" style={{ flexShrink: 0 }} />}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right pane — detail */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div style={{
                width: 60, height: 60, borderRadius: 18,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Building2 size={28} color="var(--txt-3)" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--txt-1)', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No partner selected</div>
                <div style={{ color: 'var(--txt-3)', fontSize: 12 }}>Choose a partner from the list to view their profile, onboarding status, and API bundles</div>
              </div>
            </div>
          ) : (
            <>
              {/* Partner detail header */}
              <div style={{ flexShrink: 0, padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: avatarColor(selected.name), color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, fontWeight: 700, flexShrink: 0, userSelect: 'none',
                  boxShadow: `0 2px 8px color-mix(in srgb, ${avatarColor(selected.name)} 40%, transparent)`,
                }}>
                  {initials(selected.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--txt-1)' }}>{selected.name}</h3>
                    <Tag color={partnerTypeColor(selected.type)}>{selected.type}</Tag>
                    <Tag color={partnerStatusColor(selected.status)}>{selected.status}</Tag>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--txt-3)' }}>
                      <Mail size={11} /> {selected.email}
                    </span>
                    {selected.phone && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--txt-3)' }}>
                        <Phone size={11} /> {selected.phone}
                      </span>
                    )}
                    <span style={{ fontSize: 11, fontFamily: 'monospace', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '1px 7px', borderRadius: 5, color: 'var(--txt-2)' }}>
                      {selected.shortCode}
                    </span>
                    {selected.contractRef && (
                      <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>
                        Contract: <span style={{ color: 'var(--txt-2)', fontWeight: 500 }}>{selected.contractRef}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <Btn size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => openEdit(selected)}>Edit</Btn>
                  <Confirm danger title="Delete this partner?" onConfirm={() => { deleteMutation.mutate(selected.id); setSelected(null) }}>
                    <Btn size="sm" variant="ghost" icon={<Trash2 size={13} />} style={{ color: 'var(--red)' }}>Delete</Btn>
                  </Confirm>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <Tabs items={detailTabs} activeKey={detailTab} onChange={setDetailTab} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Create / Edit Partner Drawer ──────────────────────────────────────── */}
      <Drawer
        title={editing ? `Edit — ${editing.name}` : 'New Partner'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditing(null) }}
        footer={
          <Btn
            variant="primary"
            size="sm"
            loading={createMutation.isPending || updateMutation.isPending}
            onClick={() => {
              if (!validatePartner()) return
              if (editing) {
                updateMutation.mutate({
                  id: editing.id,
                  data: {
                    name: partnerForm.name.trim(),
                    email: partnerForm.email.trim(),
                    phone: partnerForm.phone.trim() || undefined,
                    type: partnerForm.type as Parameters<typeof updatePartner>[1]['type'],
                    status: partnerForm.status as Parameters<typeof updatePartner>[1]['status'],
                    contractRef: partnerForm.contractRef.trim() || undefined,
                  },
                })
              } else {
                createMutation.mutate({
                  name: partnerForm.name.trim(),
                  shortCode: partnerForm.shortCode.trim(),
                  email: partnerForm.email.trim(),
                  phone: partnerForm.phone.trim() || undefined,
                  type: partnerForm.type as Parameters<typeof createPartner>[0]['type'],
                  contractRef: partnerForm.contractRef.trim() || undefined,
                })
              }
            }}
          >
            {editing ? 'Save' : 'Create'}
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Identity preview */}
          {(partnerForm.name || partnerForm.type) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', marginBottom: 16,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 10,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                background: partnerForm.name ? avatarColor(partnerForm.name) : 'var(--border)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, userSelect: 'none',
              }}>
                {partnerForm.name ? initials(partnerForm.name) : '?'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: partnerForm.name ? 'var(--txt-1)' : 'var(--txt-3)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {partnerForm.name || 'Partner name'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {partnerForm.shortCode && (
                    <span style={{ fontSize: 10, fontFamily: 'monospace', background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 4, color: 'var(--txt-2)' }}>{partnerForm.shortCode}</span>
                  )}
                  {partnerForm.type && (
                    <Tag color={partnerTypeColor(partnerForm.type)} style={{ fontSize: 10 }}>{partnerForm.type}</Tag>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section: Identity */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Organisation</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <Inp
              label="Name *"
              value={partnerForm.name}
              onChangeValue={v => setPartnerForm(f => ({ ...f, name: v }))}
              error={partnerErrors.name}
              placeholder="e.g. Zimbabwe Revenue Authority"
            />
            {editing ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-2)', marginBottom: 5 }}>Short Code</div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--txt-1)', flex: 1 }}>{editing.shortCode}</span>
                  <span style={{ fontSize: 10, color: 'var(--txt-3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px' }}>read-only</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 4 }}>Cannot be changed after creation.</div>
              </div>
            ) : (
              <div>
                <Inp
                  label="Short Code *"
                  value={partnerForm.shortCode}
                  onChangeValue={v => setPartnerForm(f => ({ ...f, shortCode: v.toUpperCase() }))}
                  error={partnerErrors.shortCode}
                  placeholder="e.g. ZIMRA"
                />
                <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 4, lineHeight: 1.5 }}>
                  Unique identifier — uppercase letters, numbers and underscores only (2–12 chars). Cannot be changed after creation.
                </div>
              </div>
            )}
            <Sel
              label="Type *"
              options={[
                { value: 'MINISTRY',   label: 'Ministry — Cabinet-level government ministry' },
                { value: 'DEPARTMENT', label: 'Department — Division within a ministry' },
                { value: 'AGENCY',     label: 'Agency — Statutory or regulatory body' },
                { value: 'PARASTATAL', label: 'Parastatal — State-owned enterprise' },
              ]}
              value={partnerForm.type}
              onChangeValue={v => setPartnerForm(f => ({ ...f, type: v }))}
              error={partnerErrors.type}
            />
            {editing && (
              <Sel
                label="Status"
                options={['ACTIVE','INACTIVE','SUSPENDED'].map(k => ({ value: k, label: k }))}
                value={partnerForm.status}
                onChangeValue={v => setPartnerForm(f => ({ ...f, status: v }))}
              />
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--divider)', marginBottom: 16 }} />

          {/* Section: Contact */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Contact</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <Inp
              label="Email *"
              type="email"
              value={partnerForm.email}
              onChangeValue={v => setPartnerForm(f => ({ ...f, email: v }))}
              error={partnerErrors.email}
              placeholder="e.g. ops@zimra.co.zw"
            />
            <Inp
              label="Phone"
              value={partnerForm.phone}
              onChangeValue={v => setPartnerForm(f => ({ ...f, phone: v }))}
              placeholder="e.g. +263 242 000 000"
            />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--divider)', marginBottom: 16 }} />

          {/* Section: Contract */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Contract</div>
          <Inp
            label="Contract Ref"
            value={partnerForm.contractRef}
            onChangeValue={v => setPartnerForm(f => ({ ...f, contractRef: v }))}
            placeholder="e.g. GOZ-MSA-2026-001"
          />
          <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 4, lineHeight: 1.5 }}>
            Reference number of the Master Service Agreement or onboarding contract.
          </div>

        </div>
      </Drawer>

      {/* ── Submit Workflow Step Modal ────────────────────────────────────────── */}
      <Modal
        title="Submit Onboarding Step"
        open={submitStepOpen}
        onClose={() => { setSubmitStepOpen(false); setStepForm({ step: '', status: 'PENDING', notes: '' }) }}
        width={440}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setSubmitStepOpen(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              loading={submitStepMutation.isPending}
              onClick={() => {
                if (validateStep() && selected) submitStepMutation.mutate({ id: selected.id, data: { ...stepForm, status: stepForm.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' } })
              }}
            >
              Submit
            </Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp
            label="Step Name *"
            value={stepForm.step}
            onChangeValue={v => setStepForm(f => ({ ...f, step: v }))}
            error={stepErrors.step}
            placeholder="e.g. KYC Verification"
          />
          <Sel
            label="Initial Status *"
            options={['PENDING','IN_PROGRESS','COMPLETED','FAILED'].map(s => ({ value: s, label: s }))}
            value={stepForm.status}
            onChangeValue={v => setStepForm(f => ({ ...f, status: v }))}
            error={stepErrors.status}
          />
          <Inp
            label="Notes"
            textarea
            value={stepForm.notes}
            onChangeValue={v => setStepForm(f => ({ ...f, notes: v }))}
            placeholder="Any additional notes or context"
          />
        </div>
      </Modal>

      {/* ── IP Review Modal ───────────────────────────────────────────────────── */}
      <Modal
        title={reviewModal?.action === 'APPROVED' ? 'Approve IP Request' : 'Reject IP Request'}
        open={!!reviewModal}
        onClose={() => { setReviewModal(null); setReviewNotes('') }}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => { setReviewModal(null); setReviewNotes('') }}>Cancel</Btn>
            <Btn
              variant={reviewModal?.action === 'REJECTED' ? 'danger' : 'primary'}
              loading={reviewIpMutation.isPending}
              onClick={() => reviewModal && reviewIpMutation.mutate({
                id: reviewModal.id,
                data: { status: reviewModal.action, reviewNotes: reviewNotes || undefined },
              })}
            >
              {reviewModal?.action === 'APPROVED' ? 'Approve' : 'Reject'}
            </Btn>
          </div>
        }
      >
        <Inp
          label="Review Notes (optional)"
          textarea
          value={reviewNotes}
          onChangeValue={setReviewNotes}
          placeholder="Add any notes about this decision"
        />
      </Modal>

      {/* ── New Credential Drawer ─────────────────────────────────────────────── */}
      <Drawer
        title="New Credential"
        open={credDrawerOpen}
        onClose={() => { setCredDrawerOpen(false); setCredErrors({}) }}
        footer={
          <Btn
            variant="primary"
            size="sm"
            icon={<Key size={14} />}
            loading={createCredMutation.isPending}
            onClick={() => {
              if (!validateCred() || !selected) return
              createCredMutation.mutate({
                partnerId: selected.id,
                data: {
                  name: credForm.name.trim(),
                  description: credForm.description.trim() || undefined,
                  permissions: credForm.permissions,
                  expiresAt: credForm.expiresAt ? new Date(credForm.expiresAt).toISOString() : undefined,
                },
              })
            }}
          >
            Create
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp label="Name *" value={credForm.name} onChangeValue={v => setCredForm(f => ({ ...f, name: v }))} error={credErrors.name} placeholder="e.g. Payment Service" />
          <Inp label="Description" value={credForm.description} onChangeValue={v => setCredForm(f => ({ ...f, description: v }))} placeholder="What does this credential do?" />
          <PermissionPicker label="Permissions" value={credForm.permissions} onChange={v => setCredForm(f => ({ ...f, permissions: v }))} />
          <Inp label="Expires At" type="date" value={credForm.expiresAt} onChangeValue={v => setCredForm(f => ({ ...f, expiresAt: v }))} />
        </div>
      </Drawer>

      {/* ── Edit Credential Drawer ────────────────────────────────────────────── */}
      <Drawer
        title={`Edit — ${editingCred?.name ?? ''}`}
        open={!!editingCred}
        onClose={() => { setEditingCred(null); setEditCredErrors({}) }}
        footer={
          <Btn
            variant="primary"
            size="sm"
            loading={updateCredMutation.isPending}
            onClick={() => {
              if (!validateEditCred() || !editingCred) return
              updateCredMutation.mutate({
                id: editingCred.id,
                data: {
                  name: editCredForm.name.trim(),
                  description: editCredForm.description.trim() || undefined,
                  permissions: editCredForm.permissions,
                },
              })
            }}
          >
            Save
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp label="Name *" value={editCredForm.name} onChangeValue={v => setEditCredForm(f => ({ ...f, name: v }))} error={editCredErrors.name} />
          <Inp label="Description" value={editCredForm.description} onChangeValue={v => setEditCredForm(f => ({ ...f, description: v }))} />
          <PermissionPicker label="Permissions" value={editCredForm.permissions} onChange={v => setEditCredForm(f => ({ ...f, permissions: v }))} />
        </div>
      </Drawer>

      {/* ── Secret Reveal Modal ───────────────────────────────────────────────── */}
      <Modal
        title={secretModal?.title}
        open={!!secretModal}
        onClose={() => setSecretModal(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn
              variant="secondary"
              icon={<Copy size={14} />}
              onClick={() => { copyToClipboard(secretModal?.secret ?? ''); toast.success('Secret copied') }}
            >
              Copy Secret
            </Btn>
            <Btn
              variant="secondary"
              icon={<Copy size={14} />}
              onClick={() => {
                const cmd = `curl -s -X POST ${credCurlBase()}/proxy/oauth/token \\\n  -H "Content-Type: application/json" \\\n  -d '{"grant_type":"client_credentials","client_id":"${secretModal?.clientId}","client_secret":"${secretModal?.secret}"}'`
                copyToClipboard(cmd)
                toast.success('cURL command copied')
              }}
            >
              Copy cURL
            </Btn>
            <Btn variant="primary" onClick={() => setSecretModal(null)}>Done</Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)', marginBottom: 4 }}>Client ID</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--txt-1)', padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
              {secretModal?.clientId}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Lock size={12} /> Client Secret
            </div>
            <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-md)', fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 13, color: 'var(--txt-1)', border: '1px solid var(--border)' }}>
              {secretModal?.secret}
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>Token Request (cURL)</div>
              <div style={{ display: 'flex', gap: 2 }}>
                {(['sandbox', 'dev', 'prod'] as const).map(env => (
                  <button key={env} type="button" onClick={() => setCurlEnv(env)} style={{ padding: '2px 8px', fontSize: 10, borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer', background: curlEnv === env ? 'var(--accent)' : 'var(--surface-2)', color: curlEnv === env ? '#fff' : 'var(--txt-2)', fontWeight: curlEnv === env ? 600 : 400 }}>
                    {env}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 'var(--r-md)', fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-1)', border: '1px solid var(--border)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>
              {`curl -s -X POST ${credCurlBase()}/proxy/oauth/token \\\n  -H "Content-Type: application/json" \\\n  -d '{"grant_type":"client_credentials","client_id":"${secretModal?.clientId}","client_secret":"${secretModal?.secret}"}'`}
            </div>
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--orange) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--orange) 30%, transparent)', fontSize: 12, color: 'var(--orange)' }}>
            This secret will only be shown once. Store it securely — it cannot be retrieved after closing this dialog.
          </div>
        </div>
      </Modal>

    </div>
  )
}
