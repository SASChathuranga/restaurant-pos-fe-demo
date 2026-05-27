import api from './axios';
import type { GRN, GRNFormData, GRNPayment, GRNPaymentMethod, PaginationParams } from '../types';

export const grnApi = {
  getAll: async (params?: PaginationParams & { status?: string; supplierId?: string }) => {
    const res = await api.get('/grn', { params });
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<{ grn: GRN }>(`/grn/${id}`);
    return res.data.grn;
  },

  create: async (data: GRNFormData) => {
    const res = await api.post<{ grn: GRN }>('/grn', data);
    return res.data.grn;
  },

  update: async (id: string, data: Partial<GRNFormData>) => {
    const res = await api.put<{ grn: GRN }>(`/grn/${id}`, data);
    return res.data.grn;
  },

  delete: async (id: string) => {
    await api.delete(`/grn/${id}`);
  },

  approve: async (id: string) => {
    const res = await api.put(`/grn/${id}/approve`);
    return res.data;
  },

  getPayments: async (id: string) => {
    const res = await api.get<{
      payments: GRNPayment[];
      totals: {
        totalAmount: number;
        paidAmount: number;
        remainingAmount: number;
        paymentStatus: string;
      };
    }>(`/grn/${id}/payments`);
    return res.data;
  },

  recordPayment: async (
    id: string,
    data: { amount: number; paymentMethod: GRNPaymentMethod; reference?: string; notes?: string }
  ) => {
    const res = await api.post(`/grn/${id}/payments`, data);
    return res.data;
  },

  getAllPayments: async (
    params?: PaginationParams & { supplierId?: string; from?: string; to?: string; grnId?: string; search?: string }
  ) => {
    const res = await api.get('/grn/payments', { params });
    return res.data;
  },
};
