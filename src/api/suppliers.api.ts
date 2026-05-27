import api from './axios';
import type {
  Supplier,
  SupplierFormData,
  SupplierPaymentData,
  SupplierTransaction,
  PaginationParams,
} from '../types';

export const suppliersApi = {
  getAll: async (params?: PaginationParams & { status?: string }) => {
    const res = await api.get('/suppliers', { params });
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<{ supplier: Supplier }>(`/suppliers/${id}`);
    return res.data.supplier;
  },

  create: async (data: SupplierFormData) => {
    const res = await api.post<{ supplier: Supplier }>('/suppliers', data);
    return res.data.supplier;
  },

  update: async (id: string, data: Partial<SupplierFormData>) => {
    const res = await api.put<{ supplier: Supplier }>(`/suppliers/${id}`, data);
    return res.data.supplier;
  },

  delete: async (id: string) => {
    const res = await api.delete(`/suppliers/${id}`);
    return res.data;
  },

  getLedger: async (id: string) => {
    const res = await api.get<{ transactions: SupplierTransaction[] }>(
      `/suppliers/${id}/ledger`
    );
    return res.data.transactions;
  },

  recordPayment: async (id: string, data: SupplierPaymentData) => {
    const res = await api.post(`/suppliers/${id}/payment`, data);
    return res.data;
  },
};
