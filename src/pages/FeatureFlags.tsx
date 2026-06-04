import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listFlags, createFlag, updateFlag, deleteFlag } from '../api/flags'
import type { FeatureFlag } from '../api/flags'
import {
  Btn, Inp, Tag, Switch, Tbl, Drawer, Confirm, toast,
} from '../components/ui'
import type { Column } from '../components/ui'
import dayjs from 'dayjs'

const ENVIRONMENTS = ['prod', 'dev', 'sandbox']

const ENV_COLOR: Record<string, 'red' | 'blue' | 'green'> = {
  prod: 'red', dev: 'blue', sandbox: 'green',
}

export default function FeatureFlags() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<FeatureFlag | null>(null)
  const [form, setForm] = useState({ name: '', description: '', enabled: false, rolloutPercentage: 100, environments: [] as string[], partnerIds: [] as string[] })
  const [envInput, setEnvInput] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => listFlags({ size: 100 }),
    select: (res) => res.data,
  })

  const createMutation = useMutation({
    mutationFn: createFlag,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feature-flags'] }); closeDrawer(); toast.success('Flag created') },
    onError: () => toast.error('Failed to create flag'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateFlag>[1] }) => updateFlag(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feature-flags'] }); closeDrawer(); toast.success('Flag updated') },
    onError: () => toast.error('Failed to update flag'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteFlag,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feature-flags'] }); toast.success('Flag deleted') },
    onError: () => toast.error('Failed to delete flag'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateFlag(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-flags'] }),
    onError: () => toast.error('Failed to toggle flag'),
  })

  function closeDrawer() {
    setDrawerOpen(false)
    setEditing(null)
    setForm({ name: '', description: '', enabled: false, rolloutPercentage: 100, environments: [], partnerIds: [] })
    setErrors({})
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '', enabled: false, rolloutPercentage: 100, environments: [], partnerIds: [] })
    setErrors({})
    setDrawerOpen(true)
  }

  function openEdit(flag: FeatureFlag) {
    setEditing(flag)
    setForm({
      name: flag.name,
      description: flag.description ?? '',
      enabled: flag.enabled,
      rolloutPercentage: flag.rolloutPercentage,
      environments: flag.environments ?? [],
      partnerIds: flag.partnerIds ?? [],
    })
    setErrors({})
    setDrawerOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Required'
    else if (!/^[a-z0-9_.-]+$/.test(form.name)) e.name = 'Use lowercase letters, numbers, hyphens, underscores'
    if (form.rolloutPercentage < 0 || form.rolloutPercentage > 100) e.rolloutPercentage = 'Must be 0–100'
    return e
  }

  function handleSubmit() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form as Partial<FeatureFlag> })
    } else {
      createMutation.mutate(form as Parameters<typeof createFlag>[0])
    }
  }

  function toggleEnv(env: string) {
    setForm(f => ({
      ...f,
      environments: f.environments.includes(env)
        ? f.environments.filter(e => e !== env)
        : [...f.environments, env],
    }))
  }

  const flags = data?.content ?? []

  const columns: Column<FeatureFlag>[] = [
    {
      key: 'enabled',
      title: 'Enabled',
      width: 72,
      render: (row) => (
        <Switch
          checked={row.enabled}
          onChange={(checked) => toggleMutation.mutate({ id: row.id, enabled: checked })}
        />
      ),
    },
    {
      key: 'name',
      title: 'Flag Name',
      render: (row) => (
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--txt-1)' }}>{row.name}</div>
          {row.description && <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 2 }}>{row.description}</div>}
        </div>
      ),
    },
    {
      key: 'rolloutPercentage',
      title: 'Rollout',
      width: 140,
      render: (row) => (
        <div>
          <div style={{ fontSize: 12, color: 'var(--txt-2)', marginBottom: 4 }}>{row.rolloutPercentage}%</div>
          <div style={{ height: 6, borderRadius: 99, background: 'var(--border)' }}>
            <div style={{ width: row.rolloutPercentage + '%', height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
          </div>
        </div>
      ),
    },
    {
      key: 'environments',
      title: 'Environments',
      render: (row) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(row.environments ?? []).map(e => (
            <Tag key={e} color={ENV_COLOR[e] ?? 'muted'}>{e}</Tag>
          ))}
          {!(row.environments ?? []).length && <Tag color="muted">All</Tag>}
        </div>
      ),
    },
    {
      key: 'partnerIds',
      title: 'Partners',
      width: 120,
      render: (row) => (row.partnerIds ?? []).length === 0
        ? <Tag color="muted">All Partners</Tag>
        : <Tag color="blue">{(row.partnerIds ?? []).length} specific</Tag>,
    },
    {
      key: 'updatedAt',
      title: 'Updated',
      width: 120,
      render: (row) => <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>{dayjs(row.updatedAt).format('MMM D, YYYY')}</span>,
    },
    {
      key: 'actions',
      title: '',
      width: 80,
      render: (row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn variant="ghost" size="sm" iconOnly icon={<Pencil size={14} />} onClick={() => openEdit(row)} />
          <Confirm danger title={`Delete flag "${row.name}"?`} onConfirm={() => deleteMutation.mutate(row.id)}>
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={14} />} />
          </Confirm>
        </div>
      ),
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>Feature Flags</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>Toggle features per environment and partner</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color="blue">{flags.filter(f => f.enabled).length} enabled</Tag>
          <Tag color="muted">{flags.length} total</Tag>
          <Btn variant="primary" icon={<Plus size={15} />} onClick={openCreate}>New Flag</Btn>
        </div>
      </div>

      <Tbl
        columns={columns}
        data={flags}
        rowKey="id"
        loading={isLoading}
        emptyText="No feature flags yet"
      />

      {/* Create / Edit Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? `Edit — ${editing.name}` : 'New Feature Flag'}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={closeDrawer}>Cancel</Btn>
            <Btn variant="primary" loading={createMutation.isPending || updateMutation.isPending} onClick={handleSubmit}>
              {editing ? 'Save' : 'Create'}
            </Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp
              label="Flag Name"
              value={form.name}
              onChangeValue={v => setForm(f => ({ ...f, name: v }))}
              placeholder="e.g. new_checkout_flow"
              error={errors.name}
              disabled={!!editing}
            />
            <Inp
              label="Description"
              value={form.description}
              onChangeValue={v => setForm(f => ({ ...f, description: v }))}
              placeholder="What does this flag control?"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="field-label">Enabled</div>
              <div style={{ marginTop: 8 }}>
                <Switch checked={form.enabled} onChange={v => setForm(f => ({ ...f, enabled: v }))} />
              </div>
            </div>
            <Inp
              label="Rollout %"
              type="number"
              value={String(form.rolloutPercentage)}
              onChangeValue={v => setForm(f => ({ ...f, rolloutPercentage: Number(v) }))}
              error={errors.rolloutPercentage}
            />
          </div>

          <div>
            <div className="field-label" style={{ marginBottom: 6 }}>Environments</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ENVIRONMENTS.map(env => (
                <button
                  key={env}
                  onClick={() => toggleEnv(env)}
                  style={{
                    padding: '4px 12px', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer', border: '1px solid',
                    background: form.environments.includes(env) ? 'var(--accent)' : 'transparent',
                    color: form.environments.includes(env) ? '#fff' : 'var(--txt-2)',
                    borderColor: form.environments.includes(env) ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  {env}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 4 }}>Leave empty for all environments</div>
          </div>

          <div>
            <Inp
              label="Partner IDs (comma-separated)"
              value={envInput}
              onChangeValue={setEnvInput}
              placeholder="Paste UUIDs — leave empty for all partners"
            />
            <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 4 }}>
              Current: {form.partnerIds.length ? form.partnerIds.join(', ') : 'All partners'}
            </div>
            {envInput && (
              <Btn size="sm" variant="secondary" style={{ marginTop: 4 }} onClick={() => {
                const ids = envInput.split(',').map(s => s.trim()).filter(Boolean)
                setForm(f => ({ ...f, partnerIds: [...new Set([...f.partnerIds, ...ids])] }))
                setEnvInput('')
              }}>Add</Btn>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  )
}
