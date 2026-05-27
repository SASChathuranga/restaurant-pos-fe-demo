import api from './axios';
import type {
  PurchaseOrder,
  PurchaseOrderFormData,
  PaginationParams,
  POStatus,
} from '../types';

export const purchaseOrdersApi = {
  getAll: async (params?: PaginationParams & { status?: POStatus; supplierId?: string }) => {
    const res = await api.get('/purchase-orders', { params });
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<any>(`/purchase-orders/${id}`);
    // Backend returns either { purchaseOrder } or the PO object directly (older versions)
    return (res.data?.purchaseOrder ?? res.data) as PurchaseOrder;
  },

  create: async (data: PurchaseOrderFormData) => {
    const res = await api.post<{ purchaseOrder: PurchaseOrder }>('/purchase-orders', data);
    return res.data.purchaseOrder;
  },

  update: async (id: string, data: Partial<PurchaseOrderFormData>) => {
    const res = await api.put<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${id}`, data);
    return res.data.purchaseOrder;
  },

  approve: async (id: string) => {
    const res = await api.put(`/purchase-orders/${id}/approve`);
    return res.data;
  },

  cancel: async (id: string) => {
    const res = await api.put(`/purchase-orders/${id}/cancel`);
    return res.data;
  },
};
