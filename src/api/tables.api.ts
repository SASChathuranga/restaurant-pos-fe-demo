import api from './axios';
import type { RestaurantTable, TableFormData, TableStatus } from '../types';

export const tablesApi = {
  // Get all tables
  getAll: () => api.get<{ tables: RestaurantTable[] }>('/tables').then(res => res.data.tables),

  // Get table by ID
  getById: (id: string) => 
    api.get<{ table: RestaurantTable }>(`/tables/${id}`).then(res => res.data.table),

  // Create a new table
  create: (data: TableFormData) => 
    api.post<{ table: RestaurantTable }>('/tables', data).then(res => res.data.table),

  // Update table (full update)
  update: (id: string, data: Partial<TableFormData>) =>
    api.put<{ table: RestaurantTable }>(`/tables/${id}`, data).then(res => res.data.table),

  // Delete table
  delete: (id: string) => api.delete(`/tables/${id}`),

  // Update table status
  updateStatus: (id: string, status: TableStatus) =>
    api.patch<{ table: RestaurantTable }>(`/tables/${id}/status`, { status }).then(res => res.data.table),

  // Close table (finalize sale)
  close: (tableId: string, paymentMethod: string) =>
    api.post(`/tables/${tableId}/close`, { paymentMethod }).then(res => res.data),
};