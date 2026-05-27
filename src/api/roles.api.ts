import api from './axios';
import type { Role, Permission } from '../types';

export interface RoleFormData {
  name: string;
  description?: string;
  permissions: string[];
}

export const rolesApi = {
  // Get all roles
  getAll: async () => {
    const response = await api.get<{ roles: Role[] }>('/roles');
    return response.data.roles;
  },

  // Get single role
  getById: async (id: string) => {
    const response = await api.get<{ role: Role }>(`/roles/${id}`);
    return response.data.role;
  },

  // Create role
  create: async (data: RoleFormData) => {
    const response = await api.post<{ role: Role; message: string }>('/roles', data);
    return response.data;
  },

  // Update role
  update: async (id: string, data: Partial<RoleFormData>) => {
    const response = await api.put<{ role: Role; message: string }>(`/roles/${id}`, data);
    return response.data;
  },

  // Delete role
  delete: async (id: string) => {
    const response = await api.delete<{ message: string }>(`/roles/${id}`);
    return response.data;
  },

  // Get all permissions
  getPermissions: async () => {
    const response = await api.get<{ permissions: Permission[] }>('/roles/permissions');
    return response.data.permissions;
  },
};
