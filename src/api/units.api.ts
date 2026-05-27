import api from './axios';
import type { Unit, UnitFormData, PaginationParams, UnitType } from '../types';

export const unitsApi = {
  getAll: async (params?: PaginationParams & { type?: UnitType; isActive?: boolean }) => {
    const res = await api.get('/units', { params });
    return { units: res.data.data || res.data.units || [] };
  },

  getById: async (id: string) => {
    const res = await api.get<{ data: Unit }>(`/units/${id}`);
    return res.data.data; // Backend returns { success, data: unit }
  },

  create: async (data: UnitFormData) => {
    const res = await api.post<{ data: Unit }>('/units', data);
    return res.data.data; // Backend returns { success, message, data: unit }
  },

  update: async (id: string, data: Partial<UnitFormData>) => {
    const res = await api.put<{ data: Unit }>(`/units/${id}`, data);
    return res.data.data; // Backend returns { success, message, data: unit }
  },

  delete: async (id: string) => {
    const res = await api.delete(`/units/${id}`);
    return res.data;
  },
};
