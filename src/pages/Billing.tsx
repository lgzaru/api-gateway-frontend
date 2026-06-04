import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listRateCards, createRateCard, deleteRateCard,
  listBillingRecords, createBillingRecord, finaliseRecord,
  listBillingSummaries, generateBillingSummary, finalizeBillingSummary,
  getBillingConfig, upsertBillingConfig,
} from '../api/billing'
import type { RateCard, BillingRecord, BillingSummary } from '../api/billing'
import {
  Btn, Inp, Sel, Tag, Switch, Tbl, Tabs, Modal, Drawer, Confirm, toast,
} from '../components/ui'
import type { Column, TabItem } from '../components/ui'
import { Plus, Trash2, CheckCircle2, CreditCard, FileText, BarChart2 } from 'lucide-react'
import dayjs from 'dayjs'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function summaryStatusColor(v: string): 'green' | 'red' | 'muted' {
  if (v === 'FINALIZED') return 'green'
  if (v === 'VOID') return 'red'
  return 'muted'
}

function recordStatusColor(v: string): 'green' | 'red' | 'muted' {
  if (v === 'FINALISED') return 'green'
  if (v === 'VOID') return 'red'
  return 'muted'
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card-sm" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--txt-1)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Billing() {
  const [rateCardDrawer, setRateCardDrawer] = useState(false)
  const [recordDrawer, setRecordDrawer] = useState(false)
  const [summaryPartnerId, setSummaryPartnerId] = useState('')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  // Rate card form
  const [rateForm, setRateForm] = useState({
    name: '', proxyApiId: '', partnerId: '',
    pricePer1000Requests: '', monthlyFlatFee: '',
    currency: 'USD', effectiveFrom: '', effectiveTo: '',
  })
  const [rateErrors, setRateErrors] = useState<Record<string, string>>({})

  // Record form
  const [recordForm, setRecordForm] = useState({
    partnerId: '', proxyApiId: '', rateCardId: '', periodStart: '', periodEnd: '',
  })
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({})

  // Generate form
  const [genForm, setGenForm] = useState({ periodYear: String(new Date().getFullYear()), periodMonth: '' })
  const [genErrors, setGenErrors] = useState<Record<string, string>>({})

  // Config form
  const [cfgForm, setCfgForm] = useState<{
    billingEnabled: boolean; invoiceEmail: string; currency: string; bundleItems: string;
  }>({ billingEnabled: false, invoiceEmail: '', currency: 'USD', bundleItems: '' })

  const qc = useQueryClient()

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: rateCards, isLoading: rateCardsLoading } = useQuery({
    queryKey: ['rate-cards'],
    queryFn: () => listRateCards({ size: 50 }),
    select: (res) => res.data,
  })

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['billing-records'],
    queryFn: () => listBillingRecords({ size: 50 }),
    select: (res) => res.data,
  })

  const { data: summaries, isLoading: summariesLoading } = useQuery({
    queryKey: ['billing-summaries', summaryPartnerId],
    queryFn: () => summaryPartnerId ? listBillingSummaries(summaryPartnerId, { size: 24 }) : null,
    enabled: !!summaryPartnerId,
    select: (res) => res?.data,
  })

  const { data: billingConfigData } = useQuery({
    queryKey: ['billing-config', summaryPartnerId],
    queryFn: () => summaryPartnerId ? getBillingConfig(summaryPartnerId) : null,
    enabled: !!summaryPartnerId,
    select: (res) => res?.data,
  })

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createCardMutation = useMutation({
    mutationFn: createRateCard,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rate-cards'] })
      setRateCardDrawer(false)
      setRateForm({ name: '', proxyApiId: '', partnerId: '', pricePer1000Requests: '', monthlyFlatFee: '', currency: 'USD', effectiveFrom: '', effectiveTo: '' })
      toast.success('Rate card created')
    },
    onError: () => toast.error('Failed to create rate card'),
  })

  const deleteCardMutation = useMutation({
    mutationFn: deleteRateCard,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rate-cards'] }); toast.success('Rate card deleted') },
    onError: () => toast.error('Failed to delete rate card'),
  })

  const createRecordMutation = useMutation({
    mutationFn: createBillingRecord,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-records'] })
      setRecordDrawer(false)
      setRecordForm({ partnerId: '', proxyApiId: '', rateCardId: '', periodStart: '', periodEnd: '' })
      toast.success('Billing record created')
    },
    onError: () => toast.error('Failed to create billing record'),
  })

  const finaliseMutation = useMutation({
    mutationFn: (id: string) => finaliseRecord(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-records'] }); toast.success('Record finalised') },
    onError: () => toast.error('Failed to finalise record'),
  })

  const generateMutation = useMutation({
    mutationFn: generateBillingSummary,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-summaries', summaryPartnerId] })
      setGenerateOpen(false)
      setGenForm({ periodYear: String(new Date().getFullYear()), periodMonth: '' })
      toast.success('Summary generated')
    },
    onError: () => toast.error('Failed to generate summary'),
  })

  const finalizeSummaryMutation = useMutation({
    mutationFn: finalizeBillingSummary,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-summaries', summaryPartnerId] }); toast.success('Summary finalized') },
    onError: () => toast.error('Failed to finalize summary'),
  })

  const upsertConfigMutation = useMutation({
    mutationFn: (data: Parameters<typeof upsertBillingConfig>[1]) => upsertBillingConfig(summaryPartnerId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-config', summaryPartnerId] })
      setConfigOpen(false)
      toast.success('Billing config saved')
    },
    onError: () => toast.error('Failed to save billing config'),
  })

  // ── Computed ──────────────────────────────────────────────────────────────────

  const cards = rateCards?.content ?? []
  const billingRecords = records?.content ?? []
  const totalRevenue = billingRecords
    .filter(r => r.status === 'FINALISED')
    .reduce((s, r) => s + (r.totalAmount ?? 0), 0)

  // ── Validation ────────────────────────────────────────────────────────────────

  function validateRate() {
    const e: Record<string, string> = {}
    if (!rateForm.name.trim()) e.name = 'Required'
    if (!rateForm.pricePer1000Requests) e.pricePer1000Requests = 'Required'
    if (!rateForm.effectiveFrom) e.effectiveFrom = 'Required'
    setRateErrors(e)
    return Object.keys(e).length === 0
  }

  function validateRecord() {
    const e: Record<string, string> = {}
    if (!recordForm.partnerId.trim()) e.partnerId = 'Required'
    if (!recordForm.proxyApiId.trim()) e.proxyApiId = 'Required'
    if (!recordForm.rateCardId.trim()) e.rateCardId = 'Required'
    if (!recordForm.periodStart) e.periodStart = 'Required'
    if (!recordForm.periodEnd) e.periodEnd = 'Required'
    setRecordErrors(e)
    return Object.keys(e).length === 0
  }

  function validateGen() {
    const e: Record<string, string> = {}
    if (!genForm.periodYear) e.periodYear = 'Required'
    if (!genForm.periodMonth) e.periodMonth = 'Required'
    setGenErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Column definitions ────────────────────────────────────────────────────────

  const summaryColumns: Column<BillingSummary>[] = [
    { key: 'period', title: 'Period', width: 110, render: (r) => `${MONTHS[r.periodMonth - 1]} ${r.periodYear}` },
    { key: 'requests', title: 'Requests', width: 110, render: (r) => r.totalRequests?.toLocaleString() ?? '—' },
    { key: 'amount', title: 'Amount', width: 130, render: (r) => r.totalAmount != null ? `${Number(r.totalAmount).toFixed(2)} ${r.currency}` : '—' },
    { key: 'status', title: 'Status', width: 100, render: (r) => <Tag color={summaryStatusColor(r.status)}>{r.status}</Tag> },
    { key: 'finalized', title: 'Finalized', width: 130, render: (r) => r.finalizedAt ? dayjs(r.finalizedAt).format('MMM D, YYYY') : <span style={{ color: 'var(--txt-3)' }}>—</span> },
    {
      key: 'finalize',
      title: '',
      width: 100,
      render: (r) => r.status === 'DRAFT' ? (
        <Btn
          size="sm"
          variant="primary"
          icon={<CheckCircle2 size={13} />}
          loading={finalizeSummaryMutation.isPending && finalizeSummaryMutation.variables === r.id}
          onClick={() => finalizeSummaryMutation.mutate(r.id)}
        >
          Finalize
        </Btn>
      ) : null,
    },
  ]

  const rateCardColumns: Column<RateCard>[] = [
    { key: 'name', title: 'Name', render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'price', title: 'Price / 1k Req', width: 130, render: (r) => `${r.pricePer1000Requests} ${r.currency}` },
    { key: 'fee', title: 'Monthly Fee', width: 120, render: (r) => r.monthlyFlatFee ? `${r.monthlyFlatFee} ${r.currency}` : '—' },
    { key: 'from', title: 'Effective From', width: 130, render: (r) => dayjs(r.effectiveFrom).format('MMM D, YYYY') },
    { key: 'to', title: 'Effective To', width: 130, render: (r) => r.effectiveTo ? dayjs(r.effectiveTo).format('MMM D, YYYY') : <Tag color="green">Current</Tag> },
    {
      key: 'del',
      title: '',
      width: 60,
      render: (r) => (
        <Confirm danger title="Delete this rate card?" onConfirm={() => deleteCardMutation.mutate(r.id)}>
          <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
        </Confirm>
      ),
    },
  ]

  const recordColumns: Column<BillingRecord>[] = [
    { key: 'status', title: 'Status', width: 100, render: (r) => <Tag color={recordStatusColor(r.status)} style={{ fontWeight: 700 }}>{r.status}</Tag> },
    { key: 'period', title: 'Period', width: 200, render: (r) => `${dayjs(r.periodStart).format('MMM D')} – ${dayjs(r.periodEnd).format('MMM D, YYYY')}` },
    { key: 'requests', title: 'Requests', width: 110, render: (r) => r.requestCount?.toLocaleString() ?? '—' },
    {
      key: 'amount', title: 'Total Amount', width: 130,
      render: (r) => r.totalAmount != null
        ? <span style={{ fontWeight: 600 }}>{`${r.totalAmount.toFixed(2)} ${r.currency}`}</span>
        : <span style={{ color: 'var(--txt-3)' }}>Pending</span>,
    },
    { key: 'partner', title: 'Partner ID', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.partnerId}</span> },
    {
      key: 'finalise', title: '', width: 100,
      render: (r) => r.status === 'DRAFT' ? (
        <Btn
          size="sm"
          variant="primary"
          icon={<CheckCircle2 size={13} />}
          loading={finaliseMutation.isPending && finaliseMutation.variables === r.id}
          onClick={() => finaliseMutation.mutate(r.id)}
        >
          Finalise
        </Btn>
      ) : null,
    },
  ]

  // ── Tabs ──────────────────────────────────────────────────────────────────────

  const tabs: TabItem[] = [
    // ── Billing Summaries ──────────────────────────────────────────────────────
    {
      key: 'summaries',
      label: 'Billing Summaries',
      icon: <BarChart2 size={14} />,
      children: (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          {/* Left pane */}
          <div style={{ width: '35%', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Inp
              label="Partner"
              value={summaryPartnerId}
              onChangeValue={setSummaryPartnerId}
              placeholder="Paste partner UUID"
            />

            {summaryPartnerId && (
              <>
                {billingConfigData && (
                  <div className="card-sm">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span className="section-label">Billing Config</span>
                      <Btn
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setCfgForm({
                            billingEnabled: billingConfigData.billingEnabled ?? false,
                            invoiceEmail: billingConfigData.invoiceEmail ?? '',
                            currency: billingConfigData.currency ?? 'USD',
                            bundleItems: (billingConfigData.bundleItems ?? []).join(', '),
                          })
                          setConfigOpen(true)
                        }}
                      >
                        Edit
                      </Btn>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ color: 'var(--txt-3)', width: 90 }}>Enabled</span>
                        <Tag color={billingConfigData.billingEnabled ? 'green' : 'muted'} dot>
                          {billingConfigData.billingEnabled ? 'Yes' : 'No'}
                        </Tag>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ color: 'var(--txt-3)', width: 90 }}>Currency</span>
                        <span style={{ color: 'var(--txt-1)' }}>{billingConfigData.currency ?? '—'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ color: 'var(--txt-3)', width: 90 }}>Invoice Email</span>
                        <span style={{ color: 'var(--txt-1)', wordBreak: 'break-all' }}>{billingConfigData.invoiceEmail ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                )}

                <Btn
                  variant="primary"
                  size="sm"
                  icon={<Plus size={14} />}
                  block
                  onClick={() => setGenerateOpen(true)}
                >
                  Generate Summary
                </Btn>
              </>
            )}
          </div>

          {/* Right pane */}
          <div style={{ flex: 1, overflow: 'hidden', padding: '12px 14px' }}>
            {!summaryPartnerId ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-3)', fontSize: 14 }}>
                Enter a partner ID to view billing summaries.
              </div>
            ) : (
              <Tbl
                columns={summaryColumns}
                data={summaries?.content ?? []}
                rowKey="id"
                loading={summariesLoading}
                emptyText="No billing summaries"
              />
            )}
          </div>
        </div>
      ),
    },

    // ── Rate Cards ─────────────────────────────────────────────────────────────
    {
      key: 'rate-cards',
      label: 'Rate Cards',
      icon: <CreditCard size={14} />,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Btn variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setRateCardDrawer(true)}>
              New Rate Card
            </Btn>
          </div>
          <Tbl
            columns={rateCardColumns}
            data={cards}
            rowKey="id"
            loading={rateCardsLoading}
            emptyText="No rate cards"
          />
        </div>
      ),
    },

    // ── Billing Records ────────────────────────────────────────────────────────
    {
      key: 'records',
      label: 'Billing Records',
      icon: <FileText size={14} />,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Btn variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setRecordDrawer(true)}>
              New Record
            </Btn>
          </div>
          <Tbl
            columns={recordColumns}
            data={billingRecords}
            rowKey="id"
            loading={recordsLoading}
            emptyText="No billing records"
          />
        </div>
      ),
    },
  ]

  const CURRENCIES = ['USD','EUR','GBP','KES','NGN','ZAR'].map(c => ({ value: c, label: c }))

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt-1)' }}>Billing</h2>
        <p style={{ margin: '2px 0 0', color: 'var(--txt-3)', fontSize: 13 }}>
          Rate cards, billing records, and invoice management
        </p>
      </div>

      {/* Stats */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        <StatCard label="Rate Cards" value={cards.length} />
        <StatCard label="Draft Records" value={billingRecords.filter(r => r.status === 'DRAFT').length} />
        <StatCard label="Finalised Records" value={billingRecords.filter(r => r.status === 'FINALISED').length} color="var(--green)" />
        <StatCard
          label="Total Revenue (Finalised)"
          value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color="var(--accent)"
        />
      </div>

      {/* Tabs */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Tabs items={tabs} />
      </div>

      {/* ── Rate Card Drawer ──────────────────────────────────────────────────── */}
      <Drawer
        title="New Rate Card"
        open={rateCardDrawer}
        onClose={() => { setRateCardDrawer(false) }}
        footer={
          <Btn variant="primary" size="sm" loading={createCardMutation.isPending}
            onClick={() => {
              if (validateRate()) createCardMutation.mutate({
                ...rateForm,
                pricePer1000Requests: Number(rateForm.pricePer1000Requests),
                monthlyFlatFee: rateForm.monthlyFlatFee ? Number(rateForm.monthlyFlatFee) : undefined,
              })
            }}
          >
            Create
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp label="Name *" value={rateForm.name} onChangeValue={v => setRateForm(f => ({ ...f, name: v }))} error={rateErrors.name} placeholder="e.g. Standard API Rate — Q1 2025" />
          <Inp label="Proxy API ID" value={rateForm.proxyApiId} onChangeValue={v => setRateForm(f => ({ ...f, proxyApiId: v }))} placeholder="UUID (leave empty for default card)" />
          <Inp label="Partner ID" value={rateForm.partnerId} onChangeValue={v => setRateForm(f => ({ ...f, partnerId: v }))} placeholder="UUID (leave empty for all partners)" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Price / 1k Req *" type="number" value={rateForm.pricePer1000Requests} onChangeValue={v => setRateForm(f => ({ ...f, pricePer1000Requests: v }))} error={rateErrors.pricePer1000Requests} />
            <Inp label="Monthly Fee" type="number" value={rateForm.monthlyFlatFee} onChangeValue={v => setRateForm(f => ({ ...f, monthlyFlatFee: v }))} />
          </div>
          <Sel label="Currency" options={CURRENCIES} value={rateForm.currency} onChangeValue={v => setRateForm(f => ({ ...f, currency: v }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Effective From *" type="date" value={rateForm.effectiveFrom} onChangeValue={v => setRateForm(f => ({ ...f, effectiveFrom: v }))} error={rateErrors.effectiveFrom} />
            <Inp label="Effective To" type="date" value={rateForm.effectiveTo} onChangeValue={v => setRateForm(f => ({ ...f, effectiveTo: v }))} />
          </div>
        </div>
      </Drawer>

      {/* ── Billing Record Drawer ─────────────────────────────────────────────── */}
      <Drawer
        title="New Billing Record"
        open={recordDrawer}
        onClose={() => { setRecordDrawer(false) }}
        footer={
          <Btn variant="primary" size="sm" loading={createRecordMutation.isPending}
            onClick={() => {
              if (validateRecord()) createRecordMutation.mutate(recordForm)
            }}
          >
            Create
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp label="Partner ID *" value={recordForm.partnerId} onChangeValue={v => setRecordForm(f => ({ ...f, partnerId: v }))} error={recordErrors.partnerId} placeholder="Partner UUID" />
          <Inp label="Proxy API ID *" value={recordForm.proxyApiId} onChangeValue={v => setRecordForm(f => ({ ...f, proxyApiId: v }))} error={recordErrors.proxyApiId} placeholder="Proxy API UUID" />
          <Inp label="Rate Card ID *" value={recordForm.rateCardId} onChangeValue={v => setRecordForm(f => ({ ...f, rateCardId: v }))} error={recordErrors.rateCardId} placeholder="Rate Card UUID" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Period Start *" type="date" value={recordForm.periodStart} onChangeValue={v => setRecordForm(f => ({ ...f, periodStart: v }))} error={recordErrors.periodStart} />
            <Inp label="Period End *" type="date" value={recordForm.periodEnd} onChangeValue={v => setRecordForm(f => ({ ...f, periodEnd: v }))} error={recordErrors.periodEnd} />
          </div>
        </div>
      </Drawer>

      {/* ── Generate Summary Modal ────────────────────────────────────────────── */}
      <Modal
        title="Generate Billing Summary"
        open={generateOpen}
        onClose={() => { setGenerateOpen(false) }}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setGenerateOpen(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              loading={generateMutation.isPending}
              onClick={() => {
                if (validateGen()) generateMutation.mutate({
                  partnerId: summaryPartnerId,
                  periodYear: Number(genForm.periodYear),
                  periodMonth: Number(genForm.periodMonth),
                })
              }}
            >
              Generate
            </Btn>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Inp
            label="Year *"
            type="number"
            value={genForm.periodYear}
            onChangeValue={v => setGenForm(f => ({ ...f, periodYear: v }))}
            error={genErrors.periodYear}
          />
          <Sel
            label="Month *"
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            value={genForm.periodMonth}
            onChangeValue={v => setGenForm(f => ({ ...f, periodMonth: v }))}
            placeholder="Select month"
            error={genErrors.periodMonth}
          />
        </div>
      </Modal>

      {/* ── Billing Config Modal ──────────────────────────────────────────────── */}
      <Modal
        title="Billing Configuration"
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        width={440}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setConfigOpen(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              loading={upsertConfigMutation.isPending}
              onClick={() => upsertConfigMutation.mutate({
                ...cfgForm,
                bundleItems: cfgForm.bundleItems ? cfgForm.bundleItems.split(',').map(s => s.trim()).filter(Boolean) : [],
              })}
            >
              Save
            </Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="field-label">Billing Enabled</span>
            <Switch checked={cfgForm.billingEnabled} onChange={v => setCfgForm(f => ({ ...f, billingEnabled: v }))} />
          </div>
          <Inp label="Invoice Email" value={cfgForm.invoiceEmail} onChangeValue={v => setCfgForm(f => ({ ...f, invoiceEmail: v }))} placeholder="billing@partner.com" />
          <Sel label="Currency" options={CURRENCIES} value={cfgForm.currency} onChangeValue={v => setCfgForm(f => ({ ...f, currency: v }))} />
          <Inp
            label="Bundle Items (comma-separated)"
            value={cfgForm.bundleItems}
            onChangeValue={v => setCfgForm(f => ({ ...f, bundleItems: v }))}
            placeholder="e.g. API_ACCESS, SUPPORT"
          />
        </div>
      </Modal>

    </div>
  )
}
