import api from './axios';
import type {
  LoyaltyAccount,
  LoyaltyTransaction,
  WalletTransaction,
  RedeemPointsData,
  WalletTopupData,
  WalletPaymentData,
} from '../types';

export const loyaltyApi = {
  getAccount: async (customerId: string) => {
    const res = await api.get<{ success: boolean; data: LoyaltyAccount }>(`/loyalty/${customerId}`);
    return res.data.data;
  },

  earnPoints: async (customerId: string, saleAmount: number, saleId?: string) => {
    const res = await api.post('/loyalty/earn', {
      customerId,
      saleAmount,
      sale_id: saleId,
    });
    return res.data;
  },

  redeemPoints: async (data: RedeemPointsData) => {
    const res = await api.post('/loyalty/redeem', data);
    return res.data;
  },

  getPointsHistory: async (customerId: string) => {
    const res = await api.get<{ success: boolean; data: LoyaltyTransaction[] }>(
      `/loyalty/${customerId}/points-history`
    );
    return res.data.data || [];
  },

  walletTopup: async (data: WalletTopupData) => {
    const res = await api.post('/loyalty/wallet/topup', data);
    return res.data;
  },

  walletPayment: async (data: WalletPaymentData) => {
    const res = await api.post('/loyalty/wallet/payment', data);
    return res.data;
  },

  getWalletHistory: async (customerId: string) => {
    const res = await api.get<{ success: boolean; data: WalletTransaction[] }>(
      `/loyalty/${customerId}/wallet-history`
    );
    return res.data.data || [];
  },
};
