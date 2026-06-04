import client from './client'

export interface Permission {
  id: string
  code: string
  description: string
  module: string
}

export interface RoleDetail {
  id: string
  code: string
  name: string
  description: string | null
  permissions: Permission[]
  createdAt: string
}

export function listRoles() {
  return client.get<RoleDetail[]>('/roles')
}

export function getRole(id: string) {
  return client.get<RoleDetail>(`/roles/${id}`)
}

export function createRole(data: { code: string; name: string; description?: string; permissionIds?: string[] }) {
  return client.post<RoleDetail>('/roles', data)
}

export function updateRolePermissions(id: string, permissionIds: string[]) {
  return client.put<RoleDetail>(`/roles/${id}/permissions`, { permissionIds })
}

export function listPermissions() {
  return client.get<Permission[]>('/permissions')
}
