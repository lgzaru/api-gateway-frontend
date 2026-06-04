import { Bell, CheckCircle2, XCircle, Info, AlertTriangle, Check } from 'lucide-react'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listNotifications, markAsRead, markAllAsRead } from '../api/notifications'
import type { Notification, NotificationType } from '../api/notifications'
import { Btn, Tag, Switch, Spin } from '../components/ui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const TYPE_META: Record<NotificationType, { color: 'blue' | 'orange' | 'red' | 'green'; icon: React.ReactNode; bg: string }> = {
  INFO:    { color: 'blue',   icon: <Info size={16} />,          bg: 'var(--blue-dim)' },
  WARNING: { color: 'orange', icon: <AlertTriangle size={16} />, bg: 'var(--orange-dim)' },
  ERROR:   { color: 'red',    icon: <XCircle size={16} />,       bg: 'var(--red-dim)' },
  SUCCESS: { color: 'green',  icon: <CheckCircle2 size={16} />,  bg: 'var(--green-dim)' },
}

export default function Notifications() {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(0)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', unreadOnly, page],
    queryFn: () => listNotifications({ unreadOnly, page, size: 20 }),
    select: (res) => res.data,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markAsRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllMutation = useMutation({
    mutationFn: () => markAllAsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const items = data?.content ?? []
  const total = data?.totalElements ?? 0
  const unreadCount = items.filter(n => !n.read).length

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>Notifications</h2>
            {unreadCount > 0 && (
              <span style={{
                background: 'var(--accent)', color: '#fff', borderRadius: 10,
                fontSize: 11, fontWeight: 700, padding: '1px 8px', lineHeight: 1.6,
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>
            In-platform notification inbox
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--txt-2)', cursor: 'pointer' }}>
            Unread only
            <Switch
              checked={unreadOnly}
              onChange={v => { setUnreadOnly(v); setPage(0) }}
            />
          </label>
          <Btn
            icon={<Check size={14} />}
            onClick={() => markAllMutation.mutate()}
            loading={markAllMutation.isPending}
            disabled={items.every(n => n.read)}
          >
            Mark all read
          </Btn>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <Spin tip="Loading notifications..." />
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--txt-3)' }}>
          <Bell size={48} style={{ opacity: 0.3, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14 }}>{unreadOnly ? 'No unread notifications' : 'No notifications'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item: Notification) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.INFO
            return (
              <div
                key={item.id}
                onClick={() => !item.read && markReadMutation.mutate(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '14px 18px',
                  borderRadius: 'var(--r-md)',
                  background: item.read ? 'var(--surface)' : 'color-mix(in srgb, var(--accent) 5%, var(--surface))',
                  border: '1px solid',
                  borderColor: item.read ? 'var(--border)' : 'color-mix(in srgb, var(--accent) 20%, var(--border))',
                  transition: 'all 0.15s',
                  cursor: item.read ? 'default' : 'pointer',
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: meta.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  color: `var(--${meta.color})`,
                }}>
                  {meta.icon}
                </div>

                {/* Body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                    {!item.read && (
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
                    )}
                    <span style={{ fontWeight: item.read ? 400 : 600, fontSize: 14, color: 'var(--txt-1)' }}>
                      {item.title}
                    </span>
                    <Tag color={meta.color}>{item.type}</Tag>
                    {item.entityType && (
                      <span style={{
                        fontSize: 10, padding: '1px 7px', borderRadius: 10,
                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                        color: 'var(--txt-3)',
                      }}>
                        {item.entityType}
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--txt-2)', fontSize: 13, marginBottom: 5 }}>{item.message}</div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>{dayjs(item.createdAt).fromNow()}</span>
                    {item.read && item.readAt && (
                      <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>Read {dayjs(item.readAt).fromNow()}</span>
                    )}
                  </div>
                </div>

                {/* Mark read action */}
                {!item.read && (
                  <Btn
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={<Check size={14} />}
                    loading={markReadMutation.isPending && markReadMutation.variables === item.id}
                    onClick={(e) => { e?.stopPropagation(); markReadMutation.mutate(item.id) }}
                  />
                )}
              </div>
            )
          })}

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', marginTop: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>{total} notifications</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Btn variant="secondary" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Prev</Btn>
              <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>Page {page + 1}</span>
              <Btn variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 20 >= total}>Next</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
