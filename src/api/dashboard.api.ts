import api from './axios';
import type {
  DashboardSummary,
  RevenueChartPoint,
  TopProduct,
} from '../types';

export const dashboardApi = {
  getSummary: async () => {
    const res = await api.get<DashboardSummary>('/dashboard/summary');
    return res.data;
  },

  getRevenueChart: async (startDate?: string, endDate?: string) => {
    const res = await api.get<{ points: RevenueChartPoint[] }>('/dashboard/revenue-chart', {
      params: { startDate, endDate },
    });
    return res.data.points;
  },

  getTopProducts: async (limit?: number) => {
    const res = await api.get<{ topProducts: TopProduct[] }>('/dashboard/top-products', {
      params: { limit },
    });
    return res.data.topProducts;
  },

  getShiftSummary: async () => {
    const res = await api.get('/dashboard/shift-summary');
    return res.data;
  },
};
