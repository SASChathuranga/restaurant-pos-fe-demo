import api from './axios';
import type {
  SupplierReturn,
  SupplierReturnFormData,
  PaginationParams,
  ReturnStatus,
} from '../types';

export const returnsApi = {
  getAll: async (params?: PaginationParams & { status?: ReturnStatus; supplier_id?: string }) => {
    const res = await api.get('/returns', { params });
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<{ return: SupplierReturn }>(`/returns/${id}`);
    return res.data.return;
  },

  create: async (data: SupplierReturnFormData) => {
    const res = await api.post<{ return: SupplierReturn }>('/returns', data);
    return res.data.return;
  },

  update: async (id: string, data: Partial<SupplierReturnFormData>) => {
    const res = await api.put<{ return: SupplierReturn }>(`/returns/${id}`, data);
    return res.data.return;
  },

  delete: async (id: string) => {
    await api.delete(`/returns/${id}`);
  },

  approve: async (id: string) => {
    const res = await api.post(`/returns/${id}/approve`);
    return res.data;
  },
};
