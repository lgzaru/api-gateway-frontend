import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listRateCards, createRateCard, deleteRateCard,
  listBillingRecords, createBillingRecord, finaliseRecord,
  listBillingSummaries, generateBillingSummary, finalizeBillingSummary,
  getBillingConfig, upsertBillingConfig,
  listSmsBillingConfigs, upsertSmsBillingConfig,
  listInvoices, createInvoice, updateInvoiceParties, sendInvoice, markInvoicePaid, voidInvoice,
  listPrepayments, createPrepayment,
} from '../api/billing'
import type {
  RateCard, BillingRecord, BillingSummary, BillingSourceType,
  BillingInvoice, SmsPrepayment, BillingType, InvoiceStatus,
} from '../api/billing'
import { listApis } from '../api/proxy'
import { listPartners, listBundles } from '../api/partners'
import {
  getAllApplications, getMonthlyUsage,
  getSmsGatewayToken, getSmsGatewayUrl,
} from '../api/sms'
import type { SmsApplication, MonthlyUsageResponse } from '../api/sms'
import {
  Btn, Inp, Sel, Tag, Switch, Tbl, Tabs, Modal, Drawer, Confirm, toast,
} from '../components/ui'
import type { Column, TabItem } from '../components/ui'
import {
  Plus, Trash2, CheckCircle2, CreditCard, FileText, BarChart2,
  Layers, MessageSquare, RefreshCw, Send, Receipt, Eye,
} from 'lucide-react'
import dayjs from 'dayjs'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CURRENCIES = ['USD','ZWG','EUR','GBP','KES','NGN','ZAR'].map(c => ({ value: c, label: c }))
const SOURCE_TYPES = [
  { value: 'PROXY_API',       label: 'Proxy API' },
  { value: 'SMS_APPLICATION', label: 'SMS Application' },
]

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0)
  return `${year}-${String(month).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function summaryStatusColor(v: string): 'green' | 'red' | 'muted' {
  if (v === 'FINALIZED') return 'green'
  if (v === 'VOID') return 'red'
  return 'muted'
}

function recordStatusColor(v: string): 'green' | 'red' | 'muted' | 'blue' {
  if (v === 'FINALISED')  return 'green'
  if (v === 'VOID')       return 'red'
  if (v === 'INVOICED')   return 'blue'
  return 'muted'
}

function invoiceStatusColor(v: InvoiceStatus): 'green' | 'red' | 'muted' | 'blue' {
  if (v === 'PAID') return 'green'
  if (v === 'VOID') return 'red'
  if (v === 'SENT') return 'blue'
  return 'muted'
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card-sm" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--txt-1)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── ZWG split display ─────────────────────────────────────────────────────────

function SplitBadge({ usdDue, zwgDue, usdPct, zwgPct }: {
  usdDue: number | null; zwgDue: number | null; usdPct: number; zwgPct: number; currency: string
}) {
  if (!usdDue && !zwgDue) return <span style={{ color: 'var(--txt-3)', fontSize: 12 }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      {usdDue != null && <span style={{ color: 'var(--accent)' }}>${usdDue.toFixed(2)} USD ({usdPct}%)</span>}
      {zwgDue != null && <span style={{ color: 'var(--txt-2)' }}>ZWG {zwgDue.toFixed(2)} ({zwgPct}%)</span>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Billing() {
  // ── Drawer / modal open state ─────────────────────────────────────────────
  const [rateCardDrawer,   setRateCardDrawer]   = useState(false)
  const [recordDrawer,     setRecordDrawer]     = useState(false)
  const [generateOpen,     setGenerateOpen]     = useState(false)
  const [configOpen,       setConfigOpen]       = useState(false)
  const [smsConfigEditOpen,setSmsConfigEditOpen]= useState(false)
  const [invoiceDrawer,    setInvoiceDrawer]    = useState(false)
  const [prepayDrawer,     setPrepayDrawer]     = useState(false)
  const [viewInvoice,      setViewInvoice]      = useState<BillingInvoice | null>(null)
  const [editingParties,   setEditingParties]   = useState(false)
  const [partiesForm,      setPartiesForm]      = useState({
    billToName: '', billToEmail: '', billToPhone: '',
    billFromName: '', billFromEmail: '', billFromPhone: '', billFromWebsite: '',
  })

  // ── Billing Summaries tab ─────────────────────────────────────────────────
  const [summaryPartnerId, setSummaryPartnerId] = useState('')
  const [cfgForm, setCfgForm] = useState({ billingEnabled: false, invoiceEmail: '', currency: 'USD', bundleItems: '' })
  const [genForm, setGenForm] = useState({ periodYear: String(new Date().getFullYear()), periodMonth: '' })
  const [genErrors, setGenErrors] = useState<Record<string, string>>({})

  // ── API Billing tab ───────────────────────────────────────────────────────
  const [selectedApiId, setSelectedApiId] = useState('')

  // ── Rate Card form ────────────────────────────────────────────────────────
  const [rateForm, setRateForm] = useState({
    name: '', sourceType: 'PROXY_API' as BillingSourceType,
    partnerId: '', bundleId: '', proxyApiId: '', applicationId: '',
    pricePer1000Requests: '', monthlyFlatFee: '',
    currency: 'USD', effectiveFrom: '', effectiveTo: '',
  })
  const [rateErrors, setRateErrors] = useState<Record<string, string>>({})

  // ── Billing Record form ───────────────────────────────────────────────────
  const [recordForm, setRecordForm] = useState({
    sourceType: 'PROXY_API' as BillingSourceType,
    billingType: 'POST_PAYMENT' as BillingType,
    partnerId: '', bundleId: '', proxyApiId: '', applicationId: '',
    rateCardId: '', periodStart: '', periodEnd: '',
    zwgRate: '', usdSplitPct: '35', zwgSplitPct: '65', prepaymentId: '',
  })
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({})

  // ── SMS Billing tab ───────────────────────────────────────────────────────
  const [selectedSmsAppId,    setSelectedSmsAppId]    = useState('')
  const [smsUsage,            setSmsUsage]            = useState<MonthlyUsageResponse | null>(null)
  const [smsUsageLoading,     setSmsUsageLoading]     = useState(false)
  const [smsCreateForm,       setSmsCreateForm]       = useState({
    year: String(new Date().getFullYear()), month: '',
    zwgRate: '', usdSplitPct: '35', zwgSplitPct: '65',
  })
  const [smsConfigForm, setSmsConfigForm] = useState({
    billingEnabled: false, rateCardId: '', invoiceEmail: '', currency: 'USD',
  })

  // ── Invoices tab ──────────────────────────────────────────────────────────
  const [invoicePartnerId,  setInvoicePartnerId]  = useState('')
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([])
  const [invoiceForm, setInvoiceForm] = useState({
    partnerId: '', applicationId: '', periodStart: '', periodEnd: '',
    zwgRate: '', usdSplitPct: '35', zwgSplitPct: '65',
    vatPct: '0', billToName: '', billToEmail: '', billToPhone: '', dueDate: '',
    billFromName: '1010 Technologies (Pvt) Ltd', billFromEmail: 'billing@1010tech.io',
    billFromPhone: '', billFromWebsite: 'www.1010tech.io',
    invoiceEmail: '', notes: '',
  })
  const [invoiceErrors, setInvoiceErrors] = useState<Record<string, string>>({})

  // ── Prepayments ───────────────────────────────────────────────────────────
  const [prepayForm, setPrepayForm] = useState({
    partnerId: '', applicationId: '', allocatedSms: '',
    pricePerSmsZwg: '0.12', zwgRate: '', usdSplitPct: '35', zwgSplitPct: '65',
    validFrom: '', validTo: '', notes: '',
  })
  const [prepayErrors, setPrepayErrors] = useState<Record<string, string>>({})

  const smsToken     = getSmsGatewayToken()
  const smsUrl       = getSmsGatewayUrl()
  const smsConnected = !!smsToken
  const qc           = useQueryClient()

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: rateCards,   isLoading: rateCardsLoading } = useQuery({
    queryKey: ['rate-cards'],
    queryFn: () => listRateCards({ size: 200 }),
    select: (r) => r.data,
  })
  const { data: records,     isLoading: recordsLoading } = useQuery({
    queryKey: ['billing-records'],
    queryFn: () => listBillingRecords({ size: 200 }),
    select: (r) => r.data,
  })
  const { data: summaries,   isLoading: summariesLoading } = useQuery({
    queryKey: ['billing-summaries', summaryPartnerId],
    queryFn: () => listBillingSummaries(summaryPartnerId, { size: 24 }),
    enabled: !!summaryPartnerId,
    select: (r) => r.data,
  })
  const { data: billingConfigData } = useQuery({
    queryKey: ['billing-config', summaryPartnerId],
    queryFn: () => getBillingConfig(summaryPartnerId),
    enabled: !!summaryPartnerId,
    select: (r) => r.data,
  })
  const { data: apisData } = useQuery({
    queryKey: ['proxy-apis-all'],
    queryFn: () => listApis({ size: 200 }),
    select: (r) => r.data.content,
  })
  const { data: partnersData } = useQuery({
    queryKey: ['partners-all'],
    queryFn: () => listPartners({ size: 200 }),
    select: (r) => r.data.content,
  })
  const { data: rateBundlesData } = useQuery({
    queryKey: ['bundles-rate', rateForm.partnerId],
    queryFn: () => listBundles(rateForm.partnerId, { size: 50 }),
    enabled: rateCardDrawer && !!rateForm.partnerId,
    select: (r) => r.data.content,
  })
  const { data: recordBundlesData } = useQuery({
    queryKey: ['bundles-record', recordForm.partnerId],
    queryFn: () => listBundles(recordForm.partnerId, { size: 50 }),
    enabled: recordDrawer && !!recordForm.partnerId,
    select: (r) => r.data.content,
  })
  const { data: smsAppsData } = useQuery({
    queryKey: ['sms-apps-billing'],
    queryFn: () => getAllApplications(smsToken, smsUrl),
    enabled: smsConnected,
    select: (r) => r.data as SmsApplication[],
  })
  const { data: smsConfigsData } = useQuery({
    queryKey: ['sms-billing-configs'],
    queryFn: () => listSmsBillingConfigs(),
    select: (r) => r.data,
  })
  const { data: smsRecordsData, isLoading: smsRecordsLoading } = useQuery({
    queryKey: ['billing-records-sms', selectedSmsAppId],
    queryFn: () => listBillingRecords({ applicationId: selectedSmsAppId, size: 50 }),
    enabled: !!selectedSmsAppId,
    select: (r) => r.data,
  })
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['billing-invoices', invoicePartnerId],
    queryFn: () => listInvoices({ partnerId: invoicePartnerId || undefined, size: 100 }),
    select: (r) => r.data,
  })
  const { data: smsPrepaymentsData } = useQuery({
    queryKey: ['prepayments-sms', selectedSmsAppId],
    queryFn: () => listPrepayments({ applicationId: selectedSmsAppId, size: 50 }),
    enabled: !!selectedSmsAppId,
    select: (r) => r.data,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createCardMutation = useMutation({
    mutationFn: createRateCard,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rate-cards'] }); setRateCardDrawer(false); resetRateForm(); toast.success('Rate card created') },
    onError: () => toast.error('Failed to create rate card'),
  })
  const deleteCardMutation = useMutation({
    mutationFn: deleteRateCard,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rate-cards'] }); toast.success('Rate card deleted') },
    onError: () => toast.error('Failed to delete rate card'),
  })
  const createRecordMutation = useMutation({
    mutationFn: createBillingRecord,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-records'] }); setRecordDrawer(false); resetRecordForm(); toast.success('Billing record created') },
    onError: () => toast.error('Failed to create billing record'),
  })
  const finaliseMutation = useMutation({
    mutationFn: (id: string) => finaliseRecord(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-records'] }); toast.success('Record finalised') },
    onError: () => toast.error('Failed to finalise record'),
  })
  const finaliseSmsRecordMutation = useMutation({
    mutationFn: (id: string) => finaliseRecord(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-records-sms', selectedSmsAppId] }); toast.success('Record finalised') },
    onError: () => toast.error('Failed to finalise record'),
  })
  const generateMutation = useMutation({
    mutationFn: generateBillingSummary,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-summaries', summaryPartnerId] }); setGenerateOpen(false); toast.success('Summary generated') },
    onError: () => toast.error('Failed to generate summary'),
  })
  const finalizeSummaryMutation = useMutation({
    mutationFn: finalizeBillingSummary,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-summaries', summaryPartnerId] }); toast.success('Summary finalized') },
    onError: () => toast.error('Failed to finalize summary'),
  })
  const upsertConfigMutation = useMutation({
    mutationFn: (data: Parameters<typeof upsertBillingConfig>[1]) => upsertBillingConfig(summaryPartnerId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-config', summaryPartnerId] }); setConfigOpen(false); toast.success('Config saved') },
    onError: () => toast.error('Failed to save config'),
  })
  const upsertSmsConfigMutation = useMutation({
    mutationFn: (data: Parameters<typeof upsertSmsBillingConfig>[1]) => upsertSmsBillingConfig(selectedSmsAppId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sms-billing-configs'] }); setSmsConfigEditOpen(false); toast.success('SMS billing config saved') },
    onError: () => toast.error('Failed to save SMS billing config'),
  })
  const createSmsRecordMutation = useMutation({
    mutationFn: createBillingRecord,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-records-sms', selectedSmsAppId] })
      setSmsCreateForm({ year: String(new Date().getFullYear()), month: '', zwgRate: '', usdSplitPct: '35', zwgSplitPct: '65' })
      setSmsUsage(null)
      toast.success('Billing record created')
    },
    onError: () => toast.error('Failed to create billing record'),
  })
  const createInvoiceMutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-invoices', invoicePartnerId] })
      qc.invalidateQueries({ queryKey: ['billing-records'] })
      setInvoiceDrawer(false)
      setSelectedRecordIds([])
      setInvoiceForm({ partnerId: '', applicationId: '', periodStart: '', periodEnd: '', zwgRate: '', usdSplitPct: '35', zwgSplitPct: '65', vatPct: '0', billToName: '', billToEmail: '', billToPhone: '', dueDate: '', billFromName: '1010 Technologies (Pvt) Ltd', billFromEmail: 'billing@1010tech.io', billFromPhone: '', billFromWebsite: 'www.1010tech.io', invoiceEmail: '', notes: '' })
      toast.success('Invoice created')
    },
    onError: () => toast.error('Failed to create invoice'),
  })
  const sendInvoiceMutation = useMutation({
    mutationFn: (id: string) => sendInvoice(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-invoices', invoicePartnerId] }); toast.success('Invoice sent') },
    onError: () => toast.error('Failed to send invoice — check email configuration'),
  })
  const paidInvoiceMutation = useMutation({
    mutationFn: (id: string) => markInvoicePaid(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-invoices', invoicePartnerId] }); toast.success('Invoice marked as paid') },
    onError: () => toast.error('Failed to update invoice'),
  })
  const voidInvoiceMutation = useMutation({
    mutationFn: (id: string) => voidInvoice(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-invoices', invoicePartnerId] }); qc.invalidateQueries({ queryKey: ['billing-records'] }); toast.success('Invoice voided') },
    onError: () => toast.error('Failed to void invoice'),
  })
  const updatePartiesMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateInvoiceParties>[1] }) =>
      updateInvoiceParties(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['billing-invoices', invoicePartnerId] })
      setViewInvoice(res.data)
      setEditingParties(false)
      toast.success('Invoice parties updated')
    },
    onError: () => toast.error('Failed to update invoice'),
  })
  const createPrepayMutation = useMutation({
    mutationFn: createPrepayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prepayments-sms', selectedSmsAppId] })
      setPrepayDrawer(false)
      setPrepayForm({ partnerId: '', applicationId: '', allocatedSms: '', pricePerSmsZwg: '0.12', zwgRate: '', usdSplitPct: '35', zwgSplitPct: '65', validFrom: '', validTo: '', notes: '' })
      toast.success('Prepayment created')
    },
    onError: () => toast.error('Failed to create prepayment'),
  })

  // ── Reset helpers ─────────────────────────────────────────────────────────

  function resetRateForm() {
    setRateForm({ name: '', sourceType: 'PROXY_API', partnerId: '', bundleId: '', proxyApiId: '', applicationId: '', pricePer1000Requests: '', monthlyFlatFee: '', currency: 'USD', effectiveFrom: '', effectiveTo: '' })
    setRateErrors({})
  }
  function resetRecordForm() {
    setRecordForm({ sourceType: 'PROXY_API', billingType: 'POST_PAYMENT', partnerId: '', bundleId: '', proxyApiId: '', applicationId: '', rateCardId: '', periodStart: '', periodEnd: '', zwgRate: '', usdSplitPct: '35', zwgSplitPct: '65', prepaymentId: '' })
    setRecordErrors({})
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const apis        = apisData ?? []
  const cards       = rateCards?.content ?? []
  const billingRecs = records?.content ?? []
  const partners    = partnersData ?? []
  const smsApps     = smsAppsData ?? []
  const smsConfigs  = smsConfigsData ?? []
  const invoices    = invoicesData?.content ?? []
  const smsRecords  = smsRecordsData?.content ?? []
  const smsPrepayments = smsPrepaymentsData?.content ?? []

  const totalRevenue = billingRecs
    .filter(r => r.status === 'FINALISED' || r.status === 'INVOICED')
    .reduce((s, r) => s + (r.totalAmount ?? 0), 0)

  const apiNameById     = new Map(apis.map(a => [a.id, a.name]))
  const partnerNameById = new Map(partners.map(p => [p.id, p.name]))
  const smsAppById      = new Map(smsApps.map(a => [a.applicationId, a]))
  const smsConfigById   = new Map(smsConfigs.map(c => [c.applicationId, c]))

  const rateBundles           = rateBundlesData ?? []
  const selectedRateBundle    = rateBundles.find(b => b.id === rateForm.bundleId) ?? null
  const rateApiOptions        = rateForm.sourceType === 'PROXY_API'
    ? (selectedRateBundle ? apis.filter(a => selectedRateBundle.apiIds.includes(a.id)) : apis)
    : []

  const recordBundles         = recordBundlesData ?? []
  const selectedRecordBundle  = recordBundles.find(b => b.id === recordForm.bundleId) ?? null
  const recordApiOptions      = recordForm.sourceType === 'PROXY_API'
    ? (selectedRecordBundle ? apis.filter(a => selectedRecordBundle.apiIds.includes(a.id)) : apis)
    : []

  const partnerOptions        = [{ value: '', label: 'Any partner (global)' }, ...partners.map(p => ({ value: p.id, label: p.name }))]
  const rateBundleOptions     = [{ value: '', label: 'Any bundle' }, ...rateBundles.map(b => ({ value: b.id, label: b.name }))]
  const recordBundleOptions   = [{ value: '', label: 'No bundle' }, ...recordBundles.map(b => ({ value: b.id, label: b.name }))]
  const rateCardOptions       = [{ value: '', label: 'Select rate card' }, ...cards.map(c => ({ value: c.id, label: c.name }))]
  const smsAppOptions         = smsApps.map(a => ({ value: a.applicationId, label: a.applicationName }))

  // Finalised records available to invoice (not yet invoiced)
  const finalisedRecords = billingRecs.filter(r => r.status === 'FINALISED')

  // API Billing tab
  const apiRecords     = selectedApiId ? billingRecs.filter(r => r.proxyApiId === selectedApiId) : []
  const apiRateCard    = selectedApiId ? cards.find(c => c.proxyApiId === selectedApiId) ?? null : null
  const partnerRevenue = apiRecords.reduce((acc, r) => {
    const pid = r.partnerId ?? ''
    if (!acc[pid]) acc[pid] = { requests: 0, amount: 0, currency: r.currency, count: 0 }
    acc[pid].requests += r.requestCount ?? 0
    acc[pid].amount   += r.totalAmount  ?? 0
    acc[pid].count    += 1
    return acc
  }, {} as Record<string, { requests: number; amount: number; currency: string; count: number }>)

  // SMS Billing tab
  const selectedSmsApp    = selectedSmsAppId ? smsAppById.get(selectedSmsAppId) ?? null : null
  const selectedSmsConfig = selectedSmsAppId ? smsConfigById.get(selectedSmsAppId) ?? null : null
  const smsRateCard       = selectedSmsConfig?.rateCardId ? cards.find(c => c.id === selectedSmsConfig.rateCardId) ?? null : null
  const activePrepay      = smsPrepayments.find(p => p.status === 'ACTIVE') ?? null

  // ZWG estimate for SMS create form
  const smsEstimateZwg = smsRateCard && smsUsage != null
    ? (smsRateCard.monthlyFlatFee ?? 0) + (smsUsage.smsCount / 1000 * smsRateCard.pricePer1000Requests)
    : null
  const smsZwgRate     = smsCreateForm.zwgRate ? Number(smsCreateForm.zwgRate) : null
  const smsEstimateUsd = smsEstimateZwg != null && smsZwgRate
    ? (smsEstimateZwg / smsZwgRate) * (Number(smsCreateForm.usdSplitPct) / 100)
    : null
  const smsEstimateDueZwg = smsEstimateZwg != null
    ? smsEstimateZwg * (Number(smsCreateForm.zwgSplitPct) / 100)
    : null

  // ── SMS usage fetch ───────────────────────────────────────────────────────

  async function fetchSmsUsage() {
    if (!smsCreateForm.year || !smsCreateForm.month || !selectedSmsAppId) return
    setSmsUsageLoading(true); setSmsUsage(null)
    try {
      const res = await getMonthlyUsage(selectedSmsAppId, Number(smsCreateForm.year), Number(smsCreateForm.month), smsToken, smsUrl)
      setSmsUsage(res.data)
    } catch { toast.error('Failed to fetch SMS usage for that period') }
    finally { setSmsUsageLoading(false) }
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validateRate() {
    const e: Record<string, string> = {}
    if (!rateForm.name.trim()) e.name = 'Required'
    if (!rateForm.pricePer1000Requests) e.pricePer1000Requests = 'Required'
    if (!rateForm.effectiveFrom) e.effectiveFrom = 'Required'
    setRateErrors(e); return Object.keys(e).length === 0
  }
  function validateRecord() {
    const e: Record<string, string> = {}
    if (!recordForm.partnerId.trim()) e.partnerId = 'Required'
    if (recordForm.sourceType === 'PROXY_API') {
      if (!recordForm.bundleId.trim())   e.bundleId   = 'Required'
      if (!recordForm.proxyApiId.trim()) e.proxyApiId = 'Required'
    } else {
      if (!recordForm.applicationId.trim()) e.applicationId = 'Required'
    }
    if (!recordForm.rateCardId.trim()) e.rateCardId = 'Required'
    if (!recordForm.periodStart)       e.periodStart = 'Required'
    if (!recordForm.periodEnd)         e.periodEnd   = 'Required'
    setRecordErrors(e); return Object.keys(e).length === 0
  }
  function validateGen() {
    const e: Record<string, string> = {}
    if (!genForm.periodYear)  e.periodYear  = 'Required'
    if (!genForm.periodMonth) e.periodMonth = 'Required'
    setGenErrors(e); return Object.keys(e).length === 0
  }
  function validateInvoice() {
    const e: Record<string, string> = {}
    if (!invoiceForm.partnerId)    e.partnerId    = 'Required'
    if (!invoiceForm.periodStart)  e.periodStart  = 'Required'
    if (!invoiceForm.periodEnd)    e.periodEnd    = 'Required'
    if (selectedRecordIds.length === 0) e.records = 'Select at least one record'
    setInvoiceErrors(e); return Object.keys(e).length === 0
  }
  function validatePrepay() {
    const e: Record<string, string> = {}
    if (!prepayForm.partnerId)    e.partnerId    = 'Required'
    if (!prepayForm.applicationId) e.applicationId = 'Required'
    if (!prepayForm.allocatedSms || Number(prepayForm.allocatedSms) <= 0) e.allocatedSms = 'Required'
    if (!prepayForm.validFrom)    e.validFrom    = 'Required'
    setPrepayErrors(e); return Object.keys(e).length === 0
  }

  // ── Column definitions ────────────────────────────────────────────────────

  const summaryColumns: Column<BillingSummary>[] = [
    { key: 'period',    title: 'Period',   width: 110, render: (r) => `${MONTHS[r.periodMonth - 1]} ${r.periodYear}` },
    { key: 'requests',  title: 'Requests', width: 110, render: (r) => r.totalRequests?.toLocaleString() ?? '—' },
    { key: 'amount',    title: 'Amount',   width: 130, render: (r) => r.totalAmount != null ? `${Number(r.totalAmount).toFixed(2)} ${r.currency}` : '—' },
    { key: 'status',    title: 'Status',   width: 100, render: (r) => <Tag color={summaryStatusColor(r.status)}>{r.status}</Tag> },
    { key: 'finalized', title: 'Finalized', width: 130, render: (r) => r.finalizedAt ? dayjs(r.finalizedAt).format('MMM D, YYYY') : <span style={{ color: 'var(--txt-3)' }}>—</span> },
    {
      key: 'action', title: '', width: 100,
      render: (r) => r.status === 'DRAFT' ? (
        <Btn size="sm" variant="primary" icon={<CheckCircle2 size={13} />}
          loading={finalizeSummaryMutation.isPending && finalizeSummaryMutation.variables === r.id}
          onClick={() => finalizeSummaryMutation.mutate(r.id)}>Finalize</Btn>
      ) : null,
    },
  ]

  const rateCardColumns: Column<RateCard>[] = [
    { key: 'name', title: 'Name', render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    {
      key: 'scope', title: 'Scope', width: 220,
      render: (r) => {
        if (r.sourceType === 'SMS_APPLICATION') {
          const app = r.applicationId ? smsAppById.get(r.applicationId) : null
          return <Tag color="muted"><MessageSquare size={10} style={{ marginRight: 4 }} />{app?.applicationName ?? r.applicationId?.slice(0,8) ?? 'SMS'}</Tag>
        }
        return <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          {r.partnerId && <span style={{ color: 'var(--txt-2)' }}>{partnerNameById.get(r.partnerId) ?? r.partnerId.slice(0,8)}</span>}
          {r.proxyApiId ? <span>{apiNameById.get(r.proxyApiId) ?? r.proxyApiId.slice(0,8)}</span> : <Tag color="muted">Any API</Tag>}
        </span>
      },
    },
    { key: 'price', title: 'Price / 1k', width: 120, render: (r) => `${r.pricePer1000Requests} ${r.currency}` },
    { key: 'fee',   title: 'Flat Fee',   width: 100, render: (r) => r.monthlyFlatFee ? `${r.monthlyFlatFee} ${r.currency}` : '—' },
    { key: 'from',  title: 'From',       width: 120, render: (r) => dayjs(r.effectiveFrom).format('MMM D, YYYY') },
    { key: 'to',    title: 'To',         width: 120, render: (r) => r.effectiveTo ? dayjs(r.effectiveTo).format('MMM D, YYYY') : <Tag color="green">Current</Tag> },
    {
      key: 'del', title: '', width: 60,
      render: (r) => (
        <Confirm danger title="Delete this rate card?" onConfirm={() => deleteCardMutation.mutate(r.id)}>
          <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
        </Confirm>
      ),
    },
  ]

  const recordColumns: Column<BillingRecord>[] = [
    { key: 'status', title: 'Status', width: 90, render: (r) => <Tag color={recordStatusColor(r.status)} style={{ fontWeight: 700 }}>{r.status}</Tag> },
    { key: 'type',   title: 'Type',   width: 90, render: (r) => <Tag color={r.billingType === 'PREPAYMENT' ? 'blue' : 'muted'}>{r.billingType === 'PREPAYMENT' ? 'Prepaid' : 'Post-pay'}</Tag> },
    {
      key: 'partner', title: 'Partner', width: 160,
      render: (r) => <span style={{ fontSize: 12 }}>{r.partnerId ? (partnerNameById.get(r.partnerId) ?? r.partnerId.slice(0,8)) : '—'}</span>,
    },
    {
      key: 'source', title: 'Source', width: 140,
      render: (r) => r.sourceType === 'SMS_APPLICATION'
        ? <Tag color="muted"><MessageSquare size={10} style={{ marginRight: 4 }} />{smsAppById.get(r.applicationId ?? '')?.applicationName ?? (r.applicationId?.slice(0,8) ?? 'SMS')}</Tag>
        : <span style={{ fontSize: 12 }}>{apiNameById.get(r.proxyApiId ?? '') ?? (r.proxyApiId ?? '').slice(0,8)}</span>,
    },
    { key: 'period', title: 'Period', width: 190, render: (r) => `${dayjs(r.periodStart).format('MMM D')} – ${dayjs(r.periodEnd).format('MMM D, YYYY')}` },
    { key: 'count',  title: 'Count',  width: 90,  render: (r) => r.requestCount?.toLocaleString() ?? '—' },
    {
      key: 'amount', title: 'Amount', width: 150,
      render: (r) => r.zwgRate
        ? <SplitBadge usdDue={r.usdDue} zwgDue={r.zwgDue} usdPct={r.usdSplitPct} zwgPct={r.zwgSplitPct} currency={r.currency} />
        : (r.totalAmount != null ? <span style={{ fontWeight: 600 }}>{r.totalAmount.toFixed(2)} {r.currency}</span> : <span style={{ color: 'var(--txt-3)' }}>Pending</span>),
    },
    {
      key: 'finalise', title: '', width: 90,
      render: (r) => r.status === 'DRAFT' ? (
        <Btn size="sm" variant="primary" icon={<CheckCircle2 size={13} />}
          loading={finaliseMutation.isPending && finaliseMutation.variables === r.id}
          onClick={() => finaliseMutation.mutate(r.id)}>Finalise</Btn>
      ) : null,
    },
  ]

  const smsRecordColumns: Column<BillingRecord>[] = [
    { key: 'status', title: 'Status', width: 90,  render: (r) => <Tag color={recordStatusColor(r.status)} style={{ fontWeight: 700 }}>{r.status}</Tag> },
    { key: 'type',   title: 'Type',   width: 90,  render: (r) => <Tag color={r.billingType === 'PREPAYMENT' ? 'blue' : 'muted'}>{r.billingType === 'PREPAYMENT' ? 'Prepaid' : 'Post-pay'}</Tag> },
    { key: 'period', title: 'Period', width: 190, render: (r) => `${dayjs(r.periodStart).format('MMM D')} – ${dayjs(r.periodEnd).format('MMM D, YYYY')}` },
    { key: 'count',  title: 'SMS',    width: 100, render: (r) => r.requestCount?.toLocaleString() ?? '—' },
    {
      key: 'amount', title: 'Due', width: 160,
      render: (r) => r.zwgRate
        ? <SplitBadge usdDue={r.usdDue} zwgDue={r.zwgDue} usdPct={r.usdSplitPct} zwgPct={r.zwgSplitPct} currency={r.currency} />
        : (r.totalAmount != null ? <span style={{ fontWeight: 600 }}>{r.totalAmount.toFixed(2)} {r.currency}</span> : <span style={{ color: 'var(--txt-3)' }}>Pending</span>),
    },
    {
      key: 'finalise', title: '', width: 90,
      render: (r) => r.status === 'DRAFT' ? (
        <Btn size="sm" variant="primary" icon={<CheckCircle2 size={13} />}
          loading={finaliseSmsRecordMutation.isPending && finaliseSmsRecordMutation.variables === r.id}
          onClick={() => finaliseSmsRecordMutation.mutate(r.id)}>Finalise</Btn>
      ) : null,
    },
  ]

  const invoiceColumns: Column<BillingInvoice>[] = [
    { key: 'num',    title: 'Invoice #', width: 140, render: (r) => <span style={{ fontWeight: 700 }}>{r.invoiceNumber}</span> },
    { key: 'status', title: 'Status',    width: 90,  render: (r) => <Tag color={invoiceStatusColor(r.status)}>{r.status}</Tag> },
    { key: 'period', title: 'Period',    width: 190, render: (r) => `${dayjs(r.periodStart).format('MMM D')} – ${dayjs(r.periodEnd).format('MMM D, YYYY')}` },
    {
      key: 'amount', title: 'Due', width: 200,
      render: (r) => r.zwgRate
        ? <SplitBadge usdDue={r.usdDue} zwgDue={r.zwgDue} usdPct={r.usdSplitPct} zwgPct={r.zwgSplitPct} currency="ZWG" />
        : <span style={{ fontWeight: 600 }}>${r.subtotalUsd.toFixed(2)}</span>,
    },
    { key: 'sent',   title: 'Sent',      width: 130, render: (r) => r.sentAt ? dayjs(r.sentAt).format('MMM D, YYYY') : <span style={{ color: 'var(--txt-3)' }}>—</span> },
    { key: 'email',  title: 'Email',     width: 160, render: (r) => <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>{r.invoiceEmail ?? '—'}</span> },
    {
      key: 'actions', title: '', width: 260,
      render: (r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn size="sm" variant="ghost" icon={<Eye size={12} />}
            onClick={() => setViewInvoice(r)}>View</Btn>
          {r.status === 'DRAFT' || r.status === 'SENT' ? (
            <Btn size="sm" variant="ghost" icon={<Send size={12} />}
              loading={sendInvoiceMutation.isPending && sendInvoiceMutation.variables === r.id}
              onClick={() => sendInvoiceMutation.mutate(r.id)}>Send</Btn>
          ) : null}
          {(r.status === 'SENT' || r.status === 'DRAFT') ? (
            <Btn size="sm" variant="primary" icon={<CheckCircle2 size={12} />}
              loading={paidInvoiceMutation.isPending && paidInvoiceMutation.variables === r.id}
              onClick={() => paidInvoiceMutation.mutate(r.id)}>Paid</Btn>
          ) : null}
          {r.status !== 'PAID' && r.status !== 'VOID' ? (
            <Confirm danger title={`Void invoice ${r.invoiceNumber}?`} onConfirm={() => voidInvoiceMutation.mutate(r.id)}>
              <Btn size="sm" variant="ghost" icon={<Trash2 size={12} />} />
            </Confirm>
          ) : null}
        </div>
      ),
    },
  ]

  const prepayColumns: Column<SmsPrepayment>[] = [
    { key: 'status',   title: 'Status',     width: 100, render: (r) => <Tag color={r.status === 'ACTIVE' ? 'green' : r.status === 'EXHAUSTED' ? 'red' : 'muted'}>{r.status}</Tag> },
    { key: 'alloc',    title: 'Allocated',  width: 110, render: (r) => r.allocatedSms.toLocaleString() },
    { key: 'used',     title: 'Used',       width: 90,  render: (r) => r.usedSms.toLocaleString() },
    { key: 'rem',      title: 'Remaining',  width: 100, render: (r) => <span style={{ fontWeight: 600, color: r.remainingSms === 0 ? 'var(--red)' : 'var(--green)' }}>{r.remainingSms.toLocaleString()}</span> },
    {
      key: 'cost', title: 'Prepaid',        width: 200,
      render: (r) => r.zwgRate
        ? <SplitBadge usdDue={r.prepaidUsd} zwgDue={r.prepaidZwg} usdPct={r.usdSplitPct} zwgPct={r.zwgSplitPct} currency="ZWG" />
        : <span>{r.prepaidZwg != null ? `ZWG ${r.prepaidZwg.toFixed(2)}` : '—'}</span>,
    },
    { key: 'from',     title: 'Valid From', width: 120, render: (r) => dayjs(r.validFrom).format('MMM D, YYYY') },
    { key: 'to',       title: 'Valid To',   width: 120, render: (r) => r.validTo ? dayjs(r.validTo).format('MMM D, YYYY') : <Tag color="green">Open</Tag> },
  ]

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const tabs: TabItem[] = [

    // ── Billing Summaries ─────────────────────────────────────────────────
    {
      key: 'summaries',
      label: 'Billing Summaries',
      icon: <BarChart2 size={14} />,
      children: (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          <div style={{ width: '35%', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Inp label="Partner ID" value={summaryPartnerId} onChangeValue={setSummaryPartnerId} placeholder="Paste partner UUID" />
            {summaryPartnerId && (
              <>
                {billingConfigData && (
                  <div className="card-sm">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span className="section-label">Billing Config</span>
                      <Btn variant="link" size="sm" onClick={() => { setCfgForm({ billingEnabled: billingConfigData.billingEnabled ?? false, invoiceEmail: billingConfigData.invoiceEmail ?? '', currency: billingConfigData.currency ?? 'USD', bundleItems: (billingConfigData.bundleItems ?? []).join(', ') }); setConfigOpen(true) }}>Edit</Btn>
                    </div>
                    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--txt-3)', width: 90 }}>Enabled</span><Tag color={billingConfigData.billingEnabled ? 'green' : 'muted'} dot>{billingConfigData.billingEnabled ? 'Yes' : 'No'}</Tag></div>
                      <div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--txt-3)', width: 90 }}>Currency</span><span>{billingConfigData.currency ?? '—'}</span></div>
                    </div>
                  </div>
                )}
                <Btn variant="primary" size="sm" icon={<Plus size={14} />} block onClick={() => setGenerateOpen(true)}>Generate Summary</Btn>
              </>
            )}
          </div>
          <div style={{ flex: 1, overflow: 'hidden', padding: '12px 14px' }}>
            {!summaryPartnerId
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-3)', fontSize: 14 }}>Enter a partner ID to view billing summaries.</div>
              : <Tbl columns={summaryColumns} data={summaries?.content ?? []} rowKey="id" loading={summariesLoading} emptyText="No billing summaries" />
            }
          </div>
        </div>
      ),
    },

    // ── Rate Cards ────────────────────────────────────────────────────────
    {
      key: 'rate-cards',
      label: 'Rate Cards',
      icon: <CreditCard size={14} />,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Btn variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => { resetRateForm(); setRateCardDrawer(true) }}>New Rate Card</Btn>
          </div>
          <Tbl columns={rateCardColumns} data={cards} rowKey="id" loading={rateCardsLoading} emptyText="No rate cards" />
        </div>
      ),
    },

    // ── Billing Records ───────────────────────────────────────────────────
    {
      key: 'records',
      label: 'Billing Records',
      icon: <FileText size={14} />,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Btn variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => { resetRecordForm(); setRecordDrawer(true) }}>New Record</Btn>
          </div>
          <Tbl columns={recordColumns} data={billingRecs} rowKey="id" loading={recordsLoading} emptyText="No billing records" />
        </div>
      ),
    },

    // ── Invoices ──────────────────────────────────────────────────────────
    {
      key: 'invoices',
      label: 'Invoices',
      icon: <Receipt size={14} />,
      children: (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          <div style={{ width: '30%', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Sel label="Partner" options={partnerOptions} value={invoicePartnerId} onChangeValue={setInvoicePartnerId} placeholder="All partners" />
            <Btn variant="primary" size="sm" icon={<Plus size={13} />} block
              onClick={() => { setSelectedRecordIds([]); setInvoiceForm(f => ({ ...f, partnerId: invoicePartnerId })); setInvoiceDrawer(true) }}>
              Create Invoice
            </Btn>
            {finalisedRecords.length > 0 && (
              <div className="card-sm" style={{ background: 'var(--bg-2)' }}>
                <div className="section-label" style={{ marginBottom: 6 }}>Pending Invoicing</div>
                <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{finalisedRecords.length} finalised record{finalisedRecords.length !== 1 ? 's' : ''} awaiting invoice</div>
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflow: 'hidden', padding: '12px 14px' }}>
            <Tbl columns={invoiceColumns} data={invoices} rowKey="id" loading={invoicesLoading} emptyText="No invoices" />
          </div>
        </div>
      ),
    },

    // ── API Billing ───────────────────────────────────────────────────────
    {
      key: 'api-billing',
      label: 'API Billing',
      icon: <Layers size={14} />,
      children: (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          <div style={{ width: '28%', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Sel label="API" options={apis.map(a => ({ value: a.id, label: a.name }))} value={selectedApiId} onChangeValue={setSelectedApiId} placeholder="Select an API" />
            {selectedApiId && (apiRateCard ? (
              <div className="card-sm">
                <div className="section-label" style={{ marginBottom: 6 }}>Rate Card</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{apiRateCard.name}</div>
                <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 4 }}>{apiRateCard.pricePer1000Requests} {apiRateCard.currency} / 1k req{apiRateCard.monthlyFlatFee ? ` + ${apiRateCard.monthlyFlatFee} flat` : ''}</div>
              </div>
            ) : <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>No rate card assigned.</div>)}
            {selectedApiId && Object.keys(partnerRevenue).length > 0 && (
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>Revenue by Partner</div>
                {Object.entries(partnerRevenue).map(([pid, stats]) => (
                  <div key={pid} className="card-sm" style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--txt-2)' }}>{partnerNameById.get(pid) ?? pid.slice(0,8)}</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>{stats.amount.toFixed(2)} {stats.currency}</div>
                    <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>{stats.requests.toLocaleString()} reqs</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflow: 'hidden', padding: '12px 14px', display: 'flex', flexDirection: 'column' }}>
            {!selectedApiId
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-3)', fontSize: 14 }}>Select an API.</div>
              : <><div className="section-label" style={{ marginBottom: 8 }}>Records — {apiRecords.length}</div><div style={{ flex: 1, overflow: 'hidden' }}><Tbl columns={recordColumns.filter(c => c.key !== 'source')} data={apiRecords} rowKey="id" loading={recordsLoading} emptyText="No records" /></div></>
            }
          </div>
        </div>
      ),
    },

    // ── SMS Billing ───────────────────────────────────────────────────────
    {
      key: 'sms-billing',
      label: 'SMS Billing',
      icon: <MessageSquare size={14} />,
      children: !smsConnected ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-3)', fontSize: 14 }}>
          SMS gateway not connected. Configure it in the SMS Gateway module first.
        </div>
      ) : (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          <div style={{ width: '28%', borderRight: '1px solid var(--border)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {smsApps.length} Application{smsApps.length !== 1 ? 's' : ''}
            </div>
            {smsApps.map(app => {
              const cfg = smsConfigById.get(app.applicationId)
              return (
                <div key={app.applicationId} onClick={() => setSelectedSmsAppId(app.applicationId)}
                  style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: app.applicationId === selectedSmsAppId ? 'var(--bg-2)' : undefined, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{app.applicationName}</span>
                    <Tag color={cfg?.billingEnabled ? 'green' : 'muted'} dot>{cfg?.billingEnabled ? 'On' : 'Off'}</Tag>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>{app.smsCount.toLocaleString()} SMS</div>
                </div>
              )
            })}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!selectedSmsAppId
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-3)', fontSize: 14 }}>Select an application.</div>
              : <>
                  {/* Config */}
                  <div className="card-sm">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span className="section-label">Billing Configuration</span>
                      <Btn variant="link" size="sm" onClick={() => { setSmsConfigForm({ billingEnabled: selectedSmsConfig?.billingEnabled ?? false, rateCardId: selectedSmsConfig?.rateCardId ?? '', invoiceEmail: selectedSmsConfig?.invoiceEmail ?? '', currency: selectedSmsConfig?.currency ?? 'USD' }); setSmsConfigEditOpen(true) }}>Edit</Btn>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13 }}>
                      <div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--txt-3)', minWidth: 80 }}>Billing</span><Tag color={selectedSmsConfig?.billingEnabled ? 'green' : 'muted'} dot>{selectedSmsConfig?.billingEnabled ? 'Enabled' : 'Disabled'}</Tag></div>
                      <div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--txt-3)', minWidth: 80 }}>Rate Card</span><span>{smsRateCard?.name ?? '—'}</span></div>
                      <div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--txt-3)', minWidth: 80 }}>Currency</span><span>{selectedSmsConfig?.currency ?? '—'}</span></div>
                      <div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--txt-3)', minWidth: 80 }}>Invoice</span><span style={{ wordBreak: 'break-all', fontSize: 12 }}>{selectedSmsConfig?.invoiceEmail ?? '—'}</span></div>
                    </div>
                    {smsRateCard && <div style={{ marginTop: 8, padding: '6px 8px', background: 'var(--bg-1)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--txt-3)' }}>{smsRateCard.pricePer1000Requests} {smsRateCard.currency} / 1k SMS{smsRateCard.monthlyFlatFee ? ` + ${smsRateCard.monthlyFlatFee} flat` : ''}</div>}
                  </div>

                  {/* Prepayments */}
                  <div className="card-sm">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span className="section-label">Prepayments</span>
                      <Btn variant="primary" size="sm" icon={<Plus size={12} />} onClick={() => { setPrepayForm(f => ({ ...f, applicationId: selectedSmsAppId })); setPrepayDrawer(true) }}>Add Prepayment</Btn>
                    </div>
                    {activePrepay ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--bg-1)', borderRadius: 'var(--r-sm)' }}>
                          <div style={{ fontWeight: 700, fontSize: 18 }}>{activePrepay.allocatedSms.toLocaleString()}</div>
                          <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>Allocated</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--bg-1)', borderRadius: 'var(--r-sm)' }}>
                          <div style={{ fontWeight: 700, fontSize: 18 }}>{activePrepay.usedSms.toLocaleString()}</div>
                          <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>Used</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '8px 4px', background: activePrepay.remainingSms === 0 ? 'rgba(var(--red-rgb),.1)' : 'rgba(var(--green-rgb),.1)', borderRadius: 'var(--r-sm)' }}>
                          <div style={{ fontWeight: 700, fontSize: 18, color: activePrepay.remainingSms === 0 ? 'var(--red)' : 'var(--green)' }}>{activePrepay.remainingSms.toLocaleString()}</div>
                          <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>Remaining</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>No active prepayment — billing will be post-payment.</div>
                    )}
                    {smsPrepayments.length > 0 && (
                      <div style={{ marginTop: 10, overflow: 'hidden' }}>
                        <Tbl columns={prepayColumns} data={smsPrepayments} rowKey="id" emptyText="" />
                      </div>
                    )}
                  </div>

                  {/* Live usage */}
                  {selectedSmsApp && (
                    <div className="card-sm">
                      <div className="section-label" style={{ marginBottom: 8 }}>Current Month</div>
                      <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                        <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{selectedSmsApp.smsCount.toLocaleString()}</div><div style={{ fontSize: 12, color: 'var(--txt-3)' }}>SMS sent</div></div>
                        <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--txt-2)' }}>{selectedSmsApp.maxLimit.toLocaleString()}</div><div style={{ fontSize: 12, color: 'var(--txt-3)' }}>Limit</div></div>
                      </div>
                    </div>
                  )}

                  {/* Create billing record */}
                  <div className="card-sm">
                    <div className="section-label" style={{ marginBottom: 10 }}>Create Billing Record</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
                        <Inp label="Year" type="number" value={smsCreateForm.year} onChangeValue={v => { setSmsCreateForm(f => ({ ...f, year: v })); setSmsUsage(null) }} />
                        <Sel label="Month" options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} value={smsCreateForm.month} onChangeValue={v => { setSmsCreateForm(f => ({ ...f, month: v })); setSmsUsage(null) }} placeholder="Month" />
                        <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} />} loading={smsUsageLoading} disabled={!smsCreateForm.year || !smsCreateForm.month} onClick={fetchSmsUsage}>Fetch</Btn>
                      </div>
                      {/* ZWG rate + split */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <Inp label="RBZ Rate (ZWG/USD)" type="number" value={smsCreateForm.zwgRate} onChangeValue={v => setSmsCreateForm(f => ({ ...f, zwgRate: v }))} placeholder="e.g. 26.89" />
                        <Inp label="USD split %" type="number" value={smsCreateForm.usdSplitPct} onChangeValue={v => setSmsCreateForm(f => ({ ...f, usdSplitPct: v }))} />
                        <Inp label="ZWG split %" type="number" value={smsCreateForm.zwgSplitPct} onChangeValue={v => setSmsCreateForm(f => ({ ...f, zwgSplitPct: v }))} />
                      </div>
                      {smsUsage && (
                        <div style={{ padding: '8px 10px', background: 'var(--bg-1)', borderRadius: 'var(--r-sm)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--txt-3)' }}>SMS Count</span><span style={{ fontWeight: 700 }}>{smsUsage.smsCount.toLocaleString()}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--txt-3)' }}>Source</span><Tag color={smsUsage.source === 'ARCHIVE' ? 'green' : 'muted'}>{smsUsage.source}</Tag></div>
                          {smsEstimateZwg != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--txt-3)' }}>Total (ZWG)</span><span style={{ fontWeight: 700 }}>ZWG {smsEstimateZwg.toFixed(2)}</span></div>}
                          {smsEstimateUsd != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--txt-3)' }}>USD Due ({smsCreateForm.usdSplitPct}%)</span><span style={{ fontWeight: 700, color: 'var(--accent)' }}>${smsEstimateUsd.toFixed(2)}</span></div>}
                          {smsEstimateDueZwg != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--txt-3)' }}>ZWG Due ({smsCreateForm.zwgSplitPct}%)</span><span style={{ fontWeight: 700 }}>ZWG {smsEstimateDueZwg.toFixed(2)}</span></div>}
                          {activePrepay && activePrepay.remainingSms >= (smsUsage.smsCount) && <Tag color="blue" style={{ marginTop: 4 }}>Covered by active prepayment</Tag>}
                        </div>
                      )}
                      <Btn variant="primary" size="sm" icon={<Plus size={13} />}
                        disabled={!smsUsage || !selectedSmsConfig?.rateCardId}
                        loading={createSmsRecordMutation.isPending}
                        onClick={() => {
                          if (!smsUsage || !smsCreateForm.year || !smsCreateForm.month) return
                          const y = Number(smsCreateForm.year), m = Number(smsCreateForm.month)
                          const hasPrepay = activePrepay && activePrepay.remainingSms >= smsUsage.smsCount
                          createSmsRecordMutation.mutate({
                            sourceType: 'SMS_APPLICATION',
                            applicationId: selectedSmsAppId,
                            usageCount: smsUsage.smsCount,
                            rateCardId: selectedSmsConfig?.rateCardId ?? undefined,
                            periodStart: `${y}-${String(m).padStart(2,'0')}-01`,
                            periodEnd: lastDayOfMonth(y, m),
                            billingType: hasPrepay ? 'PREPAYMENT' : 'POST_PAYMENT',
                            prepaymentId: hasPrepay ? activePrepay.id : undefined,
                            zwgRate: smsCreateForm.zwgRate ? Number(smsCreateForm.zwgRate) : undefined,
                            usdSplitPct: Number(smsCreateForm.usdSplitPct),
                            zwgSplitPct: Number(smsCreateForm.zwgSplitPct),
                          })
                        }}>
                        {!selectedSmsConfig?.rateCardId ? 'Assign rate card first' : 'Create Record'}
                      </Btn>
                    </div>
                  </div>

                  {/* Records */}
                  <div>
                    <div className="section-label" style={{ marginBottom: 8 }}>Billing Records — {smsRecords.length}</div>
                    <Tbl columns={smsRecordColumns} data={smsRecords} rowKey="id" loading={smsRecordsLoading} emptyText="No billing records" />
                  </div>
                </>
            }
          </div>
        </div>
      ),
    },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>

      <div style={{ flexShrink: 0, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Billing</h2>
        <p style={{ margin: '2px 0 0', color: 'var(--txt-3)', fontSize: 13 }}>Rate cards, billing records, invoices, and prepayments</p>
      </div>

      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        <StatCard label="Rate Cards" value={cards.length} />
        <StatCard label="Draft Records" value={billingRecs.filter(r => r.status === 'DRAFT').length} />
        <StatCard label="Invoices" value={invoices.length} color="var(--accent)" />
        <StatCard label="Total Billed" value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} color="var(--green)" />
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Tabs items={tabs} />
      </div>

      {/* ── Rate Card Drawer ───────────────────────────────────────────────── */}
      <Drawer title="New Rate Card" open={rateCardDrawer} onClose={() => setRateCardDrawer(false)}
        footer={<Btn variant="primary" size="sm" loading={createCardMutation.isPending}
          onClick={() => { if (validateRate()) createCardMutation.mutate({ ...rateForm, pricePer1000Requests: Number(rateForm.pricePer1000Requests), monthlyFlatFee: rateForm.monthlyFlatFee ? Number(rateForm.monthlyFlatFee) : undefined, proxyApiId: rateForm.proxyApiId || undefined, applicationId: rateForm.applicationId || undefined, partnerId: rateForm.partnerId || undefined, bundleId: rateForm.bundleId || undefined }) }}>Create</Btn>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp label="Name *" value={rateForm.name} onChangeValue={v => setRateForm(f => ({ ...f, name: v }))} error={rateErrors.name} />
          <Sel label="Source Type" options={SOURCE_TYPES} value={rateForm.sourceType}
            onChangeValue={v => setRateForm(f => ({ ...f, sourceType: v as BillingSourceType, partnerId: '', bundleId: '', proxyApiId: '', applicationId: '' }))} />
          {rateForm.sourceType === 'PROXY_API' ? (
            <>
              <Sel label="Partner" options={partnerOptions} value={rateForm.partnerId}
                onChangeValue={v => setRateForm(f => ({ ...f, partnerId: v, bundleId: '', proxyApiId: '' }))} />
              {rateForm.partnerId && <Sel label="Bundle" options={rateBundleOptions} value={rateForm.bundleId}
                onChangeValue={v => setRateForm(f => ({ ...f, bundleId: v, proxyApiId: '' }))} />}
              <Sel label="API" options={[{ value: '', label: 'Any API' }, ...rateApiOptions.map(a => ({ value: a.id, label: a.name }))]}
                value={rateForm.proxyApiId} onChangeValue={v => setRateForm(f => ({ ...f, proxyApiId: v }))} />
            </>
          ) : (
            <Sel label="SMS Application" options={[{ value: '', label: 'Any app' }, ...smsAppOptions]}
              value={rateForm.applicationId} onChangeValue={v => setRateForm(f => ({ ...f, applicationId: v }))} />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Price / 1k *" type="number" value={rateForm.pricePer1000Requests} onChangeValue={v => setRateForm(f => ({ ...f, pricePer1000Requests: v }))} error={rateErrors.pricePer1000Requests} />
            <Inp label="Monthly Flat Fee" type="number" value={rateForm.monthlyFlatFee} onChangeValue={v => setRateForm(f => ({ ...f, monthlyFlatFee: v }))} />
          </div>
          <Sel label="Currency" options={CURRENCIES} value={rateForm.currency} onChangeValue={v => setRateForm(f => ({ ...f, currency: v }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Effective From *" type="date" value={rateForm.effectiveFrom} onChangeValue={v => setRateForm(f => ({ ...f, effectiveFrom: v }))} error={rateErrors.effectiveFrom} />
            <Inp label="Effective To" type="date" value={rateForm.effectiveTo} onChangeValue={v => setRateForm(f => ({ ...f, effectiveTo: v }))} />
          </div>
        </div>
      </Drawer>

      {/* ── Billing Record Drawer ──────────────────────────────────────────── */}
      <Drawer title="New Billing Record" open={recordDrawer} onClose={() => setRecordDrawer(false)}
        footer={<Btn variant="primary" size="sm" loading={createRecordMutation.isPending}
          onClick={() => { if (validateRecord()) createRecordMutation.mutate({ ...recordForm, proxyApiId: recordForm.proxyApiId || undefined, applicationId: recordForm.applicationId || undefined, partnerId: recordForm.partnerId || undefined, bundleId: recordForm.bundleId || undefined, rateCardId: recordForm.rateCardId || undefined, zwgRate: recordForm.zwgRate ? Number(recordForm.zwgRate) : undefined, usdSplitPct: Number(recordForm.usdSplitPct), zwgSplitPct: Number(recordForm.zwgSplitPct), prepaymentId: recordForm.prepaymentId || undefined }) }}>Create</Btn>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Sel label="Source Type" options={SOURCE_TYPES} value={recordForm.sourceType}
            onChangeValue={v => setRecordForm(f => ({ ...f, sourceType: v as BillingSourceType, partnerId: '', bundleId: '', proxyApiId: '', applicationId: '' }))} />
          <Sel label="Billing Type" options={[{ value: 'POST_PAYMENT', label: 'Post-payment' }, { value: 'PREPAYMENT', label: 'Prepayment' }]}
            value={recordForm.billingType} onChangeValue={v => setRecordForm(f => ({ ...f, billingType: v as BillingType }))} />
          {recordForm.sourceType === 'PROXY_API' ? (
            <>
              <Sel label="Partner *" options={partners.map(p => ({ value: p.id, label: p.name }))} value={recordForm.partnerId}
                onChangeValue={v => setRecordForm(f => ({ ...f, partnerId: v, bundleId: '', proxyApiId: '' }))} error={recordErrors.partnerId} />
              {recordForm.partnerId && <Sel label="Bundle *" options={recordBundleOptions} value={recordForm.bundleId}
                onChangeValue={v => setRecordForm(f => ({ ...f, bundleId: v, proxyApiId: '' }))} error={recordErrors.bundleId} />}
              {recordForm.bundleId && <Sel label="API *" options={recordApiOptions.map(a => ({ value: a.id, label: a.name }))} value={recordForm.proxyApiId}
                onChangeValue={v => setRecordForm(f => ({ ...f, proxyApiId: v }))} error={recordErrors.proxyApiId} />}
            </>
          ) : (
            <>
              <Sel label="Partner" options={partnerOptions} value={recordForm.partnerId} onChangeValue={v => setRecordForm(f => ({ ...f, partnerId: v }))} />
              <Sel label="SMS Application *" options={smsAppOptions} value={recordForm.applicationId}
                onChangeValue={v => setRecordForm(f => ({ ...f, applicationId: v }))} error={recordErrors.applicationId} />
            </>
          )}
          <Sel label="Rate Card *" options={rateCardOptions} value={recordForm.rateCardId}
            onChangeValue={v => setRecordForm(f => ({ ...f, rateCardId: v }))} error={recordErrors.rateCardId} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Period Start *" type="date" value={recordForm.periodStart} onChangeValue={v => setRecordForm(f => ({ ...f, periodStart: v }))} error={recordErrors.periodStart} />
            <Inp label="Period End *" type="date" value={recordForm.periodEnd} onChangeValue={v => setRecordForm(f => ({ ...f, periodEnd: v }))} error={recordErrors.periodEnd} />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Currency Split (ZWG billing)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Inp label="RBZ Rate" type="number" value={recordForm.zwgRate} onChangeValue={v => setRecordForm(f => ({ ...f, zwgRate: v }))} placeholder="e.g. 26.89" />
              <Inp label="USD %" type="number" value={recordForm.usdSplitPct} onChangeValue={v => setRecordForm(f => ({ ...f, usdSplitPct: v }))} />
              <Inp label="ZWG %" type="number" value={recordForm.zwgSplitPct} onChangeValue={v => setRecordForm(f => ({ ...f, zwgSplitPct: v }))} />
            </div>
          </div>
        </div>
      </Drawer>

      {/* ── Invoice Drawer ─────────────────────────────────────────────────── */}
      <Drawer title="Create Proforma Invoice" open={invoiceDrawer} onClose={() => setInvoiceDrawer(false)} width={580}
        footer={<Btn variant="primary" size="sm" loading={createInvoiceMutation.isPending}
          onClick={() => { if (validateInvoice()) createInvoiceMutation.mutate({ partnerId: invoiceForm.partnerId, applicationId: invoiceForm.applicationId || undefined, periodStart: invoiceForm.periodStart, periodEnd: invoiceForm.periodEnd, billingRecordIds: selectedRecordIds, zwgRate: invoiceForm.zwgRate ? Number(invoiceForm.zwgRate) : undefined, usdSplitPct: Number(invoiceForm.usdSplitPct), zwgSplitPct: Number(invoiceForm.zwgSplitPct), vatPct: Number(invoiceForm.vatPct) || undefined, billToName: invoiceForm.billToName || undefined, billToEmail: invoiceForm.billToEmail || undefined, billToPhone: invoiceForm.billToPhone || undefined, dueDate: invoiceForm.dueDate || undefined, billFromName: invoiceForm.billFromName || undefined, billFromEmail: invoiceForm.billFromEmail || undefined, billFromPhone: invoiceForm.billFromPhone || undefined, billFromWebsite: invoiceForm.billFromWebsite || undefined, invoiceEmail: invoiceForm.invoiceEmail || undefined, notes: invoiceForm.notes || undefined }) }}>Create Invoice</Btn>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Bill From */}
          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>Bill From</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Inp label="Company Name" value={invoiceForm.billFromName} onChangeValue={v => setInvoiceForm(f => ({ ...f, billFromName: v }))} />
              <Inp label="Website" value={invoiceForm.billFromWebsite} onChangeValue={v => setInvoiceForm(f => ({ ...f, billFromWebsite: v }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <Inp label="Email" value={invoiceForm.billFromEmail} onChangeValue={v => setInvoiceForm(f => ({ ...f, billFromEmail: v }))} />
              <Inp label="Phone" value={invoiceForm.billFromPhone} onChangeValue={v => setInvoiceForm(f => ({ ...f, billFromPhone: v }))} />
            </div>
          </div>

          {/* Bill To */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Bill To</div>
            <Sel label="Partner *" options={partners.map(p => ({ value: p.id, label: p.name }))} value={invoiceForm.partnerId}
              error={invoiceErrors.partnerId}
              onChangeValue={v => {
                const p = partners.find(x => x.id === v)
                setInvoiceForm(f => ({ ...f, partnerId: v, billToName: p?.name ?? '', billToEmail: p?.email ?? '', billToPhone: p?.phone ?? '' }))
              }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <Inp label="Name" value={invoiceForm.billToName} onChangeValue={v => setInvoiceForm(f => ({ ...f, billToName: v }))} />
              <Inp label="Phone" value={invoiceForm.billToPhone} onChangeValue={v => setInvoiceForm(f => ({ ...f, billToPhone: v }))} />
            </div>
            <div style={{ marginTop: 8 }}>
              <Inp label="Email" value={invoiceForm.billToEmail} onChangeValue={v => setInvoiceForm(f => ({ ...f, billToEmail: v }))} />
            </div>
          </div>

          {/* Dates */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Dates</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Inp label="Period Start *" type="date" value={invoiceForm.periodStart} onChangeValue={v => setInvoiceForm(f => ({ ...f, periodStart: v }))} error={invoiceErrors.periodStart} />
              <Inp label="Period End *" type="date" value={invoiceForm.periodEnd} onChangeValue={v => setInvoiceForm(f => ({ ...f, periodEnd: v }))} error={invoiceErrors.periodEnd} />
              <Inp label="Due Date" type="date" value={invoiceForm.dueDate} onChangeValue={v => setInvoiceForm(f => ({ ...f, dueDate: v }))} />
            </div>
          </div>

          {/* Currency + VAT */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Currency & Tax</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              <Inp label="RBZ Rate" type="number" value={invoiceForm.zwgRate} onChangeValue={v => setInvoiceForm(f => ({ ...f, zwgRate: v }))} placeholder="26.89" />
              <Inp label="USD %" type="number" value={invoiceForm.usdSplitPct} onChangeValue={v => setInvoiceForm(f => ({ ...f, usdSplitPct: v }))} />
              <Inp label="ZWG %" type="number" value={invoiceForm.zwgSplitPct} onChangeValue={v => setInvoiceForm(f => ({ ...f, zwgSplitPct: v }))} />
              <Inp label="VAT %" type="number" value={invoiceForm.vatPct} onChangeValue={v => setInvoiceForm(f => ({ ...f, vatPct: v }))} placeholder="0" />
            </div>
          </div>

          {/* Billing records */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="section-label">Select Billing Records *</span>
              {invoiceErrors.records && <span style={{ fontSize: 12, color: 'var(--red)' }}>{invoiceErrors.records}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {finalisedRecords.length === 0 && <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>No finalised records available.</div>}
              {finalisedRecords.map(r => {
                const checked = selectedRecordIds.includes(r.id)
                return (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: checked ? 'var(--bg-2)' : 'var(--bg-1)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={checked} onChange={e => setSelectedRecordIds(ids => e.target.checked ? [...ids, r.id] : ids.filter(i => i !== r.id))} />
                    <span style={{ flex: 1 }}>
                      {r.sourceType === 'SMS_APPLICATION' ? (smsAppById.get(r.applicationId ?? '')?.applicationName ?? r.applicationId?.slice(0,8)) : (apiNameById.get(r.proxyApiId ?? '') ?? r.proxyApiId?.slice(0,8))}
                      <span style={{ color: 'var(--txt-3)', marginLeft: 6 }}>{dayjs(r.periodStart).format('MMM D')}–{dayjs(r.periodEnd).format('MMM D, YYYY')}</span>
                    </span>
                    <span style={{ fontWeight: 600 }}>{r.totalAmount?.toFixed(2)} {r.currency}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <Inp label="Invoice / Delivery Email" value={invoiceForm.invoiceEmail} onChangeValue={v => setInvoiceForm(f => ({ ...f, invoiceEmail: v }))} placeholder="client@example.com" />
          <Inp label="Notes" value={invoiceForm.notes} onChangeValue={v => setInvoiceForm(f => ({ ...f, notes: v }))} placeholder="Payment terms, reference, etc." />
        </div>
      </Drawer>

      {/* ── Prepayment Drawer ──────────────────────────────────────────────── */}
      <Drawer title="Create Prepayment" open={prepayDrawer} onClose={() => setPrepayDrawer(false)}
        footer={<Btn variant="primary" size="sm" loading={createPrepayMutation.isPending}
          onClick={() => { if (validatePrepay()) createPrepayMutation.mutate({ partnerId: prepayForm.partnerId, applicationId: prepayForm.applicationId, allocatedSms: Number(prepayForm.allocatedSms), pricePerSmsZwg: Number(prepayForm.pricePerSmsZwg), zwgRate: prepayForm.zwgRate ? Number(prepayForm.zwgRate) : undefined, usdSplitPct: Number(prepayForm.usdSplitPct), zwgSplitPct: Number(prepayForm.zwgSplitPct), validFrom: prepayForm.validFrom, validTo: prepayForm.validTo || undefined, notes: prepayForm.notes || undefined }) }}>Create</Btn>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Sel label="Partner *" options={partners.map(p => ({ value: p.id, label: p.name }))} value={prepayForm.partnerId}
            onChangeValue={v => setPrepayForm(f => ({ ...f, partnerId: v }))} error={prepayErrors.partnerId} />
          <Sel label="SMS Application *" options={smsAppOptions} value={prepayForm.applicationId}
            onChangeValue={v => setPrepayForm(f => ({ ...f, applicationId: v }))} error={prepayErrors.applicationId} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Allocated SMS *" type="number" value={prepayForm.allocatedSms} onChangeValue={v => setPrepayForm(f => ({ ...f, allocatedSms: v }))} error={prepayErrors.allocatedSms} placeholder="e.g. 742704" />
            <Inp label="Price per SMS (ZWG)" type="number" value={prepayForm.pricePerSmsZwg} onChangeValue={v => setPrepayForm(f => ({ ...f, pricePerSmsZwg: v }))} placeholder="0.12" />
          </div>
          {/* Computed cost preview */}
          {prepayForm.allocatedSms && Number(prepayForm.allocatedSms) > 0 && prepayForm.pricePerSmsZwg && (
            <div style={{ padding: '8px 10px', background: 'var(--bg-1)', borderRadius: 'var(--r-sm)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--txt-3)' }}>Total (ZWG)</span>
                <span style={{ fontWeight: 700 }}>ZWG {(Number(prepayForm.allocatedSms) * Number(prepayForm.pricePerSmsZwg)).toFixed(2)}</span>
              </div>
              {prepayForm.zwgRate && Number(prepayForm.zwgRate) > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: 'var(--txt-3)' }}>USD Due ({prepayForm.usdSplitPct}%)</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>${((Number(prepayForm.allocatedSms) * Number(prepayForm.pricePerSmsZwg) / Number(prepayForm.zwgRate)) * (Number(prepayForm.usdSplitPct) / 100)).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: 'var(--txt-3)' }}>ZWG Due ({prepayForm.zwgSplitPct}%)</span>
                    <span style={{ fontWeight: 700 }}>ZWG {(Number(prepayForm.allocatedSms) * Number(prepayForm.pricePerSmsZwg) * (Number(prepayForm.zwgSplitPct) / 100)).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Currency Split</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Inp label="RBZ Rate" type="number" value={prepayForm.zwgRate} onChangeValue={v => setPrepayForm(f => ({ ...f, zwgRate: v }))} placeholder="26.89" />
              <Inp label="USD %" type="number" value={prepayForm.usdSplitPct} onChangeValue={v => setPrepayForm(f => ({ ...f, usdSplitPct: v }))} />
              <Inp label="ZWG %" type="number" value={prepayForm.zwgSplitPct} onChangeValue={v => setPrepayForm(f => ({ ...f, zwgSplitPct: v }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Valid From *" type="date" value={prepayForm.validFrom} onChangeValue={v => setPrepayForm(f => ({ ...f, validFrom: v }))} error={prepayErrors.validFrom} />
            <Inp label="Valid To" type="date" value={prepayForm.validTo} onChangeValue={v => setPrepayForm(f => ({ ...f, validTo: v }))} />
          </div>
          <Inp label="Notes" value={prepayForm.notes} onChangeValue={v => setPrepayForm(f => ({ ...f, notes: v }))} />
        </div>
      </Drawer>

      {/* ── Generate Summary Modal ─────────────────────────────────────────── */}
      <Modal title="Generate Billing Summary" open={generateOpen} onClose={() => setGenerateOpen(false)}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={() => setGenerateOpen(false)}>Cancel</Btn>
          <Btn variant="primary" loading={generateMutation.isPending}
            onClick={() => { if (validateGen()) generateMutation.mutate({ partnerId: summaryPartnerId, periodYear: Number(genForm.periodYear), periodMonth: Number(genForm.periodMonth) }) }}>Generate</Btn>
        </div>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Inp label="Year *" type="number" value={genForm.periodYear} onChangeValue={v => setGenForm(f => ({ ...f, periodYear: v }))} error={genErrors.periodYear} />
          <Sel label="Month *" options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} value={genForm.periodMonth} onChangeValue={v => setGenForm(f => ({ ...f, periodMonth: v }))} placeholder="Select month" error={genErrors.periodMonth} />
        </div>
      </Modal>

      {/* ── Partner Billing Config Modal ───────────────────────────────────── */}
      <Modal title="Billing Configuration" open={configOpen} onClose={() => setConfigOpen(false)} width={440}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={() => setConfigOpen(false)}>Cancel</Btn>
          <Btn variant="primary" loading={upsertConfigMutation.isPending}
            onClick={() => upsertConfigMutation.mutate({ ...cfgForm, bundleItems: cfgForm.bundleItems ? cfgForm.bundleItems.split(',').map(s => s.trim()).filter(Boolean) : [] })}>Save</Btn>
        </div>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="field-label">Billing Enabled</span>
            <Switch checked={cfgForm.billingEnabled} onChange={v => setCfgForm(f => ({ ...f, billingEnabled: v }))} />
          </div>
          <Inp label="Invoice Email" value={cfgForm.invoiceEmail} onChangeValue={v => setCfgForm(f => ({ ...f, invoiceEmail: v }))} />
          <Sel label="Currency" options={CURRENCIES} value={cfgForm.currency} onChangeValue={v => setCfgForm(f => ({ ...f, currency: v }))} />
        </div>
      </Modal>

      {/* ── SMS Billing Config Modal ───────────────────────────────────────── */}
      <Modal title={`SMS Billing — ${selectedSmsApp?.applicationName ?? ''}`} open={smsConfigEditOpen} onClose={() => setSmsConfigEditOpen(false)} width={440}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={() => setSmsConfigEditOpen(false)}>Cancel</Btn>
          <Btn variant="primary" loading={upsertSmsConfigMutation.isPending}
            onClick={() => upsertSmsConfigMutation.mutate({ billingEnabled: smsConfigForm.billingEnabled, rateCardId: smsConfigForm.rateCardId || null, invoiceEmail: smsConfigForm.invoiceEmail || undefined, currency: smsConfigForm.currency })}>Save</Btn>
        </div>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="field-label">Billing Enabled</span>
            <Switch checked={smsConfigForm.billingEnabled} onChange={v => setSmsConfigForm(f => ({ ...f, billingEnabled: v }))} />
          </div>
          <Sel label="Rate Card" options={[{ value: '', label: 'None' }, ...cards.map(c => ({ value: c.id, label: `${c.name} (${c.pricePer1000Requests} ${c.currency}/1k)` }))]}
            value={smsConfigForm.rateCardId} onChangeValue={v => setSmsConfigForm(f => ({ ...f, rateCardId: v }))} />
          <Inp label="Invoice Email" value={smsConfigForm.invoiceEmail} onChangeValue={v => setSmsConfigForm(f => ({ ...f, invoiceEmail: v }))} />
          <Sel label="Currency" options={CURRENCIES} value={smsConfigForm.currency} onChangeValue={v => setSmsConfigForm(f => ({ ...f, currency: v }))} />
        </div>
      </Modal>

      {/* ── Invoice Preview Modal ──────────────────────────────────────────── */}
      {viewInvoice && (() => {
        const inv = viewInvoice
        const lineItems = billingRecs.filter(r => inv.billingRecordIds.includes(r.id))
        const totalWithVatZwg = inv.subtotalZwg + (inv.vatZwg ?? 0)
        const fromName    = inv.billFromName    ?? '1010 Technologies (Pvt) Ltd'
        const fromEmail   = inv.billFromEmail   ?? 'billing@1010tech.io'
        const fromPhone   = inv.billFromPhone   ?? ''
        const fromWebsite = inv.billFromWebsite ?? 'www.1010tech.io'

        async function printInvoice() {
          let logoDataUrl = ''
          try {
            const resp = await fetch(`${import.meta.env.BASE_URL}logo.png`)
            const blob = await resp.blob()
            logoDataUrl = await new Promise<string>(resolve => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.readAsDataURL(blob)
            })
          } catch { /* logo optional */ }

          const logoHtml = logoDataUrl
            ? `<img src="${logoDataUrl}" style="height:52px;width:52px;object-fit:contain;border-radius:6px;margin-right:14px;vertical-align:middle" alt="logo" />`
            : ''

          const rows = lineItems.map((r, i) => {
            const label = r.sourceType === 'SMS_APPLICATION'
              ? (smsAppById.get(r.applicationId ?? '')?.applicationName ?? r.applicationId ?? 'SMS Application')
              : (apiNameById.get(r.proxyApiId ?? '') ?? r.proxyApiId ?? 'Proxy API')
            const desc = r.sourceType === 'SMS_APPLICATION'
              ? `SMS Notification Service — ${label}`
              : `API Gateway Usage — ${label}`
            const period = `${dayjs(r.periodStart).format('D MMM YYYY')} to ${dayjs(r.periodEnd).format('D MMM YYYY')}`
            const unitZwg = r.zwgRate && r.currency !== 'ZWG' ? r.totalAmount * r.zwgRate : r.totalAmount
            const unitUsd = r.zwgRate && r.currency !== 'USD' ? r.totalAmount / r.zwgRate : r.totalAmount
            return `<tr style="background:${i%2===1?'#f9fafb':'#fff'}">
              <td>
                <div class="item-title">${desc}</div>
                <div class="item-meta">Period: ${period}</div>
                <div class="item-meta">Qty: ${(r.requestCount ?? 0).toLocaleString()} ${r.sourceType === 'SMS_APPLICATION' ? 'SMS' : 'requests'}</div>
              </td>
              <td>ZWG ${unitZwg.toFixed(2)}</td>
              <td>$${unitUsd.toFixed(2)}</td>
            </tr>`
          }).join('')

          const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${inv.invoiceNumber}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #e5e7eb; }
  #page { background: #fff; width: 780px; margin: 24px auto; box-shadow: 0 4px 24px rgba(0,0,0,.15); }
  @media print {
    body { background: #fff; font-size: 11pt; }
    #page { width: 100%; margin: 0; box-shadow: none; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
  .hdr { background: #0f1e3c; color: #fff; padding: 20px 26px; display: flex; justify-content: space-between; align-items: center; }
  .hdr-left { display: flex; align-items: center; gap: 14px; }
  .hdr-logo { height: 52px; width: 52px; object-fit: contain; border-radius: 6px; background: rgba(255,255,255,.12); padding: 4px; flex-shrink: 0; }
  .hdr-name { font-size: 20px; font-weight: 800; letter-spacing: -.3px; }
  .hdr-sub { font-size: 11px; opacity: .65; margin-top: 3px; }
  .hdr-right { text-align: right; }
  .hdr-label { font-size: 11px; font-weight: 700; letter-spacing: 1.4px; opacity: .75; text-transform: uppercase; }
  .hdr-num { font-size: 22px; font-weight: 800; letter-spacing: .5px; margin-top: 2px; }
  .meta { display: table; width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-top: none; }
  .meta-cell { display: table-cell; padding: 16px 20px; vertical-align: top; border-right: 1px solid #e5e7eb; width: 33%; }
  .meta-cell:last-child { border-right: none; width: 26%; }
  .meta-cap { font-size: 10px; font-weight: 700; color: #9ca3af; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 7px; }
  .meta-name { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 3px; }
  .meta-line { font-size: 12px; color: #4b5563; margin-top: 2px; }
  .meta-kv { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; gap: 8px; }
  .meta-kv span:first-child { color: #9ca3af; white-space: nowrap; }
  .meta-kv span:last-child { font-weight: 600; text-align: right; }
  .items { width: 100%; border-collapse: collapse; margin-top: 24px; }
  .items thead tr { background: #f3f4f6; }
  .items th { padding: 9px 16px; font-size: 10px; font-weight: 700; color: #6b7280; letter-spacing: .07em; text-transform: uppercase; border-bottom: 2px solid #d1d5db; }
  .items th:first-child { text-align: left; }
  .items th:not(:first-child) { text-align: right; white-space: nowrap; width: 130px; }
  .items td { padding: 11px 16px; border-bottom: 1px solid #f0f0f0; vertical-align: top; font-size: 13px; }
  .items td:not(:first-child) { text-align: right; white-space: nowrap; }
  .item-title { font-weight: 600; font-size: 13px; color: #111; }
  .item-meta { font-size: 11px; color: #9ca3af; margin-top: 3px; }
  .totals { width: 360px; margin-left: auto; margin-top: 16px; border: 1px solid #e5e7eb; border-collapse: collapse; }
  .totals td { padding: 7px 14px; font-size: 12px; }
  .totals .tot-label { color: #6b7280; }
  .totals .tot-val { text-align: right; font-weight: 600; }
  .tot-dark { background: #0f1e3c; }
  .tot-dark td { color: #fff; font-weight: 700; }
  .tot-dark .tot-val { font-size: 15px; font-weight: 800; }
  .tot-usd { background: #eff6ff; }
  .tot-usd td { color: #1d4ed8; font-weight: 700; }
  .tot-usd .tot-val { font-size: 15px; font-weight: 800; }
  .tot-zwg { background: #f0fdf4; }
  .tot-zwg td { color: #15803d; font-weight: 700; }
  .tot-zwg .tot-val { font-size: 15px; font-weight: 800; }
  .notes { margin: 16px 0 0; padding: 11px 15px; background: #fffbeb; border-left: 4px solid #f59e0b; font-size: 12px; color: #92400e; }
  .footer { margin-top: 28px; padding: 12px 0; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; }
  .split-note { margin-top: 6px; text-align: right; font-size: 10px; color: #9ca3af; }
</style></head><body>
<div id="page">

<div class="hdr">
  <div class="hdr-left">
    ${logoHtml ? logoHtml.replace('style="height:52px;width:52px', 'class="hdr-logo" style="height:44px;width:44px') : ''}
    <div>
      <div class="hdr-name">${fromName}</div>
      <div class="hdr-sub">${fromWebsite}${fromEmail ? ' · ' + fromEmail : ''}${fromPhone ? ' · ' + fromPhone : ''}</div>
    </div>
  </div>
  <div class="hdr-right">
    <div class="hdr-label">Proforma Invoice</div>
    <div class="hdr-num">${inv.invoiceNumber}</div>
  </div>
</div>

<div class="meta">
  <div class="meta-cell">
    <div class="meta-cap">From</div>
    <div class="meta-name">${fromName}</div>
    ${fromEmail   ? `<div class="meta-line">${fromEmail}</div>` : ''}
    ${fromWebsite ? `<div class="meta-line">${fromWebsite}</div>` : ''}
    ${fromPhone   ? `<div class="meta-line">${fromPhone}</div>` : ''}
  </div>
  <div class="meta-cell">
    <div class="meta-cap">Bill To</div>
    <div class="meta-name">${inv.billToName ?? partnerNameById.get(inv.partnerId) ?? ''}</div>
    ${inv.billToEmail ? `<div class="meta-line">${inv.billToEmail}</div>` : ''}
    ${inv.billToPhone ? `<div class="meta-line">${inv.billToPhone}</div>` : ''}
  </div>
  <div class="meta-cell">
    <div class="meta-cap">Details</div>
    <div class="meta-kv"><span>Invoice Date</span><span>${dayjs(inv.createdAt).format('D MMM YYYY')}</span></div>
    ${inv.dueDate ? `<div class="meta-kv"><span>Due Date</span><span style="color:#dc2626;font-weight:700">${dayjs(inv.dueDate).format('D MMM YYYY')}</span></div>` : ''}
    <div class="meta-kv"><span>Period</span><span>${dayjs(inv.periodStart).format('D MMM')}–${dayjs(inv.periodEnd).format('D MMM YY')}</span></div>
    ${inv.zwgRate ? `<div class="meta-kv"><span>RBZ Rate</span><span>1 USD = ${inv.zwgRate} ZWG</span></div>` : ''}
    <div class="meta-kv"><span>Status</span><span style="color:${inv.status==='PAID'?'#16a34a':inv.status==='VOID'?'#dc2626':'#2563eb'};font-weight:700">${inv.status}</span></div>
  </div>
</div>

<table class="items">
  <thead><tr>
    <th>Description</th>
    <th>Amount (ZWG)</th>
    <th>Amount (USD)</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<table class="totals">
  <tr><td class="tot-label">Subtotal (ZWG)</td><td class="tot-val">ZWG ${inv.subtotalZwg.toFixed(2)}</td></tr>
  <tr><td class="tot-label">Subtotal (USD)</td><td class="tot-val">$${inv.subtotalUsd.toFixed(2)}</td></tr>
  ${inv.vatPct > 0 ? `<tr><td class="tot-label">VAT (${inv.vatPct}%) ZWG</td><td class="tot-val">ZWG ${(inv.vatZwg??0).toFixed(2)}</td></tr>
  <tr><td class="tot-label">VAT (${inv.vatPct}%) USD</td><td class="tot-val">$${(inv.vatUsd??0).toFixed(2)}</td></tr>` : ''}
  <tr class="tot-dark"><td style="padding:8px 12px;font-weight:700;font-size:12px">Total (ZWG incl. VAT)</td><td style="padding:8px 12px;text-align:right;font-weight:800;font-size:14px">ZWG ${totalWithVatZwg.toFixed(2)}</td></tr>
  ${inv.zwgRate && inv.usdDue != null && inv.zwgDue != null ? `
  <tr class="tot-usd"><td class="tot-label">Due in USD (${inv.usdSplitPct}%)</td><td class="tot-val">$${inv.usdDue.toFixed(2)}</td></tr>
  <tr class="tot-zwg"><td class="tot-label">Due in ZWG (${inv.zwgSplitPct}%)</td><td class="tot-val">ZWG ${inv.zwgDue.toFixed(2)}</td></tr>` : ''}
</table>
${inv.zwgRate ? `<div class="split-note">RBZ rate 1 USD = ${inv.zwgRate} ZWG · locked on invoice date · split ${inv.usdSplitPct}% USD / ${inv.zwgSplitPct}% ZWG</div>` : ''}

${inv.notes ? `<div class="notes"><strong>Notes:</strong> ${inv.notes}</div>` : ''}

<div class="footer">
  <span>${fromName} · ${fromWebsite}${fromEmail ? ' · ' + fromEmail : ''}</span>
  <span>Proforma invoice — not a tax invoice until payment is received.</span>
</div>

</div>
</body></html>`

          const w = window.open('', '_blank', 'width=860,height=1100')
          if (!w) return
          w.document.write(html)
          w.document.close()
          w.focus()
          setTimeout(() => { w.print() }, 500)
        }

        return (
          <Modal
            title={`Proforma Invoice — ${inv.invoiceNumber}`}
            open={!!viewInvoice}
            onClose={() => { setViewInvoice(null); setEditingParties(false) }}
            width={840}
            footer={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Tag color={invoiceStatusColor(inv.status)} style={{ fontWeight: 700 }}>{inv.status}</Tag>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="ghost" size="sm" icon={<FileText size={13} />} onClick={printInvoice}>Download PDF</Btn>
                  <Btn variant="ghost" size="sm" icon={<Eye size={13} />}
                    onClick={() => {
                      setPartiesForm({ billToName: inv.billToName ?? '', billToEmail: inv.billToEmail ?? '', billToPhone: inv.billToPhone ?? '', billFromName: fromName, billFromEmail: fromEmail, billFromPhone: fromPhone, billFromWebsite: fromWebsite })
                      setEditingParties(v => !v)
                    }}>Edit Parties</Btn>
                  {(inv.status === 'DRAFT' || inv.status === 'SENT') && (
                    <Btn variant="ghost" size="sm" icon={<Send size={13} />}
                      loading={sendInvoiceMutation.isPending}
                      onClick={() => { sendInvoiceMutation.mutate(inv.id); setViewInvoice(null) }}>Send</Btn>
                  )}
                  {(inv.status === 'DRAFT' || inv.status === 'SENT') && (
                    <Btn variant="primary" size="sm" icon={<CheckCircle2 size={13} />}
                      loading={paidInvoiceMutation.isPending}
                      onClick={() => { paidInvoiceMutation.mutate(inv.id); setViewInvoice(null) }}>Mark Paid</Btn>
                  )}
                  <Btn variant="ghost" size="sm" onClick={() => { setViewInvoice(null); setEditingParties(false) }}>Close</Btn>
                </div>
              </div>
            }>

            {/* Edit parties panel */}
            {editingParties && (
              <div style={{ margin: '-16px -16px 16px', padding: '16px 20px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div className="section-label" style={{ marginBottom: 8 }}>Bill From</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <Inp label="Company Name" value={partiesForm.billFromName} onChangeValue={v => setPartiesForm(f => ({ ...f, billFromName: v }))} />
                      <Inp label="Email" value={partiesForm.billFromEmail} onChangeValue={v => setPartiesForm(f => ({ ...f, billFromEmail: v }))} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                        <Inp label="Phone" value={partiesForm.billFromPhone} onChangeValue={v => setPartiesForm(f => ({ ...f, billFromPhone: v }))} />
                        <Inp label="Website" value={partiesForm.billFromWebsite} onChangeValue={v => setPartiesForm(f => ({ ...f, billFromWebsite: v }))} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="section-label" style={{ marginBottom: 8 }}>Bill To</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <Inp label="Name" value={partiesForm.billToName} onChangeValue={v => setPartiesForm(f => ({ ...f, billToName: v }))} />
                      <Inp label="Email" value={partiesForm.billToEmail} onChangeValue={v => setPartiesForm(f => ({ ...f, billToEmail: v }))} />
                      <Inp label="Phone" value={partiesForm.billToPhone} onChangeValue={v => setPartiesForm(f => ({ ...f, billToPhone: v }))} />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <Btn variant="ghost" size="sm" onClick={() => setEditingParties(false)}>Cancel</Btn>
                  <Btn variant="primary" size="sm" loading={updatePartiesMutation.isPending}
                    onClick={() => updatePartiesMutation.mutate({ id: inv.id, data: partiesForm })}>Save Changes</Btn>
                </div>
              </div>
            )}

            {/* A4 paper preview */}
            <div style={{ background: '#d1d5db', padding: '16px 16px 0', margin: editingParties ? '0 -16px' : '-16px -16px 0', borderRadius: editingParties ? 0 : 'var(--r-sm) var(--r-sm) 0 0' }}>
              <div style={{ background: '#fff', maxWidth: 760, margin: '0 auto', borderRadius: '4px 4px 0 0', boxShadow: '0 2px 12px rgba(0,0,0,.18)', overflow: 'hidden', fontSize: 13 }}>

                {/* Header */}
                <div style={{ background: '#0f1e3c', color: '#fff', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <img src={`${import.meta.env.BASE_URL}logo.png`} style={{ height: 48, width: 48, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,.12)', padding: 4 }} alt="" />
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>{fromName}</div>
                      <div style={{ fontSize: 11, opacity: .65, marginTop: 2 }}>{fromWebsite}{fromEmail ? ` · ${fromEmail}` : ''}{fromPhone ? ` · ${fromPhone}` : ''}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1px', opacity: .75, textTransform: 'uppercase' }}>Proforma Invoice</div>
                    <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '.5px', marginTop: 2 }}>{inv.invoiceNumber}</div>
                  </div>
                </div>

                {/* From / To / Meta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 175px', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ padding: '14px 18px', borderRight: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>From</div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fromName}</div>
                    {fromEmail   && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{fromEmail}</div>}
                    {fromWebsite && <div style={{ color: '#6b7280', fontSize: 12 }}>{fromWebsite}</div>}
                    {fromPhone   && <div style={{ color: '#6b7280', fontSize: 12 }}>{fromPhone}</div>}
                  </div>
                  <div style={{ padding: '14px 18px', borderRight: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>Bill To</div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{inv.billToName ?? partnerNameById.get(inv.partnerId) ?? '—'}</div>
                    {inv.billToEmail && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{inv.billToEmail}</div>}
                    {inv.billToPhone && <div style={{ color: '#6b7280', fontSize: 12 }}>{inv.billToPhone}</div>}
                  </div>
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>Details</div>
                    {([
                      ['Date',    dayjs(inv.createdAt).format('D MMM YYYY')],
                      inv.dueDate ? ['Due', dayjs(inv.dueDate).format('D MMM YYYY')] : null,
                      ['Period',  `${dayjs(inv.periodStart).format('D MMM')}–${dayjs(inv.periodEnd).format('D MMM YY')}`],
                      inv.zwgRate ? ['RBZ',  `1 USD = ${inv.zwgRate} ZWG`] : null,
                    ] as (string[] | null)[]).filter((x): x is string[] => x !== null).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                        <span style={{ color: '#9ca3af' }}>{k}</span>
                        <span style={{ fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Line items */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={{ padding: '7px 18px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: '.06em', textTransform: 'uppercase', borderBottom: '2px solid #d1d5db' }}>Description</th>
                      <th style={{ padding: '7px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: '.06em', textTransform: 'uppercase', borderBottom: '2px solid #d1d5db', whiteSpace: 'nowrap' }}>ZWG</th>
                      <th style={{ padding: '7px 18px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: '.06em', textTransform: 'uppercase', borderBottom: '2px solid #d1d5db', whiteSpace: 'nowrap' }}>USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.length === 0 ? (
                      <tr><td colSpan={3} style={{ padding: '14px 18px', color: '#9ca3af', fontStyle: 'italic' }}>No line items — records may be outside the loaded page.</td></tr>
                    ) : lineItems.map((r, i) => {
                      const label = r.sourceType === 'SMS_APPLICATION'
                        ? (smsAppById.get(r.applicationId ?? '')?.applicationName ?? r.applicationId ?? 'SMS Application')
                        : (apiNameById.get(r.proxyApiId ?? '') ?? r.proxyApiId ?? 'Proxy API')
                      const desc = r.sourceType === 'SMS_APPLICATION'
                        ? `SMS Notification Service — ${label}`
                        : `API Gateway Usage — ${label}`
                      const amtZwg = r.zwgRate && r.currency !== 'ZWG' ? (r.totalAmount ?? 0) * r.zwgRate : (r.totalAmount ?? 0)
                      const amtUsd = r.zwgRate && r.currency !== 'USD' ? (r.totalAmount ?? 0) / r.zwgRate : (r.totalAmount ?? 0)
                      return (
                        <tr key={r.id} style={{ background: i % 2 === 1 ? '#f9fafb' : '#fff', borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '9px 18px', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 600, color: '#111' }}>{desc}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Period: {dayjs(r.periodStart).format('D MMM YYYY')} to {dayjs(r.periodEnd).format('D MMM YYYY')}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>Qty: {(r.requestCount ?? 0).toLocaleString()} {r.sourceType === 'SMS_APPLICATION' ? 'SMS' : 'requests'}</div>
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>ZWG {amtZwg.toFixed(2)}</td>
                          <td style={{ padding: '9px 18px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>${amtUsd.toFixed(2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Totals */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 18px 18px' }}>
                  <div style={{ width: 330, marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                    {([
                      { label: 'Subtotal (ZWG)', value: `ZWG ${inv.subtotalZwg.toFixed(2)}`, dim: true },
                      { label: 'Subtotal (USD)', value: `$${inv.subtotalUsd.toFixed(2)}`, dim: true },
                      ...(inv.vatPct > 0 ? [
                        { label: `VAT (${inv.vatPct}%) ZWG`, value: `ZWG ${(inv.vatZwg ?? 0).toFixed(2)}`, dim: true },
                        { label: `VAT (${inv.vatPct}%) USD`, value: `$${(inv.vatUsd ?? 0).toFixed(2)}`, dim: true },
                      ] : []),
                      { label: 'Total (ZWG incl. VAT)', value: `ZWG ${totalWithVatZwg.toFixed(2)}`, bold: true, dark: true },
                    ] as { label: string; value: string; dim?: boolean; bold?: boolean; dark?: boolean }[]).map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: row.dark ? '#0f1e3c' : '#f9fafb', borderBottom: '1px solid #e5e7eb', color: row.dark ? '#fff' : row.dim ? '#6b7280' : '#111' }}>
                        <span style={{ fontSize: 12 }}>{row.label}</span>
                        <span style={{ fontWeight: row.bold ? 800 : 600, fontSize: row.bold ? 14 : 12 }}>{row.value}</span>
                      </div>
                    ))}
                    {inv.zwgRate && inv.usdDue != null && inv.zwgDue != null && <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: '#eff6ff', borderBottom: '1px solid #e5e7eb' }}>
                        <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13 }}>Due in USD ({inv.usdSplitPct}%)</span>
                        <span style={{ fontWeight: 800, fontSize: 15, color: '#1d4ed8' }}>${inv.usdDue.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: '#f0fdf4' }}>
                        <span style={{ fontWeight: 700, color: '#15803d', fontSize: 13 }}>Due in ZWG ({inv.zwgSplitPct}%)</span>
                        <span style={{ fontWeight: 800, fontSize: 15, color: '#15803d' }}>ZWG {inv.zwgDue.toFixed(2)}</span>
                      </div>
                    </>}
                  </div>
                </div>

                {/* Notes + footer */}
                {inv.notes && (
                  <div style={{ margin: '0 18px 14px', padding: '9px 13px', background: '#fffbeb', borderLeft: '4px solid #f59e0b', fontSize: 12, color: '#92400e', borderRadius: '0 4px 4px 0' }}>
                    <strong>Notes:</strong> {inv.notes}
                  </div>
                )}
                <div style={{ padding: '10px 18px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}>
                  <span>{fromName} · {fromWebsite} · {fromEmail}</span>
                  <span>Proforma — not a tax invoice until payment received.</span>
                </div>

              </div>
            </div>
          </Modal>
        )
      })()}

    </div>
  )
}
