import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listCatalogueEntries, publishEntry, updateEntry, deleteEntry } from '../api/catalogue'
import type { CatalogueEntry } from '../api/catalogue'
import {
  Btn, Inp, Tag, Switch, Tbl, Drawer, Confirm, toast,
} from '../components/ui'
import type { Column } from '../components/ui'
import { BookOpen, Plus, Trash2, Pencil, CheckCircle2, XCircle } from 'lucide-react'
import dayjs from 'dayjs'

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card-sm" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--txt-1)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ApiCatalogue() {
  const [selectedApiId, setSelectedApiId] = useState('')
  const [publishDrawer, setPublishDrawer] = useState(false)
  const [editDrawer, setEditDrawer] = useState(false)
  const [editingEntry, setEditingEntry] = useState<CatalogueEntry | null>(null)

  // Publish form state
  const [pubForm, setPubForm] = useState({ version: '', title: '', deprecated: false })
  const [pubErrors, setPubErrors] = useState<Record<string, string>>({})

  // Edit form state
  const [editForm, setEditForm] = useState({ version: '', deprecated: false, published: false })

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['catalogue', selectedApiId],
    queryFn: () => selectedApiId ? listCatalogueEntries(selectedApiId, { size: 50 }) : null,
    enabled: !!selectedApiId,
    select: (res) => res?.data,
  })

  const publishMutation = useMutation({
    mutationFn: (values: Parameters<typeof publishEntry>[1]) => publishEntry(selectedApiId, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogue', selectedApiId] })
      setPublishDrawer(false)
      setPubForm({ version: '', title: '', deprecated: false })
      toast.success('Entry published')
    },
    onError: () => toast.error('Failed to publish entry'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateEntry>[1] }) => updateEntry(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogue', selectedApiId] })
      setEditDrawer(false)
      setEditingEntry(null)
      toast.success('Entry updated')
    },
    onError: () => toast.error('Failed to update entry'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteEntry,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalogue', selectedApiId] }); toast.success('Entry deleted') },
    onError: () => toast.error('Failed to delete entry'),
  })

  function openEdit(entry: CatalogueEntry) {
    setEditingEntry(entry)
    setEditForm({ version: entry.version, deprecated: entry.deprecated, published: entry.published })
    setEditDrawer(true)
  }

  function validatePub() {
    const e: Record<string, string> = {}
    if (!pubForm.version.trim()) e.version = 'Required'
    if (!pubForm.title.trim()) e.title = 'Required'
    setPubErrors(e)
    return Object.keys(e).length === 0
  }

  const entries = data?.content ?? []

  const columns: Column<CatalogueEntry>[] = [
    {
      key: 'version',
      title: 'Version',
      width: 120,
      render: (r) => (
        <Tag color="muted" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.version}</Tag>
      ),
    },
    {
      key: 'endpoints',
      title: 'Endpoints',
      width: 110,
      render: (r) => String(r.endpointCount),
    },
    {
      key: 'published',
      title: 'Published',
      width: 110,
      render: (r) => r.published
        ? <Tag color="green"><CheckCircle2 size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Published</Tag>
        : <Tag color="muted">Draft</Tag>,
    },
    {
      key: 'deprecated',
      title: 'Deprecated',
      width: 110,
      render: (r) => r.deprecated
        ? <Tag color="orange"><XCircle size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Deprecated</Tag>
        : null,
    },
    {
      key: 'updatedAt',
      title: 'Updated',
      width: 140,
      render: (r) => <span style={{ fontSize: 12 }}>{dayjs(r.updatedAt).format('MMM D, YYYY')}</span>,
    },
    {
      key: 'createdAt',
      title: 'Created',
      width: 140,
      render: (r) => <span style={{ fontSize: 12 }}>{dayjs(r.createdAt).format('MMM D, YYYY')}</span>,
    },
    {
      key: 'actions',
      title: '',
      width: 90,
      render: (r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn variant="ghost" size="sm" iconOnly icon={<Pencil size={13} />} onClick={() => openEdit(r)} />
          <Confirm danger title="Delete this catalogue entry?" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
          </Confirm>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={20} color="var(--accent)" />
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>API Catalogue</h2>
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>
            Published API versions with endpoint metadata and spec management
          </p>
        </div>
        {selectedApiId && (
          <Btn variant="primary" icon={<Plus size={15} />} onClick={() => setPublishDrawer(true)}>
            Publish Version
          </Btn>
        )}
      </div>

      {/* API ID selector */}
      <div style={{ maxWidth: 500, marginBottom: 20 }}>
        <Inp
          label="API ID"
          value={selectedApiId}
          onChangeValue={setSelectedApiId}
          placeholder="Paste Proxy API UUID to view its catalogue"
        />
      </div>

      {!selectedApiId ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 12 }}>
          <BookOpen size={40} color="var(--border)" />
          <span style={{ color: 'var(--txt-3)', fontSize: 14 }}>Enter an API ID above to browse its catalogue entries</span>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <StatCard label="Total Versions" value={entries.length} />
            <StatCard label="Published" value={entries.filter(e => e.published).length} color="var(--green)" />
            <StatCard label="Deprecated" value={entries.filter(e => e.deprecated).length} color="var(--orange)" />
            <StatCard label="Total Endpoints" value={entries.reduce((s, e) => s + (e.endpointCount ?? 0), 0)} />
          </div>

          <Tbl
            columns={columns}
            data={entries}
            rowKey="id"
            loading={isLoading}
            emptyText="No catalogue entries found"
          />
        </>
      )}

      {/* ── Publish Drawer ────────────────────────────────────────────────────── */}
      <Drawer
        title="Publish New API Version"
        open={publishDrawer}
        onClose={() => { setPublishDrawer(false); setPubForm({ version: '', title: '', deprecated: false }) }}
        footer={
          <Btn
            variant="primary"
            loading={publishMutation.isPending}
            icon={<BookOpen size={14} />}
            onClick={() => { if (validatePub()) publishMutation.mutate(pubForm) }}
          >
            Publish
          </Btn>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp
            label="Version *"
            value={pubForm.version}
            onChangeValue={v => setPubForm(f => ({ ...f, version: v }))}
            error={pubErrors.version}
            placeholder="e.g. 1.0.0 or v2.1"
          />
          <Inp
            label="Title *"
            value={pubForm.title}
            onChangeValue={v => setPubForm(f => ({ ...f, title: v }))}
            error={pubErrors.title}
            placeholder="e.g. Payments API v1"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="field-label">Mark as Deprecated</span>
            <Switch
              checked={pubForm.deprecated}
              onChange={v => setPubForm(f => ({ ...f, deprecated: v }))}
            />
          </div>
        </div>
      </Drawer>

      {/* ── Edit Drawer ───────────────────────────────────────────────────────── */}
      <Drawer
        title={`Edit v${editingEntry?.version}`}
        open={editDrawer}
        onClose={() => { setEditDrawer(false); setEditingEntry(null) }}
        footer={
          <Btn
            variant="primary"
            loading={updateMutation.isPending}
            onClick={() => editingEntry && updateMutation.mutate({ id: editingEntry.id, data: editForm })}
          >
            Save
          </Btn>
        }
      >
        {editingEntry && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Read-only info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', fontSize: 13 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: 'var(--txt-3)', width: 80 }}>API ID</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-2)' }}>{editingEntry.proxyApiId}</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: 'var(--txt-3)', width: 80 }}>Endpoints</span>
                <span style={{ color: 'var(--txt-1)' }}>{editingEntry.endpointCount}</span>
              </div>
            </div>

            <Inp
              label="Version"
              value={editForm.version}
              onChangeValue={v => setEditForm(f => ({ ...f, version: v }))}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="field-label">Deprecated</span>
                <Switch
                  checked={editForm.deprecated}
                  onChange={v => setEditForm(f => ({ ...f, deprecated: v }))}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="field-label">Published</span>
                <Switch
                  checked={editForm.published}
                  onChange={v => setEditForm(f => ({ ...f, published: v }))}
                />
              </div>
            </div>
          </div>
        )}
      </Drawer>

    </div>
  )
}
