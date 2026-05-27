import api from "./axios";
import type { Sale, SaleFilters, Invoice, RefundData, PaymentData, CloseSaleData } from "../types";

// List all sales with filters
export const getSales = async (filters?: SaleFilters) => {
  const params = new URLSearchParams();
  if (filters?.page) params.append('page', filters.page.toString());
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.status) params.append('status', filters.status);
  if (filters?.orderType) params.append('orderType', filters.orderType);
  if (filters?.from) params.append('from', filters.from);
  if (filters?.to) params.append('to', filters.to);

  const res = await api.get(`/sales?${params.toString()}`);
  return {
    sales: res.data.sales as Sale[],
    total: res.data.total as number,
    page: res.data.page as number,
    limit: res.data.limit as number,
  };
};

// Get single sale by ID
export const getSaleById = async (id: string): Promise<Sale> => {
  const res = await api.get(`/sales/${id}`);
  return res.data.sale;
};

// Create a new sale
export const createSale = async (data: any) => {
  const res = await api.post("/sales", data);
  return res.data.sale;
};

// Void/cancel a sale
export const voidSale = async (id: string, reason: string): Promise<void> => {
  await api.post(`/sales/void/${id}`, { reason });
};

// Get invoice data for a sale
export const getInvoice = async (id: string): Promise<Invoice> => {
  const res = await api.get(`/sales/${id}/invoice`);
  return res.data.invoice;
};

// Process a refund for a sale
export const refundSale = async (id: string, data: RefundData): Promise<void> => {
  await api.post(`/sales/${id}/refund`, data);
};

// Complete payment for a sale
export const paySale = async (id: string, data: PaymentData): Promise<Sale> => {
  const res = await api.post(`/sales/${id}/pay`, data);
  return res.data.sale;
};

// Close table sale
export const closeTableSale = async (tableId: string, data: CloseSaleData): Promise<Sale> => {
  const res = await api.post(`/sales/${tableId}/close`, data);
  return res.data.sale;
};

// Sales API object
export const salesApi = {
  getAll: async () => {
    const res = await api.get('/sales');
    return res.data.sales as Sale[];
  },
  getSales,
  getById: getSaleById,
  create: createSale,
  void: voidSale,
  getInvoice,
  refund: refundSale,
  pay: paySale,
  closeTable: closeTableSale,
};