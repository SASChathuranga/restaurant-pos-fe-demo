import api from './axios';
import type { SystemConfig, TaxSetting } from '../types';

export const configApi = {
  get: async () => {
    const res = await api.get<{ success: boolean; data: SystemConfig }>('/config');
    return res.data.data;
  },

  getReceiptPreview: async () => {
    const res = await api.get<{
      success: boolean;
      data: {
        day: string;
        lastIssued: number;
        next: number | null;
        limit: number;
        reached: boolean;
      };
    }>('/config/receipt-preview');
    return res.data.data;
  },

  update: async (data: Partial<SystemConfig>) => {
    const res = await api.put<{ success: boolean; data: SystemConfig }>('/config', data);
    return res.data.data;
  },

  updateTax: async (taxes: TaxSetting[]) => {
    const res = await api.put<{ success: boolean; data: TaxSetting[] }>('/config/tax', { taxes });
    return res.data.data;
  },

  uploadLogo: async (logo: string) => {
    const res = await api.post('/config/logo', { logo });
    return res.data;
  },
};
