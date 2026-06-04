import { useState } from 'react'
import { Plus, Trash2, Pencil, Send, CheckCircle2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listChangelog, createChangelogEntry, updateChangelogEntry,
  publishChangelogEntry, deleteChangelogEntry,
} from '../api/apichangelog'
import type { ApiChangelogEntry } from '../api/apichangelog'
import {
  Btn, Inp, Sel, Tag, Tbl, Drawer, Confirm, toast,
} from '../components/ui'
import type { Column } from '../components/ui'
const CHANGE_TYPE_COLOR: Record<string, 'blue' | 'green' | 'orange' | 'red' | 'muted' | 'accent'> = {
  FEATURE: 'blue', BUGFIX: 'green', DEPRECATION: 'orange',
  BREAKING_CHANGE: 'red', MAINTENANCE: 'muted', SECURITY: 'accent', CONFIGURATION: 'blue',
}

const SEVERITY_COLOR: Record<string, 'muted' | 'orange' | 'red'> = {
  INFO: 'muted', WARNING: 'orange', CRITICAL: 'red',
}

const CHANGE_TYPES = ['FEATURE', 'BUGFIX', 'DEPRECATION', 'BREAKING_CHANGE', 'MAINTENANCE', 'SECURITY', 'CONFIGURATION']
const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL']

export default function ApiChangelog() {
  const [filterApiId, setFilterApiId] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<ApiChangelogEntry | null>(null)
  const [form, setForm] = useState({ title: '', description: '', changeType: '', severity: '', affectedVersions: '', apiId: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['api-changelog', filterApiId],
    queryFn: () => listChangelog({ apiId: filterApiId || undefined, size: 50 }),
    select: (res) => res.data,
  })

  const createMutation = useMutation({
    mutationFn: createChangelogEntry,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-changelog'] }); closeDrawer(); toast.success('Entry created') },
    onError: () => toast.error('Failed to create entry'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateChangelogEntry>[1] }) => updateChangelogEntry(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-changelog'] }); closeDrawer(); toast.success('Updated') },
    onError: () => toast.error('Failed to update'),
  })

  const publishMutation = useMutation({
    mutationFn: publishChangelogEntry,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-changelog'] }); toast.success('Entry published — partners notified') },
    onError: () => toast.error('Failed to publish'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChangelogEntry,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-changelog'] }); toast.success('Deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  function closeDrawer() {
    setDrawerOpen(false)
    setEditing(null)
    setForm({ title: '', description: '', changeType: '', severity: '', affectedVersions: '', apiId: '' })
    setErrors({})
  }

  function openCreate() {
    setEditing(null)
    setForm({ title: '', description: '', changeType: '', severity: '', affectedVersions: '', apiId: '' })
    setErrors({})
    setDrawerOpen(true)
  }

  function openEdit(r: ApiChangelogEntry) {
    setEditing(r)
    setForm({
      title: r.title,
      description: r.description ?? '',
      changeType: r.changeType,
      severity: r.severity,
      affectedVersions: (r.affectedVersions ?? []).join(', '),
      apiId: '',
    })
    setErrors({})
    setDrawerOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'Required'
    if (!form.changeType) e.changeType = 'Required'
    if (!form.severity) e.severity = 'Required'
    return e
  }

  function handleSubmit() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    const affectedVersions = form.affectedVersions
      ? form.affectedVersions.split(',').map(s => s.trim()).filter(Boolean)
      : []
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        data: {
          title: form.title,
          description: form.description || undefined,
          changeType: form.changeType as ApiChangelogEntry['changeType'],
          severity: form.severity as ApiChangelogEntry['severity'],
          affectedVersions,
        },
      })
    } else {
      createMutation.mutate({
        title: form.title,
        description: form.description || undefined,
        changeType: form.changeType as ApiChangelogEntry['changeType'],
        severity: form.severity as ApiChangelogEntry['severity'],
        affectedVersions,
        apiId: form.apiId || undefined,
      })
    }
  }

  const entries = data?.content ?? []

  const columns: Column<ApiChangelogEntry>[] = [
    {
      key: 'title', title: 'Title',
      render: (r) => <strong style={{ color: 'var(--txt-1)' }}>{r.title}</strong>,
    },
    {
      key: 'changeType', title: 'Type', width: 150,
      render: (r) => <Tag color={CHANGE_TYPE_COLOR[r.changeType] ?? 'muted'}>{r.changeType.replace('_', ' ')}</Tag>,
    },
    {
      key: 'severity', title: 'Severity', width: 90,
      render: (r) => <Tag color={SEVERITY_COLOR[r.severity] ?? 'muted'}>{r.severity}</Tag>,
    },
    {
      key: 'affectedVersions', title: 'Affected Versions',
      render: (r) => r.affectedVersions?.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {r.affectedVersions.map(v => (
            <span key={v} style={{ fontFamily: 'monospace', fontSize: 10, padding: '2px 6px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', color: 'var(--txt-2)', border: '1px solid var(--border)' }}>{v}</span>
          ))}
        </div>
      ) : <span style={{ color: 'var(--txt-3)' }}>—</span>,
    },
    {
      key: 'publishedAt', title: 'Published', width: 130,
      render: (r) => r.publishedAt ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCircle2 size={13} style={{ color: 'var(--green)' }} />
          <span style={{ fontSize: 12, color: 'var(--green)' }}>Published</span>
        </div>
      ) : (
        <Tag color="muted">Draft</Tag>
      ),
    },
    {
      key: 'actions', title: '', width: 140,
      render: (r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          {!r.publishedAt && (
            <Confirm title="Publish this entry and notify partners?" onConfirm={() => publishMutation.mutate(r.id)}>
              <Btn variant="ghost" size="sm" icon={<Send size={12} />}>Publish</Btn>
            </Confirm>
          )}
          <Btn variant="ghost" size="sm" iconOnly icon={<Pencil size={13} />} onClick={() => openEdit(r)} />
          <Confirm danger title="Delete this entry?" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
          </Confirm>
        </div>
      ),
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>API Changelog</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>
            API change history with partner notification on publish
          </p>
        </div>
        <Btn variant="primary" icon={<Plus size={15} />} onClick={openCreate}>New Entry</Btn>
      </div>

      <div style={{ flexShrink: 0, marginBottom: 12, maxWidth: 440 }}>
        <Inp
          label="Filter by API ID"
          value={filterApiId}
          onChangeValue={setFilterApiId}
          placeholder="Paste API UUID to filter (leave empty for all)"
        />
      </div>

      <Tbl columns={columns} data={entries} rowKey="id" loading={isLoading} emptyText="No changelog entries" />

      {/* Create / Edit Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? 'Edit Changelog Entry' : 'New Changelog Entry'}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={closeDrawer}>Cancel</Btn>
            <Btn variant="primary" loading={createMutation.isPending || updateMutation.isPending} onClick={handleSubmit}>
              {editing ? 'Save' : 'Create'}
            </Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp label="Title" value={form.title} onChangeValue={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Added OAuth2 support to /v2/payments" error={errors.title} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Sel
              label="Change Type"
              value={form.changeType}
              onChangeValue={v => setForm(f => ({ ...f, changeType: v }))}
              options={CHANGE_TYPES.map(v => ({ value: v, label: v.replace('_', ' ') }))}
              placeholder="Select type"
              error={errors.changeType}
            />
            <Sel
              label="Severity"
              value={form.severity}
              onChangeValue={v => setForm(f => ({ ...f, severity: v }))}
              options={SEVERITIES.map(v => ({ value: v, label: v }))}
              placeholder="Select severity"
              error={errors.severity}
            />
          </div>
          {!editing && (
            <Inp label="API ID" value={form.apiId} onChangeValue={v => setForm(f => ({ ...f, apiId: v }))} placeholder="Proxy API UUID" />
          )}
          <Inp
            label="Affected Versions (comma-separated)"
            value={form.affectedVersions}
            onChangeValue={v => setForm(f => ({ ...f, affectedVersions: v }))}
            placeholder="e.g. v1.x, v2.0"
          />
          <div className="field">
            <label className="field-label">Description</label>
            <textarea
              rows={4}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Detailed description of the change..."
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--txt-1)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </Drawer>
    </div>
  )
}
