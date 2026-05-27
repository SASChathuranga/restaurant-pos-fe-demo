import api from './axios';
import type { DailyReport, PaymentSummary, Inventory, ProfitReport } from '../types';

export const reportsApi = {
  getDailySales: async (date?: string) => {
    const res = await api.get<DailyReport>('/reports/daily', { params: { date } });
    return res.data;
  },

  getTopProducts: async () => {
    const res = await api.get<{ name: string; qty: number }[]>('/reports/top-products');
    return res.data;
  },

  getPaymentSummary: async () => {
    const res = await api.get<PaymentSummary>('/reports/payments');
    return res.data;
  },

  getLowStock: async () => {
    const res = await api.get<Inventory[]>('/reports/low-stock');
    return res.data;
  },

  getProfitReport: async (params?: { from?: string; to?: string; orderType?: string }) => {
    const res = await api.get<ProfitReport>('/reports/profit', { params });
    return res.data;
  },
};
