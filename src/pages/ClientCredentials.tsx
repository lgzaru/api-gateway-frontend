import { useState } from 'react'
import { copyToClipboard } from '../utils/clipboard'
import { Plus, Trash2, Pencil, RotateCcw, Copy, Key, Lock } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listClients, createClient, updateClient, revokeClient, rotateSecret,
} from '../api/clients'
import type { ClientCredential } from '../api/clients'
import {
  Btn, Inp, Tag, Tbl, Drawer, Modal, Confirm, Alert, toast, PermissionPicker,
} from '../components/ui'
import type { Column } from '../components/ui'
import dayjs from 'dayjs'

const STATUS_COLOR: Record<string, 'green' | 'red'> = { ACTIVE: 'green', REVOKED: 'red' }

export default function ClientCredentials() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ClientCredential | null>(null)
  const [secretModal, setSecretModal] = useState<{ title: string; clientId: string; secret: string } | null>(null)

  const [createForm, setCreateForm] = useState({ name: '', description: '', permissions: [] as string[], expiresAt: '' })
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})
  const [editForm, setEditForm] = useState({ name: '', description: '', permissions: [] as string[] })
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const qc = useQueryClient()

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => listClients(),
    select: (res) => res.data,
  })

  const createMutation = useMutation({
    mutationFn: createClient,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      setCreateOpen(false)
      setCreateForm({ name: '', description: '', permissions: [], expiresAt: '' })
      setSecretModal({
        title: 'Client Created — Save Your Secret',
        clientId: res.data.clientId,
        secret: res.data.clientSecret,
      })
    },
    onError: () => toast.error('Failed to create client'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateClient>[1] }) => updateClient(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      setEditTarget(null)
      setEditForm({ name: '', description: '', permissions: [] })
      toast.success('Client updated')
    },
    onError: () => toast.error('Failed to update client'),
  })

  const rotateMutation = useMutation({
    mutationFn: (id: string) => rotateSecret(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      setSecretModal({
        title: 'Secret Rotated — Save Your New Secret',
        clientId: res.data.clientId,
        secret: res.data.newClientSecret,
      })
    },
    onError: () => toast.error('Failed to rotate secret'),
  })

  const revokeMutation = useMutation({
    mutationFn: revokeClient,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); toast.success('Client revoked') },
    onError: () => toast.error('Failed to revoke client'),
  })

  function submitCreate() {
    const e: Record<string, string> = {}
    if (!createForm.name.trim()) e.name = 'Required'
    if (Object.keys(e).length) { setCreateErrors(e); return }
    createMutation.mutate({
      name: createForm.name,
      description: createForm.description || undefined,
      permissions: createForm.permissions,
      expiresAt: createForm.expiresAt ? new Date(createForm.expiresAt).toISOString() : undefined,
    })
  }

  function submitEdit() {
    const e: Record<string, string> = {}
    if (!editForm.name.trim()) e.name = 'Required'
    if (Object.keys(e).length) { setEditErrors(e); return }
    if (!editTarget) return
    updateMutation.mutate({
      id: editTarget.id,
      data: {
        name: editForm.name,
        description: editForm.description || undefined,
        permissions: editForm.permissions,
      },
    })
  }

  const items = clients ?? []

  const columns: Column<ClientCredential>[] = [
    {
      key: 'name', title: 'Name',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--txt-1)' }}>{r.name}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-3)' }}>{r.clientId}</div>
        </div>
      ),
    },
    { key: 'description', title: 'Description', render: (r) => r.description ?? <span style={{ color: 'var(--txt-3)' }}>—</span> },
    {
      key: 'status', title: 'Status', width: 90,
      render: (r) => <Tag color={STATUS_COLOR[r.status]}>{r.status}</Tag>,
    },
    {
      key: 'permissions', title: 'Permissions',
      render: (r) => r.permissions?.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {r.permissions.slice(0, 3).map(p => (
            <span key={p} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--txt-2)' }}>{p}</span>
          ))}
          {r.permissions.length > 3 && (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--txt-3)' }}>+{r.permissions.length - 3}</span>
          )}
        </div>
      ) : <span style={{ color: 'var(--txt-3)' }}>None</span>,
    },
    {
      key: 'expiresAt', title: 'Expires', width: 120,
      render: (r) => {
        if (!r.expiresAt) return <span style={{ color: 'var(--txt-3)' }}>Never</span>
        const expired = dayjs(r.expiresAt).isBefore(dayjs())
        return <span style={{ color: expired ? 'var(--red)' : 'var(--txt-2)', fontSize: 13 }}>{dayjs(r.expiresAt).format('MMM D, YYYY')}</span>
      },
    },
    {
      key: 'lastUsedAt', title: 'Last Used', width: 130,
      render: (r) => r.lastUsedAt ? dayjs(r.lastUsedAt).format('MMM D, YYYY') : <span style={{ color: 'var(--txt-3)' }}>Never</span>,
    },
    {
      key: 'actions', title: '', width: 160,
      render: (r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn
            variant="ghost" size="sm" iconOnly icon={<Pencil size={13} />}
            onClick={() => {
              setEditTarget(r)
              setEditForm({ name: r.name, description: r.description ?? '', permissions: r.permissions ?? [] })
              setEditErrors({})
            }}
          />
          <Confirm
            title="Rotate this client's secret? The new secret will be shown once."
            onConfirm={() => rotateMutation.mutate(r.id)}
          >
            <Btn variant="ghost" size="sm" icon={<RotateCcw size={13} />} disabled={r.status === 'REVOKED'}>Rotate</Btn>
          </Confirm>
          <Confirm danger title="Revoke this client? This cannot be undone." onConfirm={() => revokeMutation.mutate(r.id)}>
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} disabled={r.status === 'REVOKED'} />
          </Confirm>
        </div>
      ),
    },
  ]

  const statCard = (label: string, value: number, color?: string, icon?: React.ReactNode) => (
    <div className="card-sm">
      <div style={{ fontSize: 11, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--txt-1)' }}>{value}</div>
    </div>
  )

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>Client Credentials</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>Machine-to-machine API keys for service integrations</p>
        </div>
        <Btn variant="primary" icon={<Plus size={15} />} onClick={() => { setCreateOpen(true); setCreateErrors({}) }}>New Client</Btn>
      </div>

      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        {statCard('Total Clients', items.length, undefined, <Key size={12} />)}
        {statCard('Active', items.filter(c => c.status === 'ACTIVE').length, 'var(--green)')}
        {statCard('Revoked', items.filter(c => c.status === 'REVOKED').length, 'var(--red)')}
      </div>

      <Tbl columns={columns} data={items} rowKey="id" loading={isLoading} emptyText="No client credentials" />

      {/* Create Client Drawer */}
      <Drawer
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreateErrors({}) }}
        title="New Client Credential"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Btn>
            <Btn variant="primary" loading={createMutation.isPending} icon={<Key size={14} />} onClick={submitCreate}>Create</Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Client Name" value={createForm.name} onChangeValue={v => setCreateForm(f => ({ ...f, name: v }))} placeholder="e.g. Payment Service" error={createErrors.name} />
            <Inp label="Description" value={createForm.description} onChangeValue={v => setCreateForm(f => ({ ...f, description: v }))} placeholder="What does this client do?" />
          </div>
          <PermissionPicker label="Permissions" value={createForm.permissions} onChange={v => setCreateForm(f => ({ ...f, permissions: v }))} />
          <Inp label="Expires At" type="date" value={createForm.expiresAt} onChangeValue={v => setCreateForm(f => ({ ...f, expiresAt: v }))} />
        </div>
      </Drawer>

      {/* Edit Client Drawer */}
      <Drawer
        open={!!editTarget}
        onClose={() => { setEditTarget(null); setEditErrors({}) }}
        title={`Edit — ${editTarget?.name}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Btn>
            <Btn variant="primary" loading={updateMutation.isPending} onClick={submitEdit}>Save</Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Client Name" value={editForm.name} onChangeValue={v => setEditForm(f => ({ ...f, name: v }))} error={editErrors.name} />
            <Inp label="Description" value={editForm.description} onChangeValue={v => setEditForm(f => ({ ...f, description: v }))} />
          </div>
          <PermissionPicker label="Permissions" value={editForm.permissions} onChange={v => setEditForm(f => ({ ...f, permissions: v }))} />
        </div>
      </Drawer>

      {/* Secret Reveal Modal */}
      <Modal
        title={secretModal?.title}
        open={!!secretModal}
        onClose={() => setSecretModal(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn
              variant="secondary"
              icon={<Copy size={14} />}
              onClick={() => {
                copyToClipboard(secretModal?.secret ?? '')
                toast.success('Copied to clipboard')
              }}
            >
              Copy Secret
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
            <div style={{ background: 'var(--surface-2)', padding: 16, borderRadius: 'var(--r-md)', fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 13, color: 'var(--txt-1)', border: '1px solid var(--border)' }}>
              {secretModal?.secret}
            </div>
          </div>
          <Alert
            type="warning"
            description="This secret will only be shown once. Store it securely — it cannot be retrieved after closing this dialog."
          />
        </div>
      </Modal>
    </div>
  )
}
