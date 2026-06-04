import { useState } from 'react'
import { Plus, Trash2, Activity } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listDependencies, createDependency, updateDependency, deleteDependency, getImpactAnalysis,
} from '../api/dependencies'
import type { Dependency } from '../api/dependencies'
import {
  Btn, Inp, Sel, Tag, Switch, Tbl, Drawer, Alert, Confirm, toast,
} from '../components/ui'
import type { Column } from '../components/ui'
import dayjs from 'dayjs'

const DEP_TYPE_COLOR: Record<string, 'red' | 'muted' | 'orange'> = {
  REQUIRED: 'red', OPTIONAL: 'muted', FALLBACK: 'orange',
}

export default function Dependencies() {
  const [filterApiId, setFilterApiId] = useState('')
  const [impactApiId, setImpactApiId] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState({ sourceApiId: '', targetApiId: '', dependencyType: '', criticalPath: false, healthCheckUrl: '', notes: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['dependencies', filterApiId],
    queryFn: () => listDependencies({ sourceApiId: filterApiId || undefined, size: 50 }),
    select: (res) => res.data,
  })

  const { data: impact, isFetching: impactLoading, refetch: fetchImpact } = useQuery({
    queryKey: ['dep-impact', impactApiId],
    queryFn: () => impactApiId ? getImpactAnalysis(impactApiId) : null,
    enabled: false,
    select: (res) => res?.data,
  })

  const createMutation = useMutation({
    mutationFn: createDependency,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dependencies'] }); setDrawerOpen(false); resetForm(); toast.success('Dependency created') },
    onError: () => toast.error('Failed to create dependency'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateDependency>[1] }) => updateDependency(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dependencies'] }); toast.success('Updated') },
    onError: () => toast.error('Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDependency,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dependencies'] }); toast.success('Dependency deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  function resetForm() {
    setForm({ sourceApiId: '', targetApiId: '', dependencyType: '', criticalPath: false, healthCheckUrl: '', notes: '' })
    setErrors({})
  }

  function handleSubmit() {
    const e: Record<string, string> = {}
    if (!form.sourceApiId.trim()) e.sourceApiId = 'Required'
    if (!form.targetApiId.trim()) e.targetApiId = 'Required'
    if (Object.keys(e).length) { setErrors(e); return }
    createMutation.mutate({
      sourceApiId: form.sourceApiId,
      targetApiId: form.targetApiId,
      dependencyType: form.dependencyType || undefined,
      criticalPath: form.criticalPath,
      healthCheckUrl: form.healthCheckUrl || undefined,
      notes: form.notes || undefined,
    } as Parameters<typeof createDependency>[0])
  }

  const deps = data?.content ?? []

  const columns: Column<Dependency>[] = [
    {
      key: 'sourceApiId', title: 'Source API',
      render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--txt-2)' }}>{r.sourceApiId}</span>,
    },
    {
      key: 'targetApiId', title: 'Target API',
      render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--txt-2)' }}>{r.targetApiId}</span>,
    },
    {
      key: 'dependencyType', title: 'Type', width: 110,
      render: (r) => <Tag color={DEP_TYPE_COLOR[r.dependencyType] ?? 'muted'}>{r.dependencyType}</Tag>,
    },
    {
      key: 'criticalPath', title: 'Critical Path', width: 110,
      render: (r) => (
        <Switch
          checked={r.criticalPath}
          onChange={(checked) => updateMutation.mutate({ id: r.id, data: { criticalPath: checked } })}
        />
      ),
    },
    { key: 'notes', title: 'Notes', render: (r) => r.notes ?? <span style={{ color: 'var(--txt-3)' }}>—</span> },
    { key: 'createdAt', title: 'Created', width: 120, render: (r) => dayjs(r.createdAt).format('MMM D, YYYY') },
    {
      key: 'actions', title: '', width: 60,
      render: (r) => (
        <Confirm danger title="Delete this dependency?" onConfirm={() => deleteMutation.mutate(r.id)}>
          <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
        </Confirm>
      ),
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>API Dependencies</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>Map API dependencies and analyse blast radius</p>
      </div>

      {/* Impact Analysis */}
      <div className="card-sm" style={{ flexShrink: 0, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Activity size={15} style={{ color: 'var(--accent)' }} />
          <strong style={{ fontSize: 14, color: 'var(--txt-1)' }}>Impact Analysis</strong>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: 1, maxWidth: 400 }}>
            <Inp
              value={impactApiId}
              onChangeValue={setImpactApiId}
              placeholder="API UUID to analyse dependants"
            />
          </div>
          <Btn variant="secondary" icon={<Activity size={14} />} loading={impactLoading} disabled={!impactApiId} onClick={() => fetchImpact()}>
            Analyse
          </Btn>
        </div>
        {impact && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
              {[
                { label: 'Direct Dependants', value: impact.directDependants, color: 'var(--txt-1)' },
                { label: 'Critical Path', value: impact.criticalPathDependants, color: impact.criticalPathDependants > 0 ? 'var(--red)' : 'var(--txt-1)' },
                { label: 'Affected APIs', value: impact.affectedApiIds.length, color: 'var(--txt-1)' },
              ].map(s => (
                <div key={s.label} className="card-sm">
                  <div style={{ fontSize: 11, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
            {impact.criticalPathDependants > 0 && (
              <Alert type="error" title={`${impact.criticalPathDependants} critical-path dependant(s) — changes will cause outages`} />
            )}
            {impact.affectedApiIds.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--txt-3)', marginBottom: 6 }}>Affected API IDs:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {impact.affectedApiIds.map(id => (
                    <span key={id} style={{ fontFamily: 'monospace', fontSize: 10, padding: '2px 6px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--txt-2)' }}>{id}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ maxWidth: 440 }}>
          <Inp
            label="Filter by source API"
            value={filterApiId}
            onChangeValue={setFilterApiId}
            placeholder="Source API UUID (optional)"
          />
        </div>
        <Btn variant="primary" icon={<Plus size={15} />} onClick={() => { setDrawerOpen(true); resetForm() }}>
          Add Dependency
        </Btn>
      </div>

      <Tbl columns={columns} data={deps} rowKey="id" loading={isLoading} emptyText="No dependencies defined" />

      {/* Create Dependency Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); resetForm() }}
        title="Add API Dependency"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setDrawerOpen(false)}>Cancel</Btn>
            <Btn variant="primary" loading={createMutation.isPending} onClick={handleSubmit}>Create</Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Source API ID" value={form.sourceApiId} onChangeValue={v => setForm(f => ({ ...f, sourceApiId: v }))} placeholder="API that has the dependency" error={errors.sourceApiId} />
            <Inp label="Target API ID" value={form.targetApiId} onChangeValue={v => setForm(f => ({ ...f, targetApiId: v }))} placeholder="API being depended on" error={errors.targetApiId} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Sel
              label="Dependency Type"
              value={form.dependencyType}
              onChangeValue={v => setForm(f => ({ ...f, dependencyType: v }))}
              options={[
                { value: 'REQUIRED', label: 'Required' },
                { value: 'OPTIONAL', label: 'Optional' },
                { value: 'FALLBACK', label: 'Fallback' },
              ]}
              placeholder="Select type"
            />
            <div>
              <div className="field-label">Critical Path</div>
              <div style={{ marginTop: 8 }}>
                <Switch checked={form.criticalPath} onChange={v => setForm(f => ({ ...f, criticalPath: v }))} />
              </div>
            </div>
          </div>
          <Inp label="Health Check URL" value={form.healthCheckUrl} onChangeValue={v => setForm(f => ({ ...f, healthCheckUrl: v }))} placeholder="https://target-api/health" />
          <div className="field">
            <label className="field-label">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any additional context"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--txt-1)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </Drawer>
    </div>
  )
}
