import api from './axios';
import type { KitchenOrder, KitchenDashboard, KitchenOrderStatus } from '../types';

export const kitchenApi = {
  // Get kitchen queue
  getQueue: (status?: KitchenOrderStatus) => 
    api.get<KitchenOrder[]>('/kitchen/queue', { params: status ? { status } : {} }).then(res => res.data),

  // Get kitchen dashboard with summary
  getDashboard: () => 
    api.get<KitchenDashboard>('/kitchen/dashboard').then(res => res.data),

  // Update order status
  updateStatus: (id: string, status: KitchenOrderStatus) =>
    api.patch<{ order: KitchenOrder }>(`/kitchen/${id}/status`, { status }).then(res => res.data.order),

  // Debug endpoint
  debug: () =>
    api.get('/kitchen/debug').then(res => res.data),
};
