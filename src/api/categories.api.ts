import api from './axios';
import type { Category, CategoryFormData } from '../types';

export const categoriesApi = {
  getAll: async (opts?: { isActive?: boolean }) => {
    const params: Record<string, any> = {};
    if (typeof opts?.isActive === 'boolean') {
      params.isActive = opts.isActive;
    }
    const res = await api.get<{ success: boolean; data: Category[] }>('/categories', {
      params,
    });
    return res.data.data || [];
  },

  getById: async (id: string) => {
    const res = await api.get<{ success: boolean; data: Category }>(`/categories/${id}`);
    return res.data.data;
  },

  create: async (data: CategoryFormData) => {
    const res = await api.post<{ success: boolean; data: Category }>('/categories', data);
    return res.data.data;
  },

  update: async (id: string, data: Partial<CategoryFormData>) => {
    const res = await api.put<{ success: boolean; data: Category }>(`/categories/${id}`, data);
    return res.data.data;
  },

  delete: async (id: string) => {
    const res = await api.delete(`/categories/${id}`);
    return res.data;
  },
};
