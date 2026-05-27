import api from './axios';
import type { Inventory, InventoryAdjustment } from '../types';

export const inventoryApi = {
  getAll: async () => {
    const res = await api.get<{ inventory: Inventory[] }>('/inventory');
    return res.data.inventory || [];
  },

  adjust: async (data: InventoryAdjustment) => {
    const res = await api.post('/inventory/adjust', data);
    return res.data;
  },

  fix: async () => {
    const res = await api.post('/inventory/fix');
    return res.data;
  },

  cleanup: async () => {
    const res = await api.post('/inventory/cleanup');
    return res.data;
  },
};
