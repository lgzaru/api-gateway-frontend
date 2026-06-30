import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listPending, approveApproval, rejectApproval, cancelApproval,
} from '../api/approvals'
import type { Approval } from '../api/approvals'
import { getPendingIpRequests, reviewIpRequest } from '../api/partners'
import { listUsers } from '../api/users'
import type { IpRequest } from '../api/partners'
import {
  Btn, Tag, Tbl, Drawer, Modal, toast,
} from '../components/ui'
import type { Column } from '../components/ui'
import dayjs from 'dayjs'
import { useAuth } from '../context/AuthContext'

const STATUS_COLOR: Record<string, 'orange' | 'green' | 'red' | 'muted'> = {
  PENDING: 'orange', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'muted',
}

type ReviewAction = { id: string; type: 'approve' | 'reject' }

export default function Approvals() {
  const { user } = useAuth()
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Approval | null>(null)
  const [review, setReview] = useState<ReviewAction | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [ipReview, setIpReview] = useState<ReviewAction | null>(null)
  const [ipReviewNote, setIpReviewNote] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', page],
    queryFn: () => listPending({ page, size: 20 }),
    select: (res) => res.data,
  })

  const { data: ipData, isLoading: ipLoading } = useQuery({
    queryKey: ['approvals-ip-pending'],
    queryFn: () => getPendingIpRequests({ page: 0, size: 50 }),
    select: (res) => res.data,
  })

  const { data: usersData } = useQuery({
    queryKey: ['users-lookup'],
    queryFn: () => listUsers({ page: 0, size: 200 }),
    select: (res) => Object.fromEntries(res.data.content.map(u => [u.id, u.fullName || u.username])),
    staleTime: 60_000,
  })

  const ipApproveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      reviewIpRequest(id, { status: 'APPROVED', reviewNotes: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals-ip-pending'] })
      qc.invalidateQueries({ queryKey: ['dash-pending-ip'] })
      setIpReview(null); setIpReviewNote('')
      toast.success('IP request approved')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to approve'),
  })

  const ipRejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      reviewIpRequest(id, { status: 'REJECTED', reviewNotes: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals-ip-pending'] })
      qc.invalidateQueries({ queryKey: ['dash-pending-ip'] })
      setIpReview(null); setIpReviewNote('')
      toast.success('IP request rejected')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to reject'),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => approveApproval(id, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approvals'] }); setReview(null); setReviewNote(''); toast.success('Approval granted') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to approve'),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => rejectApproval(id, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approvals'] }); setReview(null); setReviewNote(''); toast.success('Request rejected') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to reject'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelApproval(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approvals'] }); toast.success('Request cancelled') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to cancel'),
  })

  const items = data?.content ?? []
  const pending = items.filter(a => a.status === 'PENDING').length

  const columns: Column<Approval>[] = [
    {
      key: 'actionType', title: 'Action',
      render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--txt-1)' }}>{r.actionType}</span>,
    },
    {
      key: 'entity', title: 'Entity',
      render: (r) => (
        <div>
          <div style={{ fontSize: 12, color: 'var(--txt-2)' }}>{r.entityType}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-3)' }}>{r.entityId}</div>
        </div>
      ),
    },
    {
      key: 'status', title: 'Status', width: 100,
      render: (r) => <Tag color={STATUS_COLOR[r.status]}>{r.status}</Tag>,
    },
    {
      key: 'requestedBy', title: 'Requested By', width: 130,
      render: (r) => <span style={{ fontSize: 12 }}>{r.requestedBy}</span>,
    },
    {
      key: 'requestedAt', title: 'Requested At', width: 140,
      render: (r) => dayjs(r.requestedAt).format('MMM D, YYYY HH:mm'),
    },
    {
      key: 'expiresAt', title: 'Expires', width: 130,
      render: (r) => {
        if (!r.expiresAt) return <span style={{ color: 'var(--txt-3)' }}>—</span>
        const expired = dayjs(r.expiresAt).isBefore(dayjs())
        return <span style={{ color: expired ? 'var(--red)' : 'var(--txt-2)', fontSize: 13 }}>{dayjs(r.expiresAt).format('MMM D HH:mm')}</span>
      },
    },
    {
      key: 'actions', title: '', width: 190,
      render: (r) => {
        if (r.status !== 'PENDING') return null
        const isRequester = r.requestedBy === user?.username
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            {!isRequester && (
              <>
                <Btn
                  variant="ghost"
                  size="sm"
                  icon={<CheckCircle2 size={13} style={{ color: 'var(--green)' }} />}
                  style={{ color: 'var(--green)' }}
                  onClick={(e) => { e.stopPropagation(); setReview({ id: r.id, type: 'approve' }) }}
                >
                  Approve
                </Btn>
                <Btn
                  variant="ghost"
                  size="sm"
                  icon={<XCircle size={13} style={{ color: 'var(--red)' }} />}
                  style={{ color: 'var(--red)' }}
                  onClick={(e) => { e.stopPropagation(); setReview({ id: r.id, type: 'reject' }) }}
                >
                  Reject
                </Btn>
              </>
            )}
            {isRequester && (
              <Btn
                variant="ghost"
                size="sm"
                loading={cancelMutation.isPending}
                onClick={(e) => { e.stopPropagation(); cancelMutation.mutate(r.id) }}
              >
                Cancel
              </Btn>
            )}
          </div>
        )
      },
    },
  ]

  const ipItems: IpRequest[] = ipData?.content ?? []

  const ipColumns: Column<IpRequest>[] = [
    {
      key: 'action', title: 'Action',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: r.action === 'ADD' ? 'var(--green)' : 'var(--red)' }}>
          IP {r.action}
        </span>
      ),
    },
    {
      key: 'ipCidr', title: 'IP / CIDR',
      render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--txt-1)' }}>{r.ipCidr}</span>,
    },
    {
      key: 'status', title: 'Status', width: 110,
      render: (r) => <Tag color={STATUS_COLOR[r.status] ?? 'muted'}>{r.status}</Tag>,
    },
    {
      key: 'requestedBy', title: 'Requested By', width: 160,
      render: (r) => (
        <span style={{ fontSize: 12, color: 'var(--txt-1)' }}>
          {usersData?.[r.requestedBy ?? ''] || r.reason || '—'}
        </span>
      ),
    },
    {
      key: 'createdAt', title: 'Requested At', width: 140,
      render: (r) => dayjs(r.createdAt).format('MMM D, YYYY HH:mm'),
    },
    {
      key: 'ipActions', title: '', width: 160,
      render: (r) => {
        if (r.status !== 'PENDING') return null
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn
              variant="ghost" size="sm"
              icon={<CheckCircle2 size={13} style={{ color: 'var(--green)' }} />}
              style={{ color: 'var(--green)' }}
              onClick={(e) => { e.stopPropagation(); setIpReview({ id: r.id, type: 'approve' }) }}
            >Approve</Btn>
            <Btn
              variant="ghost" size="sm"
              icon={<XCircle size={13} style={{ color: 'var(--red)' }} />}
              style={{ color: 'var(--red)' }}
              onClick={(e) => { e.stopPropagation(); setIpReview({ id: r.id, type: 'reject' }) }}
            >Reject</Btn>
          </div>
        )
      },
    },
  ]

  const statCard = (label: string, value: number, color?: string) => (
    <div className="card-sm">
      <div style={{ fontSize: 11, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--txt-1)' }}>{value}</div>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>Maker-Checker Approvals</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>
          Dual-approval workflow for sensitive platform actions
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {statCard('Pending Review', pending, pending > 0 ? 'var(--orange)' : undefined)}
        {statCard('Approved', items.filter(a => a.status === 'APPROVED').length, 'var(--green)')}
        {statCard('Rejected', items.filter(a => a.status === 'REJECTED').length, 'var(--red)')}
        {statCard('Total (this page)', items.length)}
      </div>

      <Tbl
        columns={columns}
        data={items}
        rowKey="id"
        loading={isLoading}
        emptyText="No approval requests"
        onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: 'pointer' } })}
      />

      {/* Pagination */}
      {(data?.totalElements ?? 0) > 20 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--txt-3)' }}>{data?.totalElements} requests</span>
          <Btn variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Btn>
          <span style={{ fontSize: 13, color: 'var(--txt-2)' }}>Page {page + 1}</span>
          <Btn variant="secondary" size="sm" disabled={(page + 1) * 20 >= (data?.totalElements ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Btn>
        </div>
      )}

      {/* Detail Drawer */}
      <Drawer
        title="Approval Detail"
        open={!!selected}
        onClose={() => setSelected(null)}
        width={520}
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {([
              ['Action Type', <span style={{ fontFamily: 'monospace' }}>{selected.actionType}</span>],
              ['Entity Type', selected.entityType],
              ['Entity ID', <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{selected.entityId}</span>],
              ['Status', <Tag color={STATUS_COLOR[selected.status]}>{selected.status}</Tag>],
              ['Requested By', selected.requestedBy],
              ['Requested At', dayjs(selected.requestedAt).format('MMM D, YYYY HH:mm:ss')],
              ['Reviewed By', selected.reviewedBy ?? '—'],
              ['Reviewed At', selected.reviewedAt ? dayjs(selected.reviewedAt).format('MMM D, YYYY HH:mm') : '—'],
              ['Reviewer Note', selected.reviewerNote ?? '—'],
              ['Expires At', selected.expiresAt ? dayjs(selected.expiresAt).format('MMM D, YYYY HH:mm') : '—'],
            ] as [string, React.ReactNode][]).map(([label, value]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
                <span style={{ fontSize: 12, color: 'var(--txt-3)', alignSelf: 'start', paddingTop: 2 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--txt-1)' }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {/* IP Requests Section */}
      <div style={{ marginTop: 32 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--txt-1)' }}>Pending IP Requests</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--txt-3)', fontSize: 13 }}>Partner IP allowlist add / remove requests awaiting review</p>
        <Tbl
          columns={ipColumns}
          data={ipItems}
          rowKey="id"
          loading={ipLoading}
          emptyText="No pending IP requests"
        />
      </div>

      {/* Approve / Reject Modal */}
      <Modal
        title={review?.type === 'approve' ? 'Approve Request' : 'Reject Request'}
        open={!!review}
        onClose={() => { setReview(null); setReviewNote('') }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => { setReview(null); setReviewNote('') }}>Cancel</Btn>
            <Btn
              variant={review?.type === 'approve' ? 'primary' : 'danger'}
              loading={approveMutation.isPending || rejectMutation.isPending}
              onClick={() => {
                if (!review) return
                if (review.type === 'approve') {
                  approveMutation.mutate({ id: review.id, note: reviewNote || undefined })
                } else {
                  rejectMutation.mutate({ id: review.id, note: reviewNote || undefined })
                }
              }}
            >
              {review?.type === 'approve' ? 'Approve' : 'Reject'}
            </Btn>
          </div>
        }
      >
        <div className="field">
          <label className="field-label">Note (optional)</label>
          <textarea
            rows={3}
            value={reviewNote}
            onChange={e => setReviewNote(e.target.value)}
            placeholder="Optional note to accompany your decision"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--txt-1)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>
      </Modal>

      {/* IP Request Approve / Reject Modal */}
      <Modal
        title={ipReview?.type === 'approve' ? 'Approve IP Request' : 'Reject IP Request'}
        open={!!ipReview}
        onClose={() => { setIpReview(null); setIpReviewNote('') }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => { setIpReview(null); setIpReviewNote('') }}>Cancel</Btn>
            <Btn
              variant={ipReview?.type === 'approve' ? 'primary' : 'danger'}
              loading={ipApproveMutation.isPending || ipRejectMutation.isPending}
              onClick={() => {
                if (!ipReview) return
                if (ipReview.type === 'approve') {
                  ipApproveMutation.mutate({ id: ipReview.id, note: ipReviewNote || undefined })
                } else {
                  ipRejectMutation.mutate({ id: ipReview.id, note: ipReviewNote || undefined })
                }
              }}
            >
              {ipReview?.type === 'approve' ? 'Approve' : 'Reject'}
            </Btn>
          </div>
        }
      >
        <div className="field">
          <label className="field-label">Note (optional)</label>
          <textarea
            rows={3}
            value={ipReviewNote}
            onChange={e => setIpReviewNote(e.target.value)}
            placeholder="Optional note to accompany your decision"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--txt-1)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>
      </Modal>
    </div>
  )
}
