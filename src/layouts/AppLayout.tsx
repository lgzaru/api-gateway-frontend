import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Zap, Database, BookOpen, Users, MessageSquare,
  Bell, Link2, Monitor, AlertCircle, Globe, Flag, CreditCard,
  FileText, User, ClipboardList, PanelLeftClose, PanelLeftOpen,
  LogOut, Settings, Sun, Moon, ChevronRight,
  Home, Cloud, BellRing, AlertTriangle, Shield,
  Wallet, Wrench, GitBranch, PlayCircle, PackageSearch, SlidersHorizontal,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const LOGO = 'https://www.1010tech.io/wp-content/uploads/2022/07/cropped-site-image-1-270x270.png'

interface NavItem  { key: string; label: string; icon: ReactNode; perm: string | null }
interface NavGroup { group: string; icon: ReactNode; items: NavItem[] }

const NAV: NavGroup[] = [
  { group: 'Overview', icon: <Home size={13} />, items: [
    { key: '/', label: 'Dashboard', icon: <LayoutDashboard size={14} />, perm: null },
  ]},
  { group: 'API Management', icon: <Cloud size={13} />, items: [
    { key: '/proxy',        label: 'API Proxy',      icon: <Zap size={14} />,          perm: 'PROXY:READ' },
    { key: '/governance',   label: 'API Policies',   icon: <Shield size={14} />,       perm: 'GOVERNANCE:READ' },
    { key: '/partners',     label: 'Partners',       icon: <Users size={14} />,        perm: 'PARTNER:READ' },
    // TODO: re-enable when implemented
    // { key: '/iceengine',    label: 'IceEngine',      icon: <Database size={14} />,     perm: 'ICE:API:READ' },
    // { key: '/catalogue',   label: 'API Catalogue',  icon: <BookOpen size={14} />,     perm: 'CATALOGUE:READ' },
    // { key: '/versioning',  label: 'API Versioning', icon: <GitBranch size={14} />,    perm: 'VERSION:READ' },
    // { key: '/changelog',   label: 'API Changelog',  icon: <FileText size={14} />,     perm: 'CHANGELOG_READ' },
    // { key: '/testing',     label: 'API Testing',    icon: <PlayCircle size={14} />,   perm: 'TESTING:READ' },
    // { key: '/dependencies',label: 'Dependencies',   icon: <PackageSearch size={14} />,perm: 'DEPENDENCIES_READ' },
  ]},
  // TODO: re-enable Communications when implemented
  // { group: 'Communications', icon: <BellRing size={13} />, items: [
  //   { key: '/sms',           label: 'SMS Gateway',   icon: <MessageSquare size={14} />, perm: 'SMS:READ' },
  //   { key: '/notifications', label: 'Notifications', icon: <Bell size={14} />,          perm: 'NOTIFY:READ' },
  //   { key: '/webhooks',      label: 'Webhooks',      icon: <Link2 size={14} />,         perm: 'WEBHOOK:READ' },
  // ]},
  // TODO: re-enable Monitoring when implemented
  // { group: 'Monitoring', icon: <AlertTriangle size={13} />, items: [
  //   { key: '/monitoring', label: 'Monitoring',  icon: <Monitor size={14} />,      perm: 'MONITOR:READ' },
  //   { key: '/incidents',  label: 'Incidents',   icon: <AlertCircle size={14} />,  perm: 'INCIDENT:READ' },
  //   { key: '/status',     label: 'Status Page', icon: <Globe size={14} />,        perm: null },
  // ]},
  // TODO: re-enable Governance when implemented
  // { group: 'Governance', icon: <Shield size={13} />, items: [
  //   { key: '/flags',      label: 'Feature Flags', icon: <Flag size={14} />,   perm: 'FLAG:READ' },
  //   { key: '/compliance', label: 'Compliance',    icon: <Shield size={14} />, perm: 'COMPLIANCE:READ' },
  // ]},
  // TODO: re-enable Billing & Reports when implemented
  // { group: 'Billing & Reports', icon: <Wallet size={13} />, items: [
  //   { key: '/billing',   label: 'Billing',   icon: <CreditCard size={14} />, perm: 'BILLING:READ' },
  //   { key: '/reporting', label: 'Reporting', icon: <FileText size={14} />,   perm: 'REPORT:READ' },
  // ]},
  { group: 'Administration', icon: <Wrench size={13} />, items: [
    { key: '/users',            label: 'Users & Roles',      icon: <User size={14} />,                perm: 'USER:READ' },
    { key: '/audit',            label: 'Audit Log',          icon: <ClipboardList size={14} />,       perm: 'AUDIT:READ' },
    { key: '/approvals',        label: 'Approvals',          icon: <Shield size={14} />,              perm: 'USER:WRITE' },
    { key: '/platform-settings',label: 'Platform Settings',  icon: <SlidersHorizontal size={14} />,   perm: 'ADMIN:READ' },
  ]},
]

function getActiveGroup(path: string) {
  return NAV.find(g => g.items.some(i =>
    i.key === '/' ? path === '/' : path.startsWith(i.key)
  ))?.group ?? 'Overview'
}

// ── NavLink ────────────────────────────────────────────────────────────────────

function NavLink({ item, active, collapsed, onClick }: {
  item: NavItem; active: boolean; collapsed: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  const { isDark } = useTheme()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={collapsed ? item.label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 34,
        padding: collapsed ? 0 : '0 10px 0 12px',
        margin: '1px 6px',
        borderRadius: 7,
        cursor: 'pointer',
        background: active
          ? (isDark ? 'rgba(50,77,255,0.16)' : 'rgba(50,77,255,0.08)')
          : hov
            ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)')
            : 'transparent',
        boxShadow: active ? 'inset 2px 0 0 var(--nav-accent)' : 'none',
        transition: 'background 0.12s, box-shadow 0.12s',
        justifyContent: collapsed ? 'center' : undefined,
        userSelect: 'none',
        outline: 'none',
      }}
    >
      <span style={{
        color: active ? 'var(--nav-accent)' : hov ? 'var(--txt-2)' : 'var(--txt-3)',
        display: 'flex', flexShrink: 0, transition: 'color 0.12s',
      }}>
        {item.icon}
      </span>
      {!collapsed && (
        <span style={{
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          color: active ? 'var(--txt-1)' : hov ? 'var(--txt-1)' : 'var(--txt-2)',
          whiteSpace: 'nowrap',
          transition: 'color 0.12s',
          letterSpacing: '-0.1px',
        }}>
          {item.label}
        </span>
      )}
    </div>
  )
}

// ── GroupHeader ────────────────────────────────────────────────────────────────

function GroupHeader({ group, icon, isExpanded, hasActive, onClick }: {
  group: string; icon: ReactNode; isExpanded: boolean; hasActive: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '8px 14px 4px',
        cursor: 'pointer', userSelect: 'none', outline: 'none',
      }}
    >
      <span style={{
        color: hasActive ? 'var(--nav-accent)' : hov ? 'var(--txt-2)' : 'var(--txt-3)',
        display: 'flex', flexShrink: 0, transition: 'color 0.12s',
      }}>
        {icon}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 700,
        color: hasActive || hov ? 'var(--txt-1)' : 'var(--txt-2)',
        letterSpacing: '0.1px', flex: 1, transition: 'color 0.12s',
        textTransform: 'uppercase',
      }}>
        {group}
      </span>
      {hasActive && (
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'var(--nav-accent)', boxShadow: '0 0 6px var(--nav-accent)',
          flexShrink: 0,
        }} />
      )}
      <ChevronRight
        size={10}
        style={{
          color: 'var(--txt-3)',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)',
          transition: 'transform 0.2s ease',
          opacity: hov ? 1 : 0.5,
        }}
      />
    </div>
  )
}

// ── UserMenu ──────────────────────────────────────────────────────────────────

function UserMenu({ displayName, email, initials, onLogout, onSettings, collapsed, onExpand }: {
  displayName: string; email: string; initials: string
  onLogout: () => void; onSettings: () => void
  collapsed?: boolean; onExpand?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [popupPos, setPopupPos] = useState({ bottom: 0, left: 0 })
  const avatarRef = useRef<HTMLDivElement>(null)

  function handleAvatarClick() {
    if (collapsed) { onExpand?.(); return }
    if (avatarRef.current) {
      const r = avatarRef.current.getBoundingClientRect()
      setPopupPos({ bottom: window.innerHeight - r.top + 8, left: r.left })
    }
    setOpen(v => !v)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={avatarRef}
        onClick={handleAvatarClick}
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'linear-gradient(135deg, #3a56ff, #818cf8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
          fontSize: 12, fontWeight: 700, color: '#fff',
          boxShadow: '0 0 0 2px var(--accent-ring)',
          letterSpacing: '-0.5px',
          userSelect: 'none',
        }}
      >
        {initials}
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', bottom: popupPos.bottom, left: popupPos.left,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-md)',
            minWidth: 180, zIndex: 101, overflow: 'hidden',
            animation: 'scale-in 0.15s var(--ease-snappy) both',
          }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-1)', marginBottom: 2 }}>{displayName}</div>
              <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>{email}</div>
            </div>
            {[
              { icon: <Settings size={13} />, label: 'Profile', onClick: onSettings },
              { icon: <LogOut size={13} />,   label: 'Sign out', onClick: onLogout, danger: true },
            ].map(item => (
              <div
                key={item.label}
                onClick={() => { setOpen(false); item.onClick() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 14px', cursor: 'pointer', fontSize: 13,
                  color: item.danger ? 'var(--red)' : 'var(--txt-1)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                {item.icon} {item.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── AppLayout ─────────────────────────────────────────────────────────────────

export default function AppLayout() {
  const { user, logout, can, isAdmin } = useAuth()
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const [collapsed, setCollapsed]       = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set([getActiveGroup(location.pathname)])
  )

  useEffect(() => {
    setExpandedGroups(prev => new Set([...prev, getActiveGroup(location.pathname)]))
  }, [location.pathname])

  const allItems  = NAV.flatMap(g => g.items)
  const activeKey = location.pathname === '/'
    ? '/'
    : allItems.find(i => i.key !== '/' && location.pathname.startsWith(i.key))?.key ?? '/'
  const pageTitle = location.pathname === '/'
    ? 'Dashboard'
    : allItems.find(i => i.key !== '/' && location.pathname.startsWith(i.key))?.label ?? ''

  const toggleGroup = (group: string) =>
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(group) ? next.delete(group) : next.add(group)
      return next
    })

  const displayName = user?.fullName ?? user?.username ?? user?.email ?? 'User'
  const userEmail   = user?.email ?? ''
  const initials    = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'U'

  const sidebarBg = isDark ? '#0b1022' : '#ffffff'
  const headerBg  = isDark ? '#0b1022' : '#ffffff'
  const contentBg = isDark ? '#060a14' : '#f3f5fb'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{
        width: collapsed ? 56 : 220,
        flexShrink: 0,
        background: sidebarBg,
        borderRight: '1px solid var(--border)',
        position: 'sticky', top: 0, height: '100vh',
        overflow: 'hidden',
        transition: 'width 0.22s var(--ease-snappy)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Accent strip */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, zIndex: 1,
          background: `linear-gradient(180deg, var(--nav-accent) 0%, rgba(129,140,248,0.4) 50%, transparent 100%)`,
          opacity: isDark ? 0.7 : 0.4, pointerEvents: 'none',
        }} />

        {/* Logo bar */}
        <div style={{
          height: 54, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 13px' : '0 12px 0 14px',
          borderBottom: '1px solid var(--border)',
          justifyContent: collapsed ? 'center' : 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, overflow: 'hidden' }}>
            <img src={LOGO} alt="1010 Tech" style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, objectFit: 'contain' }} />
            {!collapsed && (
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt-1)', whiteSpace: 'nowrap', letterSpacing: '-0.3px' }}>
                TAG
              </span>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 4, borderRadius: 6 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--txt-1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--txt-3)' }}
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>

        {/* Nav scroll */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 6, paddingBottom: 6 }}>
          {collapsed && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 4px' }}>
              <button
                onClick={() => setCollapsed(false)}
                title="Expand sidebar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 5, borderRadius: 6 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--txt-1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--txt-3)' }}
              >
                <PanelLeftOpen size={15} />
              </button>
            </div>
          )}

          {NAV.flatMap(({ group, icon, items }, gi) => {
            const visible = items.filter(i => i.perm === null || isAdmin || can(i.perm))
            if (!visible.length) return []

            const hasActive = visible.some(i =>
              i.key === '/' ? location.pathname === '/' : location.pathname.startsWith(i.key)
            )

            if (collapsed) {
              return [
                gi > 0 && (
                  <div key={`sep-${group}`} style={{ height: 1, margin: '4px 10px', background: 'var(--divider)' }} />
                ),
                ...visible.map(item => (
                  <NavLink key={item.key} item={item} active={activeKey === item.key} collapsed onClick={() => navigate(item.key)} />
                )),
              ].filter(Boolean)
            }

            const isExpanded = expandedGroups.has(group)

            return [
              gi > 0 && (
                <div key={`div-${group}`} style={{ height: 1, margin: '3px 14px', background: 'var(--divider)' }} />
              ),
              <GroupHeader
                key={`grp-${group}`}
                group={group}
                icon={icon}
                isExpanded={isExpanded}
                hasActive={hasActive}
                onClick={() => toggleGroup(group)}
              />,
              <div
                key={`items-${group}`}
                style={{
                  overflow: 'hidden',
                  maxHeight: isExpanded ? `${visible.length * 36}px` : '0',
                  transition: 'max-height 0.22s ease',
                }}
              >
                {visible.map(item => (
                  <NavLink key={item.key} item={item} active={activeKey === item.key} collapsed={false} onClick={() => navigate(item.key)} />
                ))}
              </div>,
            ]
          })}
        </div>

        {/* User card */}
        <div style={{
          flexShrink: 0, borderTop: '1px solid var(--border)',
          padding: collapsed ? '10px 0' : '10px 12px',
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : undefined, gap: 10,
        }}>
          <UserMenu
            displayName={displayName}
            email={userEmail}
            initials={initials}
            onLogout={() => logout().then(() => navigate('/login'))}
            onSettings={() => {}}
            collapsed={collapsed}
            onExpand={() => setCollapsed(false)}
          />
          {!collapsed && (
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: 'var(--txt-1)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: 1.3, letterSpacing: '-0.1px',
              }}>
                {displayName}
              </div>
              <div style={{
                fontSize: 11, color: 'var(--txt-3)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1,
              }}>
                {userEmail}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: contentBg }}>

        {/* Topbar */}
        <header style={{
          height: 54, background: headerBg,
          borderBottom: '1px solid var(--border)',
          padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 10,
          flexShrink: 0,
        }}>
          <span style={{ color: 'var(--txt-2)', fontSize: 14, fontWeight: 500, letterSpacing: '-0.1px' }}>
            {pageTitle}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={toggle}
              title={isDark ? 'Light mode' : 'Dark mode'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--txt-3)', display: 'flex',
                padding: '6px 8px', borderRadius: 8,
                transition: 'color 0.12s, background 0.12s', fontSize: 16,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--txt-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--txt-3)' }}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--txt-3)', display: 'flex',
                padding: '6px 8px', borderRadius: 8,
                transition: 'color 0.12s, background 0.12s', fontSize: 16,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--txt-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--txt-3)' }}
            >
              <Bell size={16} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '20px 24px 24px', background: contentBg, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
