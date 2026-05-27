import api from './axios';
import type {
  Batch,
  ExpiryDashboard,
  PaginationParams,
  BatchStatus,
  AlertStatus,
} from '../types';

export interface CreateBatchData {
  batchNumber: string;
  product_id: string;
  quantity: number;
  costPerUnit: number;
  expiryDate: string;
  manufactureDate?: string;
}

export const batchesApi = {
  getAll: async (
    params?: PaginationParams & { status?: BatchStatus; alertStatus?: AlertStatus }
  ) => {
    const res = await api.get('/batches', { params });
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get(`/batches/${id}`);
    return res.data.data || res.data.batch;
  },

  create: async (data: CreateBatchData) => {
    const res = await api.post('/batches', data);
    return res.data.data || res.data.batch;
  },

  delete: async (id: string) => {
    await api.delete(`/batches/${id}`);
  },

  getNearExpiry: async (days?: number) => {
    const res = await api.get<{ batches: Batch[] }>('/batches/alerts/near-expiry', {
      params: { days },
    });
    return res.data.batches;
  },

  getExpired: async () => {
    const res = await api.get<{ batches: Batch[] }>('/batches/alerts/expired');
    return res.data.batches;
  },

  getExpiryDashboard: async () => {
    const res = await api.get<ExpiryDashboard>('/batches/dashboard/expiry');
    return res.data;
  },

  toggleBlock: async (id: string) => {
    const res = await api.post(`/batches/${id}/toggle-block`);
    return res.data;
  },

  updateQuantity: async (id: string, quantity: number) => {
    const res = await api.put(`/batches/${id}/quantity`, { quantity });
    return res.data;
  },
};
