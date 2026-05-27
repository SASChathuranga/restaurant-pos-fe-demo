import api from './axios';
import type {
  Product,
  ProductFormData,
  PaginationParams,
} from '../types';

export const productsApi = {
  getAll: async (params?: PaginationParams & { category?: string }) => {
    const res = await api.get('/products', { params });
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<{ product: Product }>(`/products/${id}`);
    return res.data.product;
  },

  create: async (data: ProductFormData) => {
    const res = await api.post<{ product: Product }>('/products', data);
    return res.data.product;
  },

  update: async (id: string, data: Partial<ProductFormData>) => {
    const res = await api.put<{ product: Product }>(`/products/${id}`, data);
    return res.data.product;
  },

  delete: async (id: string) => {
    const res = await api.delete(`/products/${id}`);
    return res.data;
  },

  toggleAvailability: async (id: string, isAvailable: boolean) => {
    const res = await api.patch<{ product: Product }>(`/products/${id}/availability`, { isAvailable });
    return res.data.product;
  },
};
