import api from './axios';
import type { User } from '../types';

export interface UserFormData {
  name: string;
  email: string;
  password?: string;
  role: string;
  branch_id: string;
  isActive?: boolean;
}

export const usersApi = {
  // Get all users
  getAll: async () => {
    const response = await api.get<{ users: User[] }>('/users');
    return response.data.users;
  },

  // Get single user
  getById: async (id: string) => {
    const response = await api.get<{ user: User }>(`/users/${id}`);
    return response.data.user;
  },

  // Create user
  create: async (data: UserFormData) => {
    const response = await api.post<{ user: User; message: string }>('/users', data);
    return response.data;
  },

  // Update user
  update: async (id: string, data: Partial<UserFormData>) => {
    const response = await api.put<{ user: User; message: string }>(`/users/${id}`, data);
    return response.data;
  },

  // Delete user
  delete: async (id: string) => {
    const response = await api.delete<{ message: string }>(`/users/${id}`);
    return response.data;
  },

  // Toggle user active status
  toggleStatus: async (id: string) => {
    const response = await api.patch<{ user: User; message: string }>(`/users/${id}/toggle-status`);
    return response.data;
  },
};
