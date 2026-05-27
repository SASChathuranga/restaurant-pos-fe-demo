import api from './axios';
import type { Shift, PaginationParams } from '../types';

export const shiftsApi = {
  // Get all shifts (history) - legacy helper
  getAll: (params?: PaginationParams & { status?: 'OPEN' | 'CLOSED' }) =>
    api.get<{ shifts: Shift[] }>('/shifts', { params }).then(res => res.data.shifts),

  // Get all shifts (history) with pagination metadata
  list: (params?: PaginationParams & { status?: 'OPEN' | 'CLOSED' }) =>
    api.get<{ page: number; limit: number; total: number; shifts: Shift[] }>('/shifts', { params }).then(res => res.data),

  // Get shift by ID
  getById: (id: string) =>
    api.get<{ shift: Shift }>(`/shifts/${id}`).then(res => res.data.shift),

  // Get current open shift
  getCurrent: () =>
    api.get<{ shift: Shift | null }>('/shifts/current').then(res => res.data.shift),

  // Open a new shift
  open: (openingCash: number) => 
    api.post<{ shift: Shift }>('/shifts/open', { openingCash }).then(res => res.data.shift),

  // Close the current shift
  close: (closingCash: number) =>
    api.post<{ shift: Shift }>('/shifts/close', { closingCash }).then(res => res.data.shift),
};
