import { useState } from 'react'
import { Plus, Trash2, Send, GitBranch } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listVersions, registerVersion, deprecateVersion, sunsetVersion, deleteVersion,
  listNotices, sendNotice,
} from '../api/versioning'
import type { VersionEntry, DeprecationNotice } from '../api/versioning'
import {
  Btn, Inp, Tag, Tbl, Drawer, Modal, Confirm, toast,
} from '../components/ui'
import type { Column } from '../components/ui'
import dayjs from 'dayjs'

const STATUS_COLOR: Record<string, 'green' | 'orange' | 'red'> = {
  ACTIVE: 'green', DEPRECATED: 'orange', SUNSET: 'red',
}

export default function Versioning() {
  const [apiId, setApiId] = useState('')
  const [registerOpen, setRegisterOpen] = useState(false)
  const [deprecateTarget, setDeprecateTarget] = useState<VersionEntry | null>(null)
  const [noticesTarget, setNoticesTarget] = useState<VersionEntry | null>(null)
  const [sendNoticeOpen, setSendNoticeOpen] = useState(false)

  const [registerForm, setRegisterForm] = useState({ version: '' })
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({})

  const [deprecateForm, setDeprecateForm] = useState({ deprecatedAt: '', sunsetAt: '', migrationGuide: '' })
  const [deprecateErrors, setDeprecateErrors] = useState<Record<string, string>>({})

  const [noticeForm, setNoticeForm] = useState({ recipients: '', message: '' })
  const [noticeErrors, setNoticeErrors] = useState<Record<string, string>>({})

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['versions', apiId],
    queryFn: () => apiId ? listVersions(apiId, { size: 50 }) : null,
    enabled: !!apiId,
    select: (res) => res?.data,
  })

  const { data: notices, isLoading: noticesLoading } = useQuery({
    queryKey: ['version-notices', noticesTarget?.id],
    queryFn: () => noticesTarget ? listNotices(noticesTarget.id, { size: 20 }) : null,
    enabled: !!noticesTarget,
    select: (res) => res?.data,
  })

  const registerMutation = useMutation({
    mutationFn: registerVersion,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['versions', apiId] }); setRegisterOpen(false); setRegisterForm({ version: '' }); toast.success('Version registered') },
    onError: () => toast.error('Failed to register version'),
  })

  const deprecateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof deprecateVersion>[1] }) => deprecateVersion(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['versions', apiId] }); setDeprecateTarget(null); setDeprecateForm({ deprecatedAt: '', sunsetAt: '', migrationGuide: '' }); toast.success('Version deprecated') },
    onError: () => toast.error('Failed to deprecate'),
  })

  const sunsetMutation = useMutation({
    mutationFn: (id: string) => sunsetVersion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['versions', apiId] }); toast.success('Version sunset') },
    onError: () => toast.error('Failed to sunset'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteVersion,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['versions', apiId] }); toast.success('Deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  const sendNoticeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof sendNotice>[1] }) => sendNotice(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['version-notices', noticesTarget?.id] }); setSendNoticeOpen(false); setNoticeForm({ recipients: '', message: '' }); toast.success('Deprecation notice sent') },
    onError: () => toast.error('Failed to send notice'),
  })

  function submitRegister() {
    const e: Record<string, string> = {}
    if (!registerForm.version.trim()) e.version = 'Required'
    if (Object.keys(e).length) { setRegisterErrors(e); return }
    registerMutation.mutate({ version: registerForm.version, proxyApiId: apiId })
  }

  function submitDeprecate() {
    const e: Record<string, string> = {}
    if (!deprecateForm.deprecatedAt) e.deprecatedAt = 'Required'
    if (Object.keys(e).length) { setDeprecateErrors(e); return }
    if (!deprecateTarget) return
    deprecateMutation.mutate({
      id: deprecateTarget.id,
      data: {
        deprecatedAt: new Date(deprecateForm.deprecatedAt).toISOString(),
        sunsetAt: deprecateForm.sunsetAt ? new Date(deprecateForm.sunsetAt).toISOString() : undefined,
        migrationGuide: deprecateForm.migrationGuide || undefined,
      },
    })
  }

  function submitNotice() {
    const e: Record<string, string> = {}
    if (!noticeForm.recipients.trim()) e.recipients = 'Required'
    if (!noticeForm.message.trim()) e.message = 'Required'
    if (Object.keys(e).length) { setNoticeErrors(e); return }
    if (!noticesTarget) return
    sendNoticeMutation.mutate({
      id: noticesTarget.id,
      data: {
        recipients: noticeForm.recipients.split(',').map(s => s.trim()).filter(Boolean),
        message: noticeForm.message,
      },
    })
  }

  const versions = data?.content ?? []

  const columns: Column<VersionEntry>[] = [
    {
      key: 'version', title: 'Version',
      render: (r) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--txt-1)' }}>{r.version}</span>,
    },
    {
      key: 'status', title: 'Status', width: 110,
      render: (r) => <Tag color={STATUS_COLOR[r.status]}>{r.status}</Tag>,
    },
    {
      key: 'deprecatedAt', title: 'Deprecated At', width: 140,
      render: (r) => r.deprecatedAt ? dayjs(r.deprecatedAt).format('MMM D, YYYY') : <span style={{ color: 'var(--txt-3)' }}>—</span>,
    },
    {
      key: 'sunsetAt', title: 'Sunset At', width: 140,
      render: (r) => r.sunsetAt ? dayjs(r.sunsetAt).format('MMM D, YYYY') : <span style={{ color: 'var(--txt-3)' }}>—</span>,
    },
    {
      key: 'migrationGuide', title: 'Migration Guide',
      render: (r) => r.migrationGuide ?? <span style={{ color: 'var(--txt-3)' }}>—</span>,
    },
    {
      key: 'createdAt', title: 'Registered', width: 120,
      render: (r) => dayjs(r.createdAt).format('MMM D, YYYY'),
    },
    {
      key: 'actions', title: '', width: 210,
      render: (r) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Btn variant="ghost" size="sm" icon={<Send size={12} />} onClick={() => setNoticesTarget(r)}>Notices</Btn>
          {r.status === 'ACTIVE' && (
            <Btn variant="ghost" size="sm" onClick={() => { setDeprecateTarget(r); setDeprecateForm({ deprecatedAt: '', sunsetAt: '', migrationGuide: '' }); setDeprecateErrors({}) }}>
              Deprecate
            </Btn>
          )}
          {r.status === 'DEPRECATED' && (
            <Confirm danger title="Mark this version as sunset (end-of-life)?" onConfirm={() => sunsetMutation.mutate(r.id)}>
              <Btn variant="danger" size="sm">Sunset</Btn>
            </Confirm>
          )}
          <Confirm danger title="Delete this version entry?" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
          </Confirm>
        </div>
      ),
    },
  ]

  const noticeColumns: Column<DeprecationNotice>[] = [
    { key: 'sentTo', title: 'Recipients', render: (r) => r.sentTo.join(', ') },
    { key: 'message', title: 'Message', render: (r) => <span style={{ fontSize: 13 }}>{r.message}</span> },
    { key: 'sentAt', title: 'Sent At', width: 140, render: (r) => dayjs(r.sentAt).format('MMM D, YYYY HH:mm') },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>API Versioning</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>
          Version registry, deprecation management, and sunset scheduling
        </p>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, maxWidth: 440 }}>
          <Inp
            label="API ID"
            value={apiId}
            onChangeValue={setApiId}
            placeholder="Paste proxy API UUID to load its versions"
          />
        </div>
        <Btn variant="primary" icon={<Plus size={15} />} disabled={!apiId} onClick={() => { setRegisterOpen(true); setRegisterForm({ version: '' }); setRegisterErrors({}) }}>
          Register Version
        </Btn>
      </div>

      {!apiId ? (
        <p style={{ color: 'var(--txt-3)', fontSize: 14 }}>Enter an API ID above to view and manage its versions.</p>
      ) : (
        <Tbl columns={columns} data={versions} rowKey="id" loading={isLoading} emptyText="No versions registered for this API" />
      )}

      {/* Register Version Drawer */}
      <Drawer
        open={registerOpen}
        onClose={() => { setRegisterOpen(false); setRegisterErrors({}) }}
        title="Register Version"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setRegisterOpen(false)}>Cancel</Btn>
            <Btn variant="primary" loading={registerMutation.isPending} icon={<GitBranch size={14} />} onClick={submitRegister}>Register</Btn>
          </div>
        }
      >
        <Inp
          label="Version String"
          value={registerForm.version}
          onChangeValue={v => setRegisterForm({ version: v })}
          placeholder="e.g. v1.2.0 or 2024-01"
          error={registerErrors.version}
        />
      </Drawer>

      {/* Deprecate Version Modal */}
      <Modal
        open={!!deprecateTarget}
        onClose={() => { setDeprecateTarget(null); setDeprecateErrors({}) }}
        title={`Deprecate ${deprecateTarget?.version}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setDeprecateTarget(null)}>Cancel</Btn>
            <Btn variant="danger" loading={deprecateMutation.isPending} onClick={submitDeprecate}>Deprecate</Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp label="Deprecated At" type="date" value={deprecateForm.deprecatedAt} onChangeValue={v => setDeprecateForm(f => ({ ...f, deprecatedAt: v }))} error={deprecateErrors.deprecatedAt} />
          <Inp label="Sunset At" type="date" value={deprecateForm.sunsetAt} onChangeValue={v => setDeprecateForm(f => ({ ...f, sunsetAt: v }))} />
          <Inp label="Migration Guide URL" value={deprecateForm.migrationGuide} onChangeValue={v => setDeprecateForm(f => ({ ...f, migrationGuide: v }))} placeholder="https://docs.example.com/migrate-v2" />
        </div>
      </Modal>

      {/* Deprecation Notices Drawer */}
      <Drawer
        open={!!noticesTarget}
        onClose={() => setNoticesTarget(null)}
        title={`Deprecation Notices — ${noticesTarget?.version}`}
        width={640}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="primary" icon={<Plus size={14} />} onClick={() => { setSendNoticeOpen(true); setNoticeForm({ recipients: '', message: '' }); setNoticeErrors({}) }}>Send Notice</Btn>
          </div>
        }
      >
        <Tbl columns={noticeColumns} data={notices?.content ?? []} rowKey="id" loading={noticesLoading} emptyText="No notices sent yet" />
      </Drawer>

      {/* Send Notice Modal */}
      <Modal
        open={sendNoticeOpen}
        onClose={() => { setSendNoticeOpen(false); setNoticeErrors({}) }}
        title="Send Deprecation Notice"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setSendNoticeOpen(false)}>Cancel</Btn>
            <Btn variant="primary" loading={sendNoticeMutation.isPending} icon={<Send size={14} />} onClick={submitNotice}>Send</Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp
            label="Recipients (comma-separated)"
            value={noticeForm.recipients}
            onChangeValue={v => setNoticeForm(f => ({ ...f, recipients: v }))}
            placeholder="partner@example.com, other@example.com"
            error={noticeErrors.recipients}
          />
          <div className="field">
            <label className="field-label">Message</label>
            <textarea
              rows={4}
              value={noticeForm.message}
              onChange={e => setNoticeForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Version v1.x will be deprecated on..."
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--txt-1)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            {noticeErrors.message && <div className="field-error">{noticeErrors.message}</div>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
