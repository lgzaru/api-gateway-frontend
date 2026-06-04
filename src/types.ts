export interface User {
  id: string
  roles: string[]
  email?: string
  username?: string
  fullName?: string
}

export interface Module {
  key: string
  label: string
  color: string
  path: string
  permission: string
  icon: string
  description: string
}

export interface RoleDefinition {
  label: string
  permissions: string[]
}
