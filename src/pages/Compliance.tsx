import { useState } from 'react'
import { Plus, Trash2, Pencil, PlayCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listMaskingRules, createMaskingRule, updateMaskingRule, deleteMaskingRule, applyMask,
  listRetentionPolicies, createRetentionPolicy, updateRetentionPolicy, deleteRetentionPolicy,
} from '../api/compliance'
import type { MaskingRule, RetentionPolicy } from '../api/compliance'
import {
  Btn, Inp, Sel, Tag, Switch, Tbl, Tabs, Drawer, Modal, Confirm, toast,
} from '../components/ui'
import type { Column, TabItem } from '../components/ui'
import dayjs from 'dayjs'

const MASK_COLOR: Record<string, 'red' | 'orange' | 'blue' | 'accent'> = {
  FULL: 'red', PARTIAL: 'orange', HASH: 'blue', TOKENIZE: 'accent',
}

const PURGE_COLOR: Record<string, 'red' | 'orange'> = {
  DELETE: 'red', ANONYMIZE: 'orange',
}

export default function Compliance() {
  const [maskDrawer, setMaskDrawer] = useState(false)
  const [editMask, setEditMask] = useState<MaskingRule | null>(null)
  const [retentionDrawer, setRetentionDrawer] = useState(false)
  const [editRetention, setEditRetention] = useState<RetentionPolicy | null>(null)
  const [testModal, setTestModal] = useState<{ id: string; name: string } | null>(null)
  const [testValue, setTestValue] = useState('')
  const [testResult, setTestResult] = useState<string | null>(null)

  const [maskForm, setMaskForm] = useState({ name: '', fieldPattern: '', maskType: '', samplePattern: '' })
  const [maskErrors, setMaskErrors] = useState<Record<string, string>>({})
  const [retentionForm, setRetentionForm] = useState({ entityType: '', retentionDays: '', purgeStrategy: '' })
  const [retentionErrors, setRetentionErrors] = useState<Record<string, string>>({})

  const qc = useQueryClient()

  const { data: masks, isLoading: masksLoading } = useQuery({
    queryKey: ['masking-rules'],
    queryFn: () => listMaskingRules({ size: 50 }),
    select: (res) => res.data,
  })

  const { data: policies, isLoading: policiesLoading } = useQuery({
    queryKey: ['retention-policies'],
    queryFn: () => listRetentionPolicies({ size: 50 }),
    select: (res) => res.data,
  })

  const createMaskMutation = useMutation({
    mutationFn: createMaskingRule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['masking-rules'] }); setMaskDrawer(false); resetMaskForm(); toast.success('Masking rule created') },
    onError: () => toast.error('Failed to create masking rule'),
  })

  const updateMaskMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateMaskingRule>[1] }) => updateMaskingRule(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['masking-rules'] }); setEditMask(null); toast.success('Updated') },
    onError: () => toast.error('Failed to update'),
  })

  const deleteMaskMutation = useMutation({
    mutationFn: deleteMaskingRule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['masking-rules'] }); toast.success('Deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  const createRetentionMutation = useMutation({
    mutationFn: createRetentionPolicy,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['retention-policies'] }); setRetentionDrawer(false); resetRetentionForm(); toast.success('Policy created') },
    onError: () => toast.error('Failed to create policy'),
  })

  const updateRetentionMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateRetentionPolicy>[1] }) => updateRetentionPolicy(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['retention-policies'] }); setEditRetention(null); toast.success('Updated') },
    onError: () => toast.error('Failed to update'),
  })

  const deleteRetentionMutation = useMutation({
    mutationFn: deleteRetentionPolicy,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['retention-policies'] }); toast.success('Deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  const applyMaskMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => applyMask(id, value),
    onSuccess: (res) => setTestResult(res.data.masked),
    onError: () => toast.error('Failed to apply mask'),
  })

  function resetMaskForm() { setMaskForm({ name: '', fieldPattern: '', maskType: '', samplePattern: '' }); setMaskErrors({}) }
  function resetRetentionForm() { setRetentionForm({ entityType: '', retentionDays: '', purgeStrategy: '' }); setRetentionErrors({}) }

  function submitMask() {
    const e: Record<string, string> = {}
    if (!maskForm.name.trim()) e.name = 'Required'
    if (!maskForm.fieldPattern.trim()) e.fieldPattern = 'Required'
    if (!maskForm.maskType) e.maskType = 'Required'
    if (Object.keys(e).length) { setMaskErrors(e); return }
    if (editMask) {
      updateMaskMutation.mutate({ id: editMask.id, data: { maskType: maskForm.maskType as MaskingRule['maskType'], samplePattern: maskForm.samplePattern || undefined } })
    } else {
      createMaskMutation.mutate({ name: maskForm.name, fieldPattern: maskForm.fieldPattern, maskType: maskForm.maskType as MaskingRule['maskType'], samplePattern: maskForm.samplePattern || undefined } as Parameters<typeof createMaskingRule>[0])
    }
  }

  function submitRetention() {
    const e: Record<string, string> = {}
    if (!retentionForm.entityType.trim()) e.entityType = 'Required'
    if (!retentionForm.retentionDays) e.retentionDays = 'Required'
    if (!retentionForm.purgeStrategy) e.purgeStrategy = 'Required'
    if (Object.keys(e).length) { setRetentionErrors(e); return }
    if (editRetention) {
      updateRetentionMutation.mutate({ id: editRetention.id, data: { retentionDays: Number(retentionForm.retentionDays), purgeStrategy: retentionForm.purgeStrategy as RetentionPolicy['purgeStrategy'] } })
    } else {
      createRetentionMutation.mutate({ entityType: retentionForm.entityType, retentionDays: Number(retentionForm.retentionDays), purgeStrategy: retentionForm.purgeStrategy as RetentionPolicy['purgeStrategy'] } as Parameters<typeof createRetentionPolicy>[0])
    }
  }

  const maskColumns: Column<MaskingRule>[] = [
    { key: 'name', title: 'Name', render: (r) => <strong>{r.name}</strong> },
    { key: 'fieldPattern', title: 'Field Pattern', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.fieldPattern}</span> },
    { key: 'maskType', title: 'Mask Type', width: 110, render: (r) => <Tag color={MASK_COLOR[r.maskType]}>{r.maskType}</Tag> },
    { key: 'samplePattern', title: 'Sample Pattern', render: (r) => r.samplePattern ?? <span style={{ color: 'var(--txt-3)' }}>—</span> },
    {
      key: 'enabled', title: 'Enabled', width: 80,
      render: (r) => (
        <Switch checked={r.enabled} onChange={(checked) => updateMaskMutation.mutate({ id: r.id, data: { enabled: checked } })} />
      ),
    },
    {
      key: 'actions', title: '', width: 120,
      render: (r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn variant="ghost" size="sm" icon={<PlayCircle size={12} />} onClick={() => { setTestModal({ id: r.id, name: r.name }); setTestValue(''); setTestResult(null) }}>Test</Btn>
          <Btn variant="ghost" size="sm" iconOnly icon={<Pencil size={13} />} onClick={() => { setEditMask(r); setMaskForm({ name: r.name, fieldPattern: r.fieldPattern, maskType: r.maskType, samplePattern: r.samplePattern ?? '' }); setMaskErrors({}) }} />
          <Confirm danger title="Delete this rule?" onConfirm={() => deleteMaskMutation.mutate(r.id)}>
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
          </Confirm>
        </div>
      ),
    },
  ]

  const retentionColumns: Column<RetentionPolicy>[] = [
    { key: 'entityType', title: 'Entity Type', render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.entityType}</strong> },
    { key: 'retentionDays', title: 'Retention', width: 110, render: (r) => `${r.retentionDays} days` },
    { key: 'purgeStrategy', title: 'Strategy', width: 120, render: (r) => <Tag color={PURGE_COLOR[r.purgeStrategy]}>{r.purgeStrategy}</Tag> },
    {
      key: 'enabled', title: 'Enabled', width: 80,
      render: (r) => (
        <Switch checked={r.enabled} onChange={(checked) => updateRetentionMutation.mutate({ id: r.id, data: { enabled: checked } })} />
      ),
    },
    {
      key: 'lastRunAt', title: 'Last Run', width: 140,
      render: (r) => r.lastRunAt ? dayjs(r.lastRunAt).format('MMM D, YYYY HH:mm') : <span style={{ color: 'var(--txt-3)' }}>Never</span>,
    },
    {
      key: 'actions', title: '', width: 80,
      render: (r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn variant="ghost" size="sm" iconOnly icon={<Pencil size={13} />} onClick={() => { setEditRetention(r); setRetentionForm({ entityType: r.entityType, retentionDays: String(r.retentionDays), purgeStrategy: r.purgeStrategy }); setRetentionErrors({}) }} />
          <Confirm danger title="Delete this policy?" onConfirm={() => deleteRetentionMutation.mutate(r.id)}>
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
          </Confirm>
        </div>
      ),
    },
  ]

  const tabs: TabItem[] = [
    {
      key: 'masking',
      label: 'Data Masking Rules',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="primary" icon={<Plus size={15} />} onClick={() => { setMaskDrawer(true); resetMaskForm() }}>New Rule</Btn>
          </div>
          <Tbl columns={maskColumns} data={masks?.content ?? []} rowKey="id" loading={masksLoading} emptyText="No masking rules defined" />
        </div>
      ),
    },
    {
      key: 'retention',
      label: 'Retention Policies',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="primary" icon={<Plus size={15} />} onClick={() => { setRetentionDrawer(true); resetRetentionForm() }}>New Policy</Btn>
          </div>
          <Tbl columns={retentionColumns} data={policies?.content ?? []} rowKey="id" loading={policiesLoading} emptyText="No retention policies defined" />
        </div>
      ),
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt-1)' }}>Compliance</h2>
        <p style={{ margin: '2px 0 0', color: 'var(--txt-3)', fontSize: 13 }}>Data masking rules and retention policies</p>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs items={tabs} />
      </div>

      {/* Masking Rule Drawer */}
      <Drawer
        open={maskDrawer || !!editMask}
        onClose={() => { setMaskDrawer(false); setEditMask(null); resetMaskForm() }}
        title={editMask ? `Edit — ${editMask.name}` : 'New Masking Rule'}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => { setMaskDrawer(false); setEditMask(null); resetMaskForm() }}>Cancel</Btn>
            <Btn variant="primary" loading={createMaskMutation.isPending || updateMaskMutation.isPending} onClick={submitMask}>
              {editMask ? 'Save' : 'Create'}
            </Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Name" value={maskForm.name} onChangeValue={v => setMaskForm(f => ({ ...f, name: v }))} placeholder="e.g. Credit Card Mask" error={maskErrors.name} />
            <Inp label="Field Pattern" value={maskForm.fieldPattern} onChangeValue={v => setMaskForm(f => ({ ...f, fieldPattern: v }))} placeholder="e.g. *card_number*" error={maskErrors.fieldPattern} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Sel
              label="Mask Type"
              value={maskForm.maskType}
              onChangeValue={v => setMaskForm(f => ({ ...f, maskType: v }))}
              options={['FULL', 'PARTIAL', 'HASH', 'TOKENIZE'].map(v => ({ value: v, label: v }))}
              placeholder="Select type"
              error={maskErrors.maskType}
            />
            <Inp label="Sample Pattern" value={maskForm.samplePattern} onChangeValue={v => setMaskForm(f => ({ ...f, samplePattern: v }))} placeholder="e.g. ****-####" />
          </div>
        </div>
      </Drawer>

      {/* Retention Policy Drawer */}
      <Drawer
        open={retentionDrawer || !!editRetention}
        onClose={() => { setRetentionDrawer(false); setEditRetention(null); resetRetentionForm() }}
        title={editRetention ? 'Edit Retention Policy' : 'New Retention Policy'}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => { setRetentionDrawer(false); setEditRetention(null); resetRetentionForm() }}>Cancel</Btn>
            <Btn variant="primary" loading={createRetentionMutation.isPending || updateRetentionMutation.isPending} onClick={submitRetention}>
              {editRetention ? 'Save' : 'Create'}
            </Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Entity Type" value={retentionForm.entityType} onChangeValue={v => setRetentionForm(f => ({ ...f, entityType: v }))} placeholder="e.g. REQUEST_LOG" error={retentionErrors.entityType} />
            <Inp label="Retention (days)" type="number" value={retentionForm.retentionDays} onChangeValue={v => setRetentionForm(f => ({ ...f, retentionDays: v }))} placeholder="e.g. 90" error={retentionErrors.retentionDays} />
          </div>
          <Sel
            label="Purge Strategy"
            value={retentionForm.purgeStrategy}
            onChangeValue={v => setRetentionForm(f => ({ ...f, purgeStrategy: v }))}
            options={[
              { value: 'DELETE', label: 'Delete (hard delete records)' },
              { value: 'ANONYMIZE', label: 'Anonymize (scrub PII)' },
            ]}
            placeholder="Select strategy"
            error={retentionErrors.purgeStrategy}
          />
        </div>
      </Drawer>

      {/* Test Masking Modal */}
      <Modal
        title={`Test Mask — ${testModal?.name}`}
        open={!!testModal}
        onClose={() => { setTestModal(null); setTestValue(''); setTestResult(null) }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => { setTestModal(null); setTestValue(''); setTestResult(null) }}>Close</Btn>
            <Btn
              variant="primary"
              loading={applyMaskMutation.isPending}
              onClick={() => testModal && applyMaskMutation.mutate({ id: testModal.id, value: testValue })}
            >
              Apply Mask
            </Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp
            label="Input Value"
            value={testValue}
            onChangeValue={v => { setTestValue(v); setTestResult(null) }}
            placeholder="e.g. 4111-1111-1111-1111"
          />
          {testResult !== null && (
            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>Masked Output</div>
              <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--r-sm)', fontFamily: 'monospace', fontSize: 13, color: 'var(--txt-1)', border: '1px solid var(--border)' }}>
                {testResult}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
