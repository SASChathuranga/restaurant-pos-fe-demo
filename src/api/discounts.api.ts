import api from './axios';
import type { Discount, DiscountFormData } from '../types';

export const discountsApi = {
  getAll: () => api.get<Discount[]>('/discounts').then((res) => res.data),

  getById: (id: string) => api.get<{ discount: Discount }>(`/discounts/${id}`).then((res) => res.data.discount),

  create: (data: DiscountFormData) =>
    api.post<{ discount: Discount }>('/discounts', data).then((res) => res.data.discount),

  update: (id: string, data: Partial<DiscountFormData>) =>
    api.patch<{ discount: Discount }>(`/discounts/${id}`, data).then((res) => res.data.discount),

  toggle: (id: string) =>
    api.patch<{ discount: Discount }>(`/discounts/${id}/toggle`).then((res) => res.data.discount),

  delete: (id: string) => api.delete(`/discounts/${id}`).then((res) => res.data),
};
