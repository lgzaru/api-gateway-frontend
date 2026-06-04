import { useState } from 'react'
import { copyToClipboard } from '../utils/clipboard'
import { Search, ShieldCheck, History, Copy, AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { listAuditLogs, verifyAuditChecksum } from '../api/audit'
import type { AuditLogEntry } from '../api/audit'
import { listChangelogByEntity, listChangelogByActor } from '../api/entitychangelog'
import type { ChangelogEntry } from '../api/entitychangelog'
import {
  Btn, Inp, Sel, Tag, Tbl, Tabs, Drawer, toast,
} from '../components/ui'
import type { Column, TabItem } from '../components/ui'
import { fmtTsFull, fmtTsMs } from '../utils/time'

const ENTITY_TAG_COLOR: Record<string, 'blue' | 'green' | 'orange' | 'accent' | 'muted'> = {
  USER: 'blue', PARTNER: 'green', PROXY_API: 'accent',
  SMS_GATEWAY: 'orange', FLAG: 'muted', ROLE: 'accent',
  WEBHOOK: 'blue', BILLING: 'orange',
}

const ACTION_TAG_COLOR: Record<string, 'green' | 'blue' | 'red' | 'orange' | 'muted'> = {
  CREATE: 'green', UPDATE: 'blue', DELETE: 'red',
  LOGIN: 'muted', LOGOUT: 'muted', ENABLE: 'green', DISABLE: 'orange',
}

function CopyText({ value }: { value: string }) {
  function copy() {
    copyToClipboard(value).then(() => toast.success('Copied'))
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{value}</span>
      <button
        onClick={(e) => { e.stopPropagation(); copy() }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', padding: 0, display: 'flex' }}
        title="Copy"
      >
        <Copy size={12} />
      </button>
    </span>
  )
}

export default function AuditTrail() {
  const [page, setPage] = useState(0)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('')
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null)

  // Entity changelog state
  const [clEntityType, setClEntityType] = useState('')
  const [clEntityId, setClEntityId] = useState('')
  const [clActorId, setClActorId] = useState('')
  const [clMode, setClMode] = useState<'entity' | 'actor'>('entity')
  const [clPage, setClPage] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, pageSize, entityType],
    queryFn: () => listAuditLogs({ entityType: entityType || undefined, page, size: pageSize, sort: 'createdAt,desc' }),
    select: (res) => res.data,
  })

  const clEntityEnabled = clMode === 'entity' && !!clEntityType && !!clEntityId
  const clActorEnabled = clMode === 'actor' && !!clActorId

  const { data: changelogData, isLoading: clLoading, isError: clIsError, error: clError, refetch: clRefetch } = useQuery({
    queryKey: ['entity-changelog', clMode, clEntityType, clEntityId, clActorId, clPage],
    queryFn: () => {
      if (clMode === 'entity' && clEntityType && clEntityId)
        return listChangelogByEntity(clEntityType, clEntityId, { page: clPage, size: 20 })
      if (clMode === 'actor' && clActorId)
        return listChangelogByActor(clActorId, { page: clPage, size: 20 })
      return null
    },
    enabled: clEntityEnabled || clActorEnabled,
    select: (res) => res?.data,
    retry: 1,
  })

  const entries = data?.content ?? []
  const total = data?.totalElements ?? 0

  const filtered = search
    ? entries.filter(e =>
        e.actorUsername?.toLowerCase().includes(search.toLowerCase()) ||
        e.action?.toLowerCase().includes(search.toLowerCase()) ||
        e.entityType?.toLowerCase().includes(search.toLowerCase()) ||
        e.ipAddress?.includes(search)
      )
    : entries

  async function handleVerify(entry: AuditLogEntry) {
    setVerifying(true)
    setVerifyResult(null)
    try {
      const { data } = await verifyAuditChecksum(entry.id)
      setVerifyResult(data.valid)
    } catch {
      toast.error('Verification request failed')
    } finally {
      setVerifying(false)
    }
  }

  const auditColumns: Column<AuditLogEntry>[] = [
    {
      key: 'createdAt',
      title: 'Time',
      width: 160,
      render: (row) => (
        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--txt-2)' }}>
          {fmtTsFull(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actorUsername',
      title: 'Actor',
      width: 140,
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt-1)' }}>
            {row.actorUsername ?? <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-3)' }}>{row.actorId}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'action',
      title: 'Action',
      width: 120,
      render: (row) => {
        const verb = row.action?.split(':')[0] ?? row.action
        return <Tag color={ACTION_TAG_COLOR[verb] ?? 'muted'}>{row.action}</Tag>
      },
    },
    {
      key: 'entityType',
      title: 'Entity Type',
      width: 130,
      render: (row) => row.entityType
        ? <Tag color={ENTITY_TAG_COLOR[row.entityType] ?? 'muted'}>{row.entityType}</Tag>
        : <span style={{ color: 'var(--txt-3)' }}>—</span>,
    },
    {
      key: 'entityId',
      title: 'Entity ID',
      width: 280,
      render: (row) => row.entityId
        ? <CopyText value={row.entityId} />
        : <span style={{ color: 'var(--txt-3)' }}>—</span>,
    },
    {
      key: 'ipAddress',
      title: 'IP Address',
      width: 130,
      render: (row) => (
        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--txt-2)' }}>{row.ipAddress}</span>
      ),
    },
    {
      key: 'actions',
      title: '',
      width: 80,
      render: (row) => (
        <Btn
          variant="link"
          size="sm"
          onClick={(e) => { e?.stopPropagation(); setSelected(row); setVerifyResult(null) }}
        >
          Details
        </Btn>
      ),
    },
  ]

  const changelogColumns: Column<ChangelogEntry>[] = [
    {
      key: 'createdAt',
      title: 'Time',
      width: 160,
      render: (row) => (
        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--txt-2)' }}>
          {fmtTsFull(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'entityType',
      title: 'Entity Type',
      width: 130,
      render: (row) => <Tag color={ENTITY_TAG_COLOR[row.entityType] ?? 'muted'}>{row.entityType}</Tag>,
    },
    {
      key: 'action',
      title: 'Action',
      width: 110,
      render: (row) => <Tag color={ACTION_TAG_COLOR[row.action] ?? 'muted'}>{row.action}</Tag>,
    },
    {
      key: 'actorId',
      title: 'Actor',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-2)' }}>{row.actorId}</span>
      ),
    },
    {
      key: 'changes',
      title: 'Changes',
      render: (row) => {
        if (!row.changes) return <span style={{ color: 'var(--txt-3)' }}>—</span>
        const str = typeof row.changes === 'string' ? row.changes : JSON.stringify(row.changes)
        return (
          <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>
            {str.substring(0, 80)}{str.length > 80 ? '…' : ''}
          </span>
        )
      },
    },
  ]

  const tabItems: TabItem[] = [
    {
      key: 'audit',
      label: 'Audit Logs',
      icon: <ShieldCheck size={14} />,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flexShrink: 0, display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Inp
              prefix={<Search size={14} />}
              placeholder="Search actor, action, entity, IP..."
              value={search}
              onChangeValue={setSearch}
            />
            <Sel
              placeholder="Filter by entity type"
              value={entityType}
              onChangeValue={v => setEntityType(v)}
              options={[
                { value: '', label: 'All entity types' },
                ...Object.keys(ENTITY_TAG_COLOR).map(k => ({ value: k, label: k })),
              ]}
            />
          </div>

          <Tbl
            columns={auditColumns}
            data={filtered}
            rowKey="id"
            loading={isLoading}
            emptyText="No audit entries found"
            onRow={(row) => ({ onClick: () => { setSelected(row); setVerifyResult(null) } })}
          />

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>{total} entries</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Btn variant="secondary" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Prev</Btn>
              <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>Page {page + 1}</span>
              <Btn variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= total}>Next</Btn>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'changelog',
      label: 'Entity Changelog',
      icon: <History size={14} />,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flexShrink: 0, display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div className="field-label">Search by</div>
              <Sel
                value={clMode}
                onChangeValue={v => { setClMode(v as 'entity' | 'actor'); setClPage(0) }}
                options={[{ value: 'entity', label: 'Entity' }, { value: 'actor', label: 'Actor' }]}
              />
            </div>
            {clMode === 'entity' ? (
              <>
                <div>
                  <div className="field-label">Entity Type</div>
                  <Inp
                    placeholder="e.g. PARTNER"
                    value={clEntityType}
                    onChangeValue={v => { setClEntityType(v.toUpperCase()); setClPage(0) }}
                  />
                </div>
                <div>
                  <div className="field-label">Entity ID (UUID)</div>
                  <Inp
                    placeholder="Entity UUID"
                    value={clEntityId}
                    onChangeValue={v => { setClEntityId(v); setClPage(0) }}
                  />
                </div>
              </>
            ) : (
              <div>
                <div className="field-label">Actor ID (UUID)</div>
                <Inp
                  placeholder="Actor UUID"
                  value={clActorId}
                  onChangeValue={v => { setClActorId(v); setClPage(0) }}
                />
              </div>
            )}
            <Btn
              variant="primary"
              onClick={() => clRefetch()}
              disabled={clMode === 'entity' ? !clEntityType || !clEntityId : !clActorId}
            >
              Search
            </Btn>
          </div>

          {clIsError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              background: 'var(--red-dim)', border: '1px solid var(--red)',
              borderRadius: 'var(--r-sm)', marginBottom: 10, flexShrink: 0,
            }}>
              <AlertTriangle size={14} color="var(--red)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--red)' }}>
                {(clError as any)?.response?.data?.message ?? 'Failed to load changelog — check the entity type and ID, or try again.'}
              </span>
            </div>
          )}

          <Tbl
            columns={changelogColumns}
            data={changelogData?.content ?? []}
            rowKey="id"
            loading={clLoading}
            emptyText={clEntityEnabled || clActorEnabled ? 'No changelog entries found' : 'Enter IDs and click Search to view changelog'}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>{changelogData?.totalElements ?? 0} changelog entries</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Btn variant="secondary" size="sm" onClick={() => setClPage(p => Math.max(0, p - 1))} disabled={clPage === 0}>Prev</Btn>
              <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>Page {clPage + 1}</span>
              <Btn variant="secondary" size="sm" onClick={() => setClPage(p => p + 1)} disabled={(clPage + 1) * 20 >= (changelogData?.totalElements ?? 0)}>Next</Btn>
            </div>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>Audit Trail</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>
          Tamper-evident log of all platform write operations
        </p>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs items={tabItems} />
      </div>

      {/* Detail Drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} />
            Audit Entry Detail
            {verifyResult === true && (
              <Tag color="green" dot>Checksum Valid</Tag>
            )}
            {verifyResult === false && (
              <Tag color="red" dot>Checksum Invalid — Possible Tampering</Tag>
            )}
          </span>
        }
        width={600}
        footer={
          <Btn
            loading={verifying}
            icon={<ShieldCheck size={14} />}
            onClick={() => selected && handleVerify(selected)}
          >
            Verify Integrity
          </Btn>
        }
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { label: 'ID', content: <CopyText value={selected.id} /> },
              {
                label: 'Actor',
                content: (
                  <div>
                    {selected.actorUsername && (
                      <div style={{ fontWeight: 600, color: 'var(--txt-1)' }}>{selected.actorUsername}</div>
                    )}
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: selected.actorUsername ? 'var(--txt-3)' : 'var(--txt-1)' }}>
                      {selected.actorId}
                    </div>
                  </div>
                ),
              },
              {
                label: 'Action',
                content: (
                  <Tag color={ACTION_TAG_COLOR[selected.action?.split(':')[0]] ?? 'muted'}>{selected.action}</Tag>
                ),
              },
              {
                label: 'Entity Type',
                content: <Tag color={ENTITY_TAG_COLOR[selected.entityType] ?? 'muted'}>{selected.entityType}</Tag>,
              },
              { label: 'Entity ID', content: <CopyText value={selected.entityId} /> },
              {
                label: 'IP Address',
                content: <span style={{ fontFamily: 'monospace', color: 'var(--txt-2)' }}>{selected.ipAddress}</span>,
              },
              {
                label: 'Timestamp',
                content: <span style={{ color: 'var(--txt-2)' }}>{fmtTsMs(selected.createdAt)}</span>,
              },
            ].map(({ label, content }) => (
              <div
                key={label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--divider)',
                  alignItems: 'start',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt-2)' }}>{label}</span>
                <span style={{ fontSize: 13 }}>{content}</span>
              </div>
            ))}

            {selected.beforeValue && (
              <div style={{ padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt-2)', marginBottom: 6 }}>Before</div>
                <pre style={{
                  fontSize: 11, maxHeight: 200, overflow: 'auto', margin: 0, padding: 10,
                  background: 'var(--surface-2)', borderRadius: 'var(--r-sm)',
                  color: 'var(--txt-2)', border: '1px solid var(--border)',
                }}>
                  {(() => { try { return JSON.stringify(JSON.parse(selected.beforeValue), null, 2) } catch { return selected.beforeValue } })()}
                </pre>
              </div>
            )}
            {selected.afterValue && (
              <div style={{ padding: '10px 0' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt-2)', marginBottom: 6 }}>After</div>
                <pre style={{
                  fontSize: 11, maxHeight: 200, overflow: 'auto', margin: 0, padding: 10,
                  background: 'var(--surface-2)', borderRadius: 'var(--r-sm)',
                  color: 'var(--txt-2)', border: '1px solid var(--border)',
                }}>
                  {(() => { try { return JSON.stringify(JSON.parse(selected.afterValue), null, 2) } catch { return selected.afterValue } })()}
                </pre>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
