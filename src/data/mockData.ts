import type { Module, RoleDefinition } from '../types'

export const MODULES: Module[] = [
  { key: 'proxy',      label: 'API Proxy',    color: '#324dff', path: '/proxy',      permission: 'PROXY:READ',       icon: '⚡', description: 'Route and manage API traffic through Kong gateway' },
  { key: 'iceengine',  label: 'IceEngine',    color: '#00b4d8', path: '/iceengine',  permission: 'ICE:API:READ',     icon: '🔷', description: 'Generate and manage Oracle database API endpoints' },
  { key: 'sms',        label: 'SMS Gateway',  color: '#10b981', path: '/sms',        permission: 'SMS:READ',         icon: '💬', description: 'Send and track SMS messages to customers and partners' },
  { key: 'partners',   label: 'Partners',     color: '#8b5cf6', path: '/partners',   permission: 'PARTNER:READ',     icon: '🤝', description: 'Manage partner onboarding, IP allowlists, and access' },
  { key: 'monitoring', label: 'Monitoring',   color: '#f59e0b', path: '/monitoring', permission: 'MONITOR:READ',     icon: '📊', description: 'Track service health, uptime, and performance metrics' },
  { key: 'governance', label: 'Governance',   color: '#ef4444', path: '/governance', permission: 'GOVERNANCE:TOKEN', icon: '🔒', description: 'Issue and revoke access tokens and feature flags' },
  { key: 'billing',    label: 'Billing',      color: '#06b6d4', path: '/billing',    permission: 'BILLING:READ',     icon: '💳', description: 'View usage billing, invoices, and payment records' },
  { key: 'reporting',  label: 'Reporting',    color: '#84cc16', path: '/reporting',  permission: 'REPORT:READ',      icon: '📋', description: 'Generate and export platform usage reports' },
]

// Placeholder roles — UserManagement will be rewritten to use the real API
export const ROLES: Record<string, RoleDefinition> = {
  ROLE_ADMIN:     { label: 'Admin',     permissions: [] },
  ROLE_IT:        { label: 'IT',        permissions: [] },
  ROLE_DEVELOPER: { label: 'Developer', permissions: [] },
  ROLE_TESTER:    { label: 'Tester',    permissions: [] },
}

// Placeholder users — UserManagement will be rewritten to use the real API
export const USERS: UserRecord[] = []

export interface UserRecord {
  id: number
  name: string
  email: string
  role: string
  status: 'active' | 'inactive'
  lastLogin: string
  avatar: string
}
