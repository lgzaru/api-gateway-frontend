import { useState } from 'react'
import { Plus, Trash2, Pencil, History, CheckCircle2, XCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listSubscriptions, createSubscription, updateSubscription,
  deleteSubscription, listDeliveries,
} from '../api/webhooks'
import type { WebhookSubscription, WebhookDelivery } from '../api/webhooks'
import {
  Btn, Inp, Sel, Tag, Tbl, Drawer, Modal, Confirm, toast,
} from '../components/ui'
import type { Column } from '../components/ui'
import dayjs from 'dayjs'

const EVENT_TYPES = [
  'partner.created', 'partner.updated', 'partner.deleted',
  'incident.created', 'incident.resolved',
  'api.created', 'api.updated', 'api.deleted',
  'billing.finalised', 'alert.triggered', 'alert.resolved',
]

const STATUS_COLOR: Record<string, 'green' | 'orange' | 'red' | 'muted'> = {
  ACTIVE: 'green', PAUSED: 'orange', FAILED: 'red',
}

const DELIVERY_COLOR: Record<string, 'green' | 'red' | 'muted' | 'orange'> = {
  SUCCESS: 'green', FAILED: 'red', PENDING: 'muted', RETRYING: 'orange',
}

interface WebhookForm {
  name: string
  targetUrl: string
  eventTypes: string[]
  status: string
}

const EMPTY_FORM: WebhookForm = { name: '', targetUrl: '', eventTypes: [], status: 'ACTIVE' }

function validate(form: WebhookForm, isEdit: boolean) {
  const errors: Partial<Record<keyof WebhookForm, string>> = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (!form.targetUrl.trim()) errors.targetUrl = 'Target URL is required'
  else {
    try { new URL(form.targetUrl) } catch { errors.targetUrl = 'Must be a valid URL' }
  }
  if (!form.eventTypes.length) errors.eventTypes = 'Select at least one event'
  if (isEdit && !form.status) errors.status = 'Status is required'
  return errors
}

// Simple multi-select for event types
function EventTypeSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  function toggle(e: string) {
    onChange(value.includes(e) ? value.filter(x => x !== e) : [...value, e])
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 0' }}>
      {EVENT_TYPES.map(e => (
        <button
          key={e}
          type="button"
          onClick={() => toggle(e)}
          style={{
            padding: '3px 10px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid',
            borderColor: value.includes(e) ? 'var(--accent)' : 'var(--border)',
            background: value.includes(e) ? 'var(--accent)' : 'var(--surface)',
            color: value.includes(e) ? '#fff' : 'var(--txt-2)',
            fontSize: 11,
            cursor: 'pointer',
            fontWeight: value.includes(e) ? 600 : 400,
            transition: 'all 0.15s',
          }}
        >
          {e}
        </button>
      ))}
    </div>
  )
}

export default function Webhooks() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<WebhookSubscription | null>(null)
  const [deliveryModal, setDeliveryModal] = useState<WebhookSubscription | null>(null)
  const [form, setForm] = useState<WebhookForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof WebhookForm, string>>>({})
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => listSubscriptions({ size: 50 }),
    select: (res) => res.data,
  })

  const { data: deliveries, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['webhook-deliveries', deliveryModal?.id],
    queryFn: () => deliveryModal ? listDeliveries(deliveryModal.id, { size: 50 }) : null,
    enabled: !!deliveryModal,
    select: (res) => res?.data,
  })

  const createMutation = useMutation({
    mutationFn: createSubscription,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] })
      setDrawerOpen(false)
      setForm(EMPTY_FORM)
      toast.success('Webhook subscription created')
    },
    onError: () => toast.error('Failed to create subscription'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateSubscription>[1] }) =>
      updateSubscription(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] })
      setDrawerOpen(false)
      setForm(EMPTY_FORM)
      setEditing(null)
      toast.success('Subscription updated')
    },
    onError: () => toast.error('Failed to update subscription'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSubscription,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] })
      toast.success('Subscription deleted')
    },
    onError: () => toast.error('Failed to delete subscription'),
  })

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setDrawerOpen(true)
  }

  function openEdit(sub: WebhookSubscription) {
    setEditing(sub)
    setForm({ name: sub.name, targetUrl: sub.targetUrl, eventTypes: sub.eventTypes, status: sub.status })
    setErrors({})
    setDrawerOpen(true)
  }

  function handleSubmit() {
    const errs = validate(form, !!editing)
    if (Object.keys(errs).length) { setErrors(errs); return }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form as Parameters<typeof updateSubscription>[1] })
    } else {
      createMutation.mutate(form as Parameters<typeof createSubscription>[0])
    }
  }

  const columns: Column<WebhookSubscription>[] = [
    {
      key: 'name',
      title: 'Name',
      render: (row) => <span style={{ fontWeight: 600, color: 'var(--txt-1)' }}>{row.name}</span>,
    },
    {
      key: 'targetUrl',
      title: 'Target URL',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--txt-2)' }}>{row.targetUrl}</span>
      ),
    },
    {
      key: 'eventTypes',
      title: 'Events',
      render: (row) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {row.eventTypes.map(e => (
            <span
              key={e}
              style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 10,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--txt-2)',
              }}
            >
              {e}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      title: 'Status',
      width: 100,
      render: (row) => <Tag color={STATUS_COLOR[row.status] ?? 'muted'}>{row.status}</Tag>,
    },
    {
      key: 'lastDeliveryAt',
      title: 'Last Delivery',
      width: 160,
      render: (row) => row.lastDeliveryAt
        ? <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>{dayjs(row.lastDeliveryAt).format('MMM D, HH:mm')}</span>
        : <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>Never</span>,
    },
    {
      key: 'actions',
      title: '',
      width: 120,
      render: (row) => (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Btn variant="ghost" size="sm" iconOnly icon={<History size={14} />} onClick={() => setDeliveryModal(row)} />
          <Btn variant="ghost" size="sm" iconOnly icon={<Pencil size={14} />} onClick={() => openEdit(row)} />
          <Confirm
            title="Delete webhook subscription?"
            description="This cannot be undone."
            danger
            onConfirm={() => deleteMutation.mutate(row.id)}
          >
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={14} />} />
          </Confirm>
        </div>
      ),
    },
  ]

  const deliveryColumns: Column<WebhookDelivery>[] = [
    {
      key: 'eventType',
      title: 'Event',
      render: (row) => (
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--txt-2)' }}>
          {row.eventType}
        </span>
      ),
    },
    {
      key: 'status',
      title: 'Status',
      width: 120,
      render: (row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {row.status === 'SUCCESS'
            ? <CheckCircle2 size={13} style={{ color: 'var(--green)' }} />
            : <XCircle size={13} style={{ color: 'var(--red)' }} />}
          <Tag color={DELIVERY_COLOR[row.status] ?? 'muted'}>{row.status}</Tag>
        </span>
      ),
    },
    {
      key: 'responseCode',
      title: 'HTTP',
      width: 70,
      render: (row) => <span style={{ color: 'var(--txt-2)' }}>{row.responseCode ?? '—'}</span>,
    },
    {
      key: 'attemptCount',
      title: 'Attempts',
      width: 80,
      dataKey: 'attemptCount',
    },
    {
      key: 'deliveredAt',
      title: 'Time',
      width: 150,
      render: (row) => row.deliveredAt
        ? <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>{dayjs(row.deliveredAt).format('MMM D, HH:mm:ss')}</span>
        : <span style={{ color: 'var(--txt-3)' }}>—</span>,
    },
    {
      key: 'errorMessage',
      title: 'Error',
      render: (row) => row.errorMessage
        ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{row.errorMessage}</span>
        : <span style={{ color: 'var(--txt-3)' }}>—</span>,
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>Webhooks</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>
              Manage webhook subscriptions and view delivery history
            </p>
          </div>
          <Btn variant="primary" icon={<Plus size={15} />} onClick={openCreate}>
            New Subscription
          </Btn>
        </div>
      </div>

      <Tbl
        columns={columns}
        data={data?.content ?? []}
        rowKey="id"
        loading={isLoading}
        emptyText="No webhook subscriptions yet"
      />

      {/* Create / Edit Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditing(null); setForm(EMPTY_FORM) }}
        title={editing ? 'Edit Subscription' : 'New Webhook Subscription'}
        footer={
          <Btn
            variant="primary"
            loading={createMutation.isPending || updateMutation.isPending}
            onClick={handleSubmit}
          >
            {editing ? 'Save Changes' : 'Create'}
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp
            label="Name"
            placeholder="e.g. partner-events-prod"
            value={form.name}
            onChangeValue={v => setForm(f => ({ ...f, name: v }))}
            error={errors.name}
          />
          <Inp
            label="Target URL"
            placeholder="https://your-endpoint.example.com/webhook"
            value={form.targetUrl}
            onChangeValue={v => setForm(f => ({ ...f, targetUrl: v }))}
            error={errors.targetUrl}
          />
          <div className="field">
            <div className="field-label">Event Types</div>
            <EventTypeSelect
              value={form.eventTypes}
              onChange={v => setForm(f => ({ ...f, eventTypes: v }))}
            />
            {errors.eventTypes && <div className="field-error">{errors.eventTypes}</div>}
          </div>
          {editing && (
            <Sel
              label="Status"
              value={form.status}
              onChangeValue={v => setForm(f => ({ ...f, status: v }))}
              options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'PAUSED', label: 'Paused' }]}
              error={errors.status}
            />
          )}
        </div>
      </Drawer>

      {/* Delivery History Modal */}
      <Modal
        open={!!deliveryModal}
        onClose={() => setDeliveryModal(null)}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <History size={15} />
            Delivery History — {deliveryModal?.name}
          </span>
        }
        width={820}
      >
        <Tbl
          columns={deliveryColumns}
          data={deliveries?.content ?? []}
          rowKey="id"
          loading={deliveriesLoading}
          emptyText="No deliveries recorded"
        />
      </Modal>
    </div>
  )
}
