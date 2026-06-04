import { useState, useMemo, useEffect } from 'react'
import { Users, Plus, Search, CheckCircle2, XCircle, Pencil, ChevronRight } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listUsers, createUser, updateUser, deleteUser, assignRoles,
  type PlatformUser, type UserStatus,
} from '../api/users'
import { listRoles, createRole, updateRolePermissions, listPermissions } from '../api/roles'
import type { RoleDetail, Permission } from '../api/roles'
import {
  Btn, Inp, Sel, Confirm, Drawer, Modal, Tbl, Spin, toast,
} from '../components/ui'
import type { Column } from '../components/ui'

// ── Role badge ──────────────────────────────────────────────────────────────

const ROLE_COLORS: [string, string, string][] = [
  ['var(--blue-dim)',   'var(--blue)',   'var(--blue)'],
  ['var(--orange-dim)','var(--orange)', 'var(--orange)'],
  ['var(--green-dim)', 'var(--green)',  'var(--green)'],
  ['var(--accent)',    '#fff',          'transparent'],
  ['var(--red-dim)',   'var(--red)',    'var(--red)'],
]

function roleColor(code: string) {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) & 0xffff
  return ROLE_COLORS[h % ROLE_COLORS.length]
}

function RoleBadge({ code }: { code: string }) {
  const [bg, color, border] = roleColor(code)
  return (
    <span style={{
      background: bg, color, border: `1px solid ${border}`,
      borderRadius: 'var(--r-sm)', padding: '2px 10px',
      fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
      whiteSpace: 'nowrap', letterSpacing: '0.3px',
    }}>
      {code.replace(/^ROLE_/, '')}
    </span>
  )
}

// ── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: UserStatus }) {
  const active = status === 'ACTIVE'
  const suspended = status === 'SUSPENDED'
  const bg    = active ? 'var(--green-dim)' : suspended ? 'var(--orange-dim)' : 'var(--red-dim)'
  const color = active ? 'var(--green)'     : suspended ? 'var(--orange)'     : 'var(--red)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: bg, color, border: `1px solid ${color}`,
      borderRadius: 'var(--r-sm)', padding: '2px 10px',
      fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', opacity: 0.9,
    }}>
      {active
        ? <CheckCircle2 size={10} strokeWidth={2.5} />
        : <XCircle size={10} strokeWidth={2.5} />}
      {active ? 'Active' : suspended ? 'Suspended' : 'Inactive'}
    </span>
  )
}

// ── Filter pill ─────────────────────────────────────────────────────────────

function FilterPill({ label, count, active, onClick }: {
  label: string; count: number; active: boolean; onClick: () => void
}) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
        background: active ? 'rgba(var(--accent-rgb, 50,77,255),0.08)' : 'transparent',
        marginBottom: 2, transition: 'background var(--dur-fast)', userSelect: 'none',
      }}
    >
      <div style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: active ? 'var(--accent)' : 'var(--txt-3)',
      }} />
      <span style={{
        flex: 1, fontSize: 13, fontWeight: active ? 700 : 400,
        color: active ? 'var(--accent)' : 'var(--txt-2)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 700,
        color: active ? 'var(--accent)' : 'var(--txt-3)',
        background: active ? 'rgba(var(--accent-rgb, 50,77,255),0.12)' : 'var(--surface-2)',
        borderRadius: 99, padding: '1px 7px', minWidth: 22, textAlign: 'center',
      }}>
        {count}
      </span>
    </div>
  )
}

// ── Initials avatar ─────────────────────────────────────────────────────────

function UserAvatar({ name, size = 32 }: { name: string | null; size?: number }) {
  const initials = (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 32 ? 10 : 12, fontWeight: 800, color: '#fff',
    }}>
      {initials}
    </div>
  )
}

// ── Edit / Create panel ─────────────────────────────────────────────────────

interface UserFormState {
  username: string
  fullName: string
  email: string
  password: string
  status: UserStatus
  roleIds: string[]
}

function EditPanel({
  user,
  isNew,
  roles,
  onSave,
  onDelete,
  onClose,
  saving,
}: {
  user: PlatformUser | null
  isNew: boolean
  roles: RoleDetail[]
  onSave: (form: UserFormState) => void
  onDelete: () => void
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<UserFormState>({
    username: '', fullName: '', email: '', password: '', status: 'ACTIVE', roleIds: [],
  })
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormState, string>>>({})

  useEffect(() => {
    if (!isNew && user) {
      // map role codes back to IDs
      const ids = user.roles.flatMap(code => {
        const found = roles.find(r => r.code === code)
        return found ? [found.id] : []
      })
      setForm({
        username: user.username,
        fullName: user.fullName ?? '',
        email: user.email,
        password: '',
        status: user.status,
        roleIds: ids,
      })
    } else {
      setForm({ username: '', fullName: '', email: '', password: '', status: 'ACTIVE', roleIds: [] })
    }
    setErrors({})
  }, [user, isNew, roles])

  function validate(): boolean {
    const e: typeof errors = {}
    if (isNew && !form.username.trim()) e.username = 'Required'
    if (!form.email.trim()) e.email = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email required'
    if (isNew && form.password.length < 8) e.password = 'At least 8 characters'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function toggleRole(id: string) {
    setForm(f => ({
      ...f,
      roleIds: f.roleIds.includes(id) ? f.roleIds.filter(x => x !== id) : [...f.roleIds, id],
    }))
  }

  return (
    <div
      className="slide-in-right"
      style={{
        width: 360, flexShrink: 0,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt-1)' }}>
            {isNew ? 'Add User' : 'Edit User'}
          </div>
          {user && !isNew && (
            <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 2 }}>{user.username}</div>
          )}
        </div>
        <button
          type="button" onClick={onClose}
          style={{
            background: 'var(--surface-2)', border: 'none', borderRadius: 8,
            width: 30, height: 30, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--txt-3)', fontSize: 15,
          }}
        >✕</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {user && !isNew && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--surface-2)', borderRadius: 'var(--r-md)',
            padding: '12px 14px', border: '1px solid var(--border)', marginBottom: 20,
          }}>
            <UserAvatar name={user.fullName ?? user.username} size={40} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt-1)' }}>
                {user.fullName ?? user.username}
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 3 }}>{user.email}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {isNew && (
            <Inp
              label="Username"
              placeholder="e.g. jane.smith"
              value={form.username}
              onChangeValue={v => { setForm(f => ({ ...f, username: v })); setErrors(e => ({ ...e, username: undefined })) }}
              error={errors.username}
            />
          )}
          <Inp
            label="Full Name"
            placeholder="e.g. Jane Smith"
            value={form.fullName}
            onChangeValue={v => setForm(f => ({ ...f, fullName: v }))}
          />
          <Inp
            label="Email Address"
            type="email"
            placeholder="jane@1010tech.io"
            value={form.email}
            onChangeValue={v => { setForm(f => ({ ...f, email: v })); setErrors(e => ({ ...e, email: undefined })) }}
            error={errors.email}
          />
          {isNew && (
            <Inp
              label="Password"
              type="password"
              placeholder="Min. 8 characters"
              value={form.password}
              onChangeValue={v => { setForm(f => ({ ...f, password: v })); setErrors(e => ({ ...e, password: undefined })) }}
              error={errors.password}
            />
          )}
          {!isNew && (
            <Sel
              label="Status"
              options={[
                { value: 'ACTIVE',    label: 'Active' },
                { value: 'INACTIVE',  label: 'Inactive' },
                { value: 'SUSPENDED', label: 'Suspended' },
              ]}
              value={form.status}
              onChangeValue={v => setForm(f => ({ ...f, status: v as UserStatus }))}
            />
          )}

          {/* Roles */}
          <div className="field">
            <label className="field-label">Roles</label>
            <div style={{
              border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
              maxHeight: 180, overflowY: 'auto',
            }}>
              {roles.length === 0 ? (
                <div style={{ padding: '12px', color: 'var(--txt-3)', fontSize: 13, textAlign: 'center' }}>
                  No roles available
                </div>
              ) : (
                roles.map((r, i) => {
                  const checked = form.roleIds.includes(r.id)
                  return (
                    <label key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: i < roles.length - 1 ? '1px solid var(--divider)' : 'none',
                      background: checked ? 'rgba(var(--accent-rgb, 50,77,255),0.05)' : 'transparent',
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRole(r.id)}
                        style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--txt-1)' }}>
                          {r.code}
                        </div>
                        {r.description && (
                          <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>{r.description}</div>
                        )}
                      </div>
                    </label>
                  )
                })
              )}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--txt-3)' }}>
              {form.roleIds.length} role{form.roleIds.length !== 1 ? 's' : ''} selected
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 20px 16px', borderTop: '1px solid var(--border)',
        flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <Btn variant="primary" block loading={saving} onClick={() => validate() && onSave(form)}>
          {isNew ? 'Create User' : 'Save Changes'}
        </Btn>
        {!isNew && user && (
          <Confirm
            title="Remove User"
            description={`Are you sure you want to remove ${user.fullName ?? user.username}? This cannot be undone.`}
            danger
            onConfirm={onDelete}
          >
            <Btn variant="danger" block>Remove User</Btn>
          </Confirm>
        )}
      </div>
    </div>
  )
}

// ── Permission edit modal ────────────────────────────────────────────────────

function PermissionEditModal({
  role, permissions, selected, onSelChange, onSave, onClose, loading,
}: {
  role: RoleDetail | null
  permissions: Permission[]
  selected: string[]
  onSelChange: (ids: string[]) => void
  onSave: () => void
  onClose: () => void
  loading: boolean
}) {
  const [search, setSearch] = useState('')
  const filtered = permissions.filter(p =>
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    (p.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
    p.module.toLowerCase().includes(search.toLowerCase())
  )
  function toggle(id: string) {
    onSelChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }
  return (
    <Modal
      open={!!role}
      onClose={onClose}
      title={`Edit Permissions — ${role?.name ?? ''}`}
      width={600}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={loading} onClick={onSave}>Save Permissions</Btn>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <Inp placeholder="Search permissions…" prefix={<Search size={14} />} value={search} onChangeValue={setSearch} />
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', maxHeight: 320, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--txt-3)', fontSize: 13 }}>
            No permissions found
          </div>
        ) : (
          filtered.map((p, i) => {
            const checked = selected.includes(p.id)
            return (
              <label key={p.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--divider)' : 'none',
                background: checked ? 'rgba(var(--accent-rgb, 50,77,255),0.05)' : 'transparent',
              }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(p.id)}
                  style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--txt-1)' }}>{p.code}</div>
                  {p.description && <div style={{ fontSize: 12, color: 'var(--txt-2)', marginTop: 2 }}>{p.description}</div>}
                  <div style={{ fontSize: 10, color: 'var(--txt-3)', marginTop: 2 }}>{p.module}</div>
                </div>
              </label>
            )
          })
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--txt-3)' }}>
        {selected.length} permission{selected.length !== 1 ? 's' : ''} selected
      </div>
    </Modal>
  )
}

// ── Role form state ──────────────────────────────────────────────────────────

interface RoleFormState {
  code: string
  name: string
  description: string
  permissionIds: string[]
}

// ── Main component ───────────────────────────────────────────────────────────

export default function UserManagement() {
  const [roleFilter, setRoleFilter] = useState('all')
  const [search,     setSearch]     = useState('')
  const [editUserId, setEditUserId] = useState<string | null | 'new'>(null)
  const [activeTab,  setActiveTab]  = useState('users')

  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false)
  const [permEditModal,  setPermEditModal]  = useState<RoleDetail | null>(null)
  const [selectedPerms,  setSelectedPerms]  = useState<string[]>([])
  const [permSearch,     setPermSearch]     = useState('')
  const [roleForm,       setRoleForm]       = useState<RoleFormState>({ code: '', name: '', description: '', permissionIds: [] })
  const [roleFormErrors, setRoleFormErrors] = useState<Partial<Record<keyof RoleFormState, string>>>({})

  const qc = useQueryClient()

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: usersPage, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers({ page: 0, size: 200 }),
    select: r => r.data,
  })

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => listRoles(),
    select: r => r.data,
    enabled: activeTab === 'roles' || activeTab === 'users',
  })

  const { data: permissionsData } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => listPermissions(),
    select: r => r.data,
    enabled: activeTab === 'roles' || !!permEditModal,
  })

  const users = usersPage?.content ?? []
  const roles = rolesData ?? []

  const selectedUser = editUserId && editUserId !== 'new'
    ? users.find(u => u.id === editUserId) ?? null
    : null
  const isNew = editUserId === 'new'

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (form: UserFormState) => {
      const res = await createUser({
        username: form.username,
        email: form.email,
        fullName: form.fullName || undefined,
        password: form.password,
        roleIds: form.roleIds.length ? form.roleIds : undefined,
      })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditUserId(null)
      toast.success('User created')
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? 'Failed to create user'
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: UserFormState }) => {
      await updateUser(id, {
        email:    form.email,
        fullName: form.fullName || undefined,
        status:   form.status,
      })
      await assignRoles(id, form.roleIds)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditUserId(null)
      toast.success('User updated')
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? 'Failed to update user'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditUserId(null)
      toast.success('User removed')
    },
    onError: () => toast.error('Failed to remove user'),
  })

  const createRoleMutation = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      setRoleDrawerOpen(false)
      setRoleForm({ code: '', name: '', description: '', permissionIds: [] })
      toast.success('Role created')
    },
    onError: () => toast.error('Failed to create role'),
  })

  const updatePermsMutation = useMutation({
    mutationFn: ({ id, perms }: { id: string; perms: string[] }) => updateRolePermissions(id, perms),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      setPermEditModal(null)
      toast.success('Permissions updated')
    },
    onError: () => toast.error('Failed to update permissions'),
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSave(form: UserFormState) {
    if (isNew) {
      createMutation.mutate(form)
    } else if (selectedUser) {
      updateMutation.mutate({ id: selectedUser.id, form })
    }
  }

  function validateRoleForm(): boolean {
    const e: typeof roleFormErrors = {}
    if (!roleForm.code.trim()) e.code = 'Required'
    else if (!/^[A-Z_]+$/.test(roleForm.code)) e.code = 'Uppercase letters and underscores only'
    if (!roleForm.name.trim()) e.name = 'Required'
    setRoleFormErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Filtered users ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u => {
      const matchQ = (u.username + (u.fullName ?? '') + u.email).toLowerCase().includes(q)
      const matchR = roleFilter === 'all' || u.roles.includes(roleFilter)
      return matchQ && matchR
    })
  }, [users, search, roleFilter])

  const roleCounts = useMemo(() =>
    roles.reduce<Record<string, number>>((acc, r) => {
      acc[r.code] = users.filter(u => u.roles.includes(r.code)).length
      return acc
    }, {}),
    [users, roles]
  )

  const activeCount   = users.filter(u => u.status === 'ACTIVE').length
  const saving = createMutation.isPending || updateMutation.isPending

  // ── Role columns ──────────────────────────────────────────────────────────

  const roleColumns: Column<RoleDetail>[] = [
    {
      key: 'code',
      title: 'Code',
      width: 180,
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
          {row.code}
        </span>
      ),
    },
    {
      key: 'name',
      title: 'Name',
      width: 140,
      render: (row) => <span style={{ fontWeight: 600, color: 'var(--txt-1)' }}>{row.name}</span>,
    },
    {
      key: 'description',
      title: 'Description',
      render: (row) => <span style={{ color: 'var(--txt-2)', fontSize: 13 }}>{row.description ?? '—'}</span>,
    },
    {
      key: 'permissions',
      title: 'Permissions',
      width: 220,
      render: (row) => {
        const perms = row.permissions ?? []
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {perms.slice(0, 4).map(p => (
              <span key={p.id} style={{
                fontFamily: 'monospace', fontSize: 9, fontWeight: 700,
                background: 'var(--surface-2)', color: 'var(--txt-2)',
                border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px',
              }}>
                {p.code}
              </span>
            ))}
            {perms.length > 4 && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: 'var(--txt-3)',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '1px 6px',
              }}>
                +{perms.length - 4}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      title: '',
      width: 110,
      render: (row) => (
        <Btn variant="link" size="sm" icon={<Pencil size={12} />} onClick={() => {
          setPermEditModal(row)
          setSelectedPerms((row.permissions ?? []).map(p => p.id))
        }}>
          Permissions
        </Btn>
      ),
    },
  ]

  const thStyle: React.CSSProperties = {
    padding: '10px 16px', textAlign: 'left',
    fontSize: 10, fontWeight: 800, color: 'var(--txt-3)',
    textTransform: 'uppercase', letterSpacing: '0.8px',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap', userSelect: 'none',
  }
  const tdStyle: React.CSSProperties = {
    padding: '12px 16px', borderBottom: '1px solid var(--divider)', verticalAlign: 'middle',
  }

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* ── Page header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, flexShrink: 0, padding: '0 2px',
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(var(--accent-rgb, 50,77,255),0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb, 50,77,255),0.15)',
          }}>
            <Users size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--txt-1)', letterSpacing: '-0.3px' }}>
              User Management
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>Manage users and role-based access</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 10, padding: 3, gap: 2 }}>
            {[
              { key: 'users',  label: `Users (${users.length})` },
              { key: 'roles',  label: 'Roles & Permissions' },
            ].map(t => (
              <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} style={{
                padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: activeTab === t.key ? 'var(--surface)' : 'transparent',
                color: activeTab === t.key ? 'var(--txt-1)' : 'var(--txt-2)',
                fontWeight: activeTab === t.key ? 700 : 500, fontSize: 13,
                boxShadow: activeTab === t.key ? 'var(--shadow-md)' : 'none',
                transition: 'all var(--dur-fast)',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'roles' && (
            <Btn variant="primary" size="sm" icon={<Plus size={13} />}
              onClick={() => { setRoleForm({ code: '', name: '', description: '', permissionIds: [] }); setRoleFormErrors({}); setRoleDrawerOpen(true) }}>
              New Role
            </Btn>
          )}

          {activeTab === 'users' && (
            <Btn variant="primary" size="sm" icon={<Plus size={13} />}
              onClick={() => setEditUserId('new')}>
              Add User
            </Btn>
          )}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* ── Users tab ── */}
        {activeTab === 'users' && (
          <div style={{
            display: 'flex', height: '100%',
            background: 'var(--surface)', borderRadius: 14,
            border: '1px solid var(--border)',
            overflow: 'hidden', boxShadow: 'var(--shadow-md)',
          }}>
            {/* Sidebar */}
            <div style={{
              width: 256, flexShrink: 0,
              borderRight: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
                {/* Stats */}
                <div style={{
                  background: 'linear-gradient(135deg, var(--accent) 0%, #1a2aff 100%)',
                  borderRadius: 12, padding: '14px 16px', marginBottom: 14,
                }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                    Overview
                  </div>
                  <div style={{ display: 'flex' }}>
                    {[
                      { label: 'Total',    value: users.length },
                      { label: 'Active',   value: activeCount },
                      { label: 'Inactive', value: users.length - activeCount },
                    ].map((s, i) => (
                      <div key={s.label} style={{ flex: 1, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.2)' : undefined, paddingLeft: i > 0 ? 10 : 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 20, color: '#fff', lineHeight: 1 }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Search */}
                <div style={{ marginBottom: 12 }}>
                  <Inp placeholder="Search users…" prefix={<Search size={14} />} value={search} onChangeValue={setSearch} />
                </div>

                {/* Role filter */}
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6, padding: '0 10px' }}>
                  Filter by Role
                </div>
                <FilterPill label="All Users" count={users.length} active={roleFilter === 'all'} onClick={() => setRoleFilter('all')} />
                {roles.map(r => (
                  <FilterPill
                    key={r.code}
                    label={r.name}
                    count={roleCounts[r.code] ?? 0}
                    active={roleFilter === r.code}
                    onClick={() => setRoleFilter(r.code)}
                  />
                ))}
              </div>
            </div>

            {/* Main table */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              <div style={{
                padding: '12px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
              }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt-1)' }}>
                  {roleFilter === 'all' ? 'All Users' : (roles.find(r => r.code === roleFilter)?.name ?? roleFilter)}
                </span>
                <span style={{
                  background: 'rgba(var(--accent-rgb, 50,77,255),0.1)',
                  color: 'var(--accent)', borderRadius: 99,
                  padding: '1px 9px', fontSize: 11, fontWeight: 700,
                }}>
                  {filtered.length}
                </span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {usersLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                    <Spin tip="Loading users…" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: 60, textAlign: 'center', color: 'var(--txt-3)', fontSize: 14 }}>
                    <Users size={36} style={{ marginBottom: 10, opacity: 0.3, display: 'block', margin: '0 auto 10px' }} />
                    {search || roleFilter !== 'all' ? 'No users match your filters.' : 'No users yet.'}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['User', 'Roles', 'Status', 'Last Login', ''].map((h, i) => (
                          <th key={i} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => {
                        const selected = editUserId === u.id
                        return (
                          <tr
                            key={u.id}
                            onClick={() => setEditUserId(u.id)}
                            style={{
                              cursor: 'pointer',
                              background: selected ? 'rgba(var(--accent-rgb, 50,77,255),0.06)' : 'transparent',
                              borderLeft: `3px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                              transition: 'background var(--dur-fast)',
                            }}
                            onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--surface-2)' }}
                            onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                          >
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <UserAvatar name={u.fullName ?? u.username} size={32} />
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt-1)' }}>
                                    {u.fullName ?? u.username}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {u.roles.length === 0
                                  ? <span style={{ color: 'var(--txt-3)', fontSize: 12 }}>—</span>
                                  : u.roles.map(r => <RoleBadge key={r} code={r} />)
                                }
                              </div>
                            </td>
                            <td style={tdStyle}><StatusBadge status={u.status} /></td>
                            <td style={{ ...tdStyle, fontSize: 12, color: 'var(--txt-2)', fontVariantNumeric: 'tabular-nums' }}>
                              {u.lastLogin
                                ? new Date(u.lastLogin).toLocaleDateString()
                                : '—'}
                            </td>
                            <td style={{ ...tdStyle, width: 32 }}>
                              <ChevronRight
                                size={14}
                                color={selected ? 'var(--accent)' : 'var(--border)'}
                                style={{ transition: 'transform 0.2s', transform: selected ? 'rotate(90deg)' : 'none' }}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Edit panel */}
            {editUserId && (
              <EditPanel
                key={editUserId}
                user={selectedUser}
                isNew={isNew}
                roles={roles}
                onSave={handleSave}
                onDelete={() => selectedUser && deleteMutation.mutate(selectedUser.id)}
                onClose={() => setEditUserId(null)}
                saving={saving}
              />
            )}
          </div>
        )}

        {/* ── Roles & Permissions tab ── */}
        {activeTab === 'roles' && (
          <div style={{
            background: 'var(--surface)', borderRadius: 14,
            border: '1px solid var(--border)', overflow: 'hidden',
            boxShadow: 'var(--shadow-md)', padding: 16,
            height: '100%', boxSizing: 'border-box',
          }}>
            {rolesLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin tip="Loading roles…" /></div>
            ) : (
              <Tbl columns={roleColumns} data={rolesData ?? []} rowKey="id" loading={rolesLoading} emptyText="No roles found" />
            )}
          </div>
        )}
      </div>

      {/* ── Role Create Drawer ── */}
      <Drawer
        title="New Role"
        open={roleDrawerOpen}
        onClose={() => { setRoleDrawerOpen(false); setRoleFormErrors({}) }}
        width={480}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setRoleDrawerOpen(false)}>Cancel</Btn>
            <Btn variant="primary" loading={createRoleMutation.isPending} onClick={() => {
              if (validateRoleForm()) {
                createRoleMutation.mutate({
                  code: roleForm.code,
                  name: roleForm.name,
                  description: roleForm.description || undefined,
                  permissionIds: roleForm.permissionIds.length ? roleForm.permissionIds : undefined,
                })
              }
            }}>
              Create Role
            </Btn>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Inp label="Role Code" placeholder="e.g. ANALYST" value={roleForm.code}
            onChangeValue={v => { setRoleForm(f => ({ ...f, code: v.toUpperCase() })); setRoleFormErrors(e => ({ ...e, code: undefined })) }}
            error={roleFormErrors.code} style={{ fontFamily: 'monospace' }} />
          <Inp label="Display Name" placeholder="e.g. Data Analyst" value={roleForm.name}
            onChangeValue={v => { setRoleForm(f => ({ ...f, name: v })); setRoleFormErrors(e => ({ ...e, name: undefined })) }}
            error={roleFormErrors.name} />
          <Inp label="Description" placeholder="What can users with this role do?" value={roleForm.description}
            onChangeValue={v => setRoleForm(f => ({ ...f, description: v }))} textarea rows={3} />
          <div className="field">
            <label className="field-label">Permissions</label>
            <div style={{ marginBottom: 8 }}>
              <Inp placeholder="Search permissions…" prefix={<Search size={14} />} value={permSearch} onChangeValue={setPermSearch} />
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', maxHeight: 240, overflowY: 'auto' }}>
              {(permissionsData ?? [])
                .filter((p: Permission) =>
                  p.code.toLowerCase().includes(permSearch.toLowerCase()) ||
                  (p.description ?? '').toLowerCase().includes(permSearch.toLowerCase())
                )
                .map((p: Permission, i: number, arr: Permission[]) => {
                  const checked = roleForm.permissionIds.includes(p.id)
                  return (
                    <label key={p.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: i < arr.length - 1 ? '1px solid var(--divider)' : 'none',
                      background: checked ? 'rgba(var(--accent-rgb, 50,77,255),0.05)' : 'transparent',
                    }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setRoleForm(f => ({
                          ...f,
                          permissionIds: checked ? f.permissionIds.filter(x => x !== p.id) : [...f.permissionIds, p.id],
                        }))}
                        style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--txt-1)' }}>{p.code}</div>
                        {p.description && <div style={{ fontSize: 11, color: 'var(--txt-2)', marginTop: 1 }}>{p.description}</div>}
                      </div>
                    </label>
                  )
                })}
              {(permissionsData ?? []).length === 0 && (
                <div style={{ padding: '16px 12px', color: 'var(--txt-3)', fontSize: 13, textAlign: 'center' }}>No permissions loaded</div>
              )}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--txt-3)' }}>{roleForm.permissionIds.length} selected</div>
          </div>
        </div>
      </Drawer>

      {/* ── Permission Edit Modal ── */}
      <PermissionEditModal
        role={permEditModal}
        permissions={permissionsData ?? []}
        selected={selectedPerms}
        onSelChange={setSelectedPerms}
        onSave={() => permEditModal && updatePermsMutation.mutate({ id: permEditModal.id, perms: selectedPerms })}
        onClose={() => setPermEditModal(null)}
        loading={updatePermsMutation.isPending}
      />
    </div>
  )
}
