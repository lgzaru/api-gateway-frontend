import { useState } from 'react'
import { Plus, Trash2, CheckCircle2, History } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listIncidents, createIncident, updateIncident, deleteIncident,
  listIncidentUpdates, addIncidentUpdate,
} from '../api/incidents'
import type { Incident, IncidentUpdate, IncidentSeverity, IncidentStatus } from '../api/incidents'
import { Btn, Inp, Sel, Tag, Tbl, Drawer, Confirm, Spin, toast } from '../components/ui'
import type { Column } from '../components/ui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const SEVERITY_COLOR: Record<IncidentSeverity, 'red' | 'orange' | 'blue' | 'muted'> = {
  CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'muted',
}

const STATUS_COLOR: Record<IncidentStatus, 'red' | 'orange' | 'blue' | 'green'> = {
  INVESTIGATING: 'red', IDENTIFIED: 'orange', MONITORING: 'blue', RESOLVED: 'green',
}

const STATUS_DOT: Record<IncidentStatus, string> = {
  INVESTIGATING: 'var(--red)',
  IDENTIFIED: 'var(--orange)',
  MONITORING: 'var(--blue)',
  RESOLVED: 'var(--green)',
}

interface CreateForm {
  title: string
  severity: string
  status: string
  affectedApiIds: string
  description: string
}

interface UpdateForm {
  status: string
  message: string
}

const EMPTY_CREATE: CreateForm = { title: '', severity: '', status: 'INVESTIGATING', affectedApiIds: '', description: '' }
const EMPTY_UPDATE: UpdateForm = { status: '', message: '' }

function validateCreate(f: CreateForm) {
  const errors: Partial<Record<keyof CreateForm, string>> = {}
  if (!f.title.trim()) errors.title = 'Required'
  if (!f.severity) errors.severity = 'Required'
  if (!f.status) errors.status = 'Required'
  if (!f.description.trim()) errors.description = 'Required'
  return errors
}

function validateUpdate(f: UpdateForm) {
  const errors: Partial<Record<keyof UpdateForm, string>> = {}
  if (!f.status) errors.status = 'Required'
  if (!f.message.trim()) errors.message = 'Required'
  return errors
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card-sm">
      <div style={{ fontSize: 12, color: 'var(--txt-3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--txt-1)', lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}

export default function Incidents() {
  const [createDrawer, setCreateDrawer] = useState(false)
  const [selected, setSelected] = useState<Incident | null>(null)
  const [updateDrawer, setUpdateDrawer] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE)
  const [createErrors, setCreateErrors] = useState<Partial<Record<keyof CreateForm, string>>>({})
  const [updateForm, setUpdateForm] = useState<UpdateForm>(EMPTY_UPDATE)
  const [updateErrors, setUpdateErrors] = useState<Partial<Record<keyof UpdateForm, string>>>({})
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => listIncidents({ size: 50 }),
    select: (res) => res.data,
  })

  const { data: updates, isLoading: updatesLoading } = useQuery({
    queryKey: ['incident-updates', selected?.id],
    queryFn: () => selected ? listIncidentUpdates(selected.id) : null,
    enabled: !!selected,
    select: (res) => res?.data,
  })

  const createMutation = useMutation({
    mutationFn: createIncident,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      setCreateDrawer(false)
      setCreateForm(EMPTY_CREATE)
      toast.success('Incident created')
    },
    onError: () => toast.error('Failed to create incident'),
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateIncident>[1] }) =>
      updateIncident(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      setSelected(res.data)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteIncident,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      toast.success('Incident deleted')
    },
    onError: () => toast.error('Failed to delete incident'),
  })

  const addUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof addIncidentUpdate>[1] }) =>
      addIncidentUpdate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident-updates', selected?.id] })
      setUpdateForm(EMPTY_UPDATE)
      setUpdateDrawer(false)
      toast.success('Update posted')
    },
    onError: () => toast.error('Failed to post update'),
  })

  const incidents = data?.content ?? []
  const openCount = incidents.filter(i => i.status !== 'RESOLVED').length

  function handleCreate() {
    const errs = validateCreate(createForm)
    if (Object.keys(errs).length) { setCreateErrors(errs); return }
    createMutation.mutate({
      ...createForm,
      affectedApiIds: createForm.affectedApiIds
        ? createForm.affectedApiIds.split(',').map(s => s.trim()).filter(Boolean)
        : [],
    } as Parameters<typeof createIncident>[0])
  }

  function handlePostUpdate() {
    const errs = validateUpdate(updateForm)
    if (Object.keys(errs).length) { setUpdateErrors(errs); return }
    if (selected) addUpdateMutation.mutate({ id: selected.id, data: updateForm as Parameters<typeof addIncidentUpdate>[1] })
  }

  const columns: Column<Incident>[] = [
    {
      key: 'severity',
      title: 'Severity',
      width: 100,
      render: (row) => <Tag color={SEVERITY_COLOR[row.severity]}>{row.severity}</Tag>,
    },
    {
      key: 'title',
      title: 'Title',
      render: (row) => <span style={{ fontWeight: 600, color: 'var(--txt-1)' }}>{row.title}</span>,
    },
    {
      key: 'status',
      title: 'Status',
      width: 140,
      render: (row) => <Tag color={STATUS_COLOR[row.status]}>{row.status}</Tag>,
    },
    {
      key: 'startedAt',
      title: 'Started',
      width: 150,
      render: (row) => (
        <div>
          <div style={{ fontSize: 12, color: 'var(--txt-2)' }}>{dayjs(row.startedAt).format('MMM D, HH:mm')}</div>
          <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>{dayjs(row.startedAt).fromNow()}</div>
        </div>
      ),
    },
    {
      key: 'resolvedAt',
      title: 'Resolved',
      width: 140,
      render: (row) => row.resolvedAt
        ? <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>{dayjs(row.resolvedAt).format('MMM D, HH:mm')}</span>
        : <Tag color="red">Active</Tag>,
    },
    {
      key: 'actions',
      title: '',
      width: 130,
      render: (row) => (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Btn
            variant="ghost"
            size="sm"
            icon={<History size={13} />}
            onClick={() => setSelected(row)}
          >
            Timeline
          </Btn>
          <Confirm
            title="Delete this incident?"
            description="This cannot be undone."
            danger
            onConfirm={() => deleteMutation.mutate(row.id)}
          >
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
          </Confirm>
        </div>
      ),
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>Incident Management</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>
              Track, update, and resolve platform incidents
            </p>
          </div>
          <Btn
            variant={openCount > 0 ? 'danger' : 'primary'}
            icon={<Plus size={15} />}
            onClick={() => { setCreateForm(EMPTY_CREATE); setCreateErrors({}); setCreateDrawer(true) }}
          >
            Create Incident
          </Btn>
        </div>
      </div>

      {/* Stats */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        <StatCard label="Active Incidents" value={openCount} color={openCount > 0 ? 'var(--red)' : 'var(--green)'} />
        <StatCard label="Investigating" value={incidents.filter(i => i.status === 'INVESTIGATING').length} />
        <StatCard label="Monitoring" value={incidents.filter(i => i.status === 'MONITORING').length} />
        <StatCard label="Resolved (Total)" value={incidents.filter(i => i.status === 'RESOLVED').length} color="var(--green)" />
      </div>

      <Tbl
        columns={columns}
        data={incidents}
        rowKey="id"
        loading={isLoading}
        emptyText="No incidents recorded"
      />

      {/* Create Incident Drawer */}
      <Drawer
        open={createDrawer}
        onClose={() => { setCreateDrawer(false); setCreateForm(EMPTY_CREATE) }}
        title="Create Incident"
        footer={
          <Btn variant="danger" loading={createMutation.isPending} onClick={handleCreate}>
            Create
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp
            label="Title"
            placeholder="e.g. SMS gateway elevated error rate"
            value={createForm.title}
            onChangeValue={v => setCreateForm(f => ({ ...f, title: v }))}
            error={createErrors.title}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Sel
              label="Severity"
              value={createForm.severity}
              onChangeValue={v => setCreateForm(f => ({ ...f, severity: v }))}
              options={Object.keys(SEVERITY_COLOR).map(k => ({ value: k, label: k }))}
              placeholder="Select severity"
              error={createErrors.severity}
            />
            <Sel
              label="Initial Status"
              value={createForm.status}
              onChangeValue={v => setCreateForm(f => ({ ...f, status: v }))}
              options={Object.keys(STATUS_COLOR).map(k => ({ value: k, label: k }))}
              error={createErrors.status}
            />
          </div>
          <Inp
            label="Affected API IDs"
            placeholder="Paste API UUIDs, comma-separated"
            value={createForm.affectedApiIds}
            onChangeValue={v => setCreateForm(f => ({ ...f, affectedApiIds: v }))}
          />
          <div className="field">
            <div className="field-label">Description</div>
            <textarea
              rows={3}
              placeholder="Describe the impact and scope of the incident"
              value={createForm.description}
              onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)',
                border: `1px solid ${createErrors.description ? 'var(--red)' : 'var(--border)'}`,
                background: 'var(--surface)', color: 'var(--txt-1)', fontSize: 14,
                resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            {createErrors.description && <div className="field-error">{createErrors.description}</div>}
          </div>
        </div>
      </Drawer>

      {/* Timeline Drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <History size={15} />
            {selected?.title}
            {selected && <Tag color={STATUS_COLOR[selected.status]}>{selected.status}</Tag>}
          </span>
        }
        width={560}
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            {selected && selected.status !== 'RESOLVED' && (
              <Btn
                variant="primary"
                icon={<CheckCircle2 size={14} />}
                loading={updateStatusMutation.isPending}
                onClick={() => updateStatusMutation.mutate({ id: selected.id, data: { status: 'RESOLVED' } })}
              >
                Mark Resolved
              </Btn>
            )}
            <Btn icon={<Plus size={14} />} onClick={() => { setUpdateForm(EMPTY_UPDATE); setUpdateErrors({}); setUpdateDrawer(true) }}>
              Post Update
            </Btn>
          </div>
        }
      >
        {selected && (
          <>
            {/* Incident summary card */}
            <div className="card-sm" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <Tag color={SEVERITY_COLOR[selected.severity]}>{selected.severity}</Tag>
                <Tag color={STATUS_COLOR[selected.status]}>{selected.status}</Tag>
                <span style={{ fontSize: 12, color: 'var(--txt-3)', alignSelf: 'center' }}>
                  Started {dayjs(selected.startedAt).fromNow()}
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--txt-2)', fontSize: 13 }}>{selected.description}</p>
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
              <span style={{ fontSize: 12, color: 'var(--txt-3)', fontWeight: 600 }}>Timeline</span>
              <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
            </div>

            {updatesLoading ? (
              <Spin tip="Loading updates..." />
            ) : (updates ?? []).length === 0 ? (
              <p style={{ color: 'var(--txt-3)', fontSize: 13 }}>No updates posted yet.</p>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 24 }}>
                {/* Vertical line */}
                <div style={{
                  position: 'absolute', left: 7, top: 8, bottom: 8,
                  width: 2, background: 'var(--divider)',
                }} />
                {(updates ?? []).map((u: IncidentUpdate) => (
                  <div key={u.id} style={{ position: 'relative', marginBottom: 20 }}>
                    {/* Dot */}
                    <div style={{
                      position: 'absolute', left: -21, top: 3,
                      width: 12, height: 12, borderRadius: '50%',
                      background: STATUS_DOT[u.status as IncidentStatus] ?? 'var(--accent)',
                      border: '2px solid var(--surface)',
                      boxShadow: '0 0 0 2px var(--divider)',
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Tag color={STATUS_COLOR[u.status as IncidentStatus]}>{u.status}</Tag>
                      <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>
                        {dayjs(u.createdAt).format('MMM D HH:mm')}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--txt-2)', fontSize: 13 }}>{u.message}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* Post Update Sub-Drawer */}
      <Drawer
        open={updateDrawer}
        onClose={() => { setUpdateDrawer(false); setUpdateForm(EMPTY_UPDATE) }}
        title="Post Timeline Update"
        width={400}
        footer={
          <Btn variant="primary" loading={addUpdateMutation.isPending} onClick={handlePostUpdate}>
            Post
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Sel
            label="Current Status"
            value={updateForm.status}
            onChangeValue={v => setUpdateForm(f => ({ ...f, status: v }))}
            options={Object.keys(STATUS_COLOR).map(k => ({ value: k, label: k }))}
            placeholder="Select status"
            error={updateErrors.status}
          />
          <div className="field">
            <div className="field-label">Update Message</div>
            <textarea
              rows={4}
              placeholder="Describe what has been identified or what actions are being taken"
              value={updateForm.message}
              onChange={e => setUpdateForm(f => ({ ...f, message: e.target.value }))}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)',
                border: `1px solid ${updateErrors.message ? 'var(--red)' : 'var(--border)'}`,
                background: 'var(--surface)', color: 'var(--txt-1)', fontSize: 14,
                resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            {updateErrors.message && <div className="field-error">{updateErrors.message}</div>}
          </div>
        </div>
      </Drawer>
    </div>
  )
}
