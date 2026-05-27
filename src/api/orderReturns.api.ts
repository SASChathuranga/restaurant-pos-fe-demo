import api from './axios';

export interface OrderReturnItem {
  product: string;
  productName: string;
  quantity: number;
  price: number;        // sale price per unit
  costPrice: number;    // COGS per unit
  refundAmount: number; // price × qty
  costAmount: number;   // costPrice × qty
  reason: string;
}

export interface OrderReturn {
  _id: string;
  returnNumber: string;
  sale_id: string | { _id: string; invoiceNumber: string; orderType: string };
  invoiceNumber: string;
  branch_id: string;
  returnType: 'INTERNAL' | 'CUSTOMER';
  items: OrderReturnItem[];
  refundAmount: number;    // total revenue reversed
  totalCostAmount: number; // total COGS impacted
  netPnlImpact: number;    // accounting loss (always ≤ 0)
  status: 'COMPLETED';
  notes?: string;
  imageUrl?: string;
  processedBy: string | { _id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderReturnData {
  sale_id: string;
  returnType: 'INTERNAL' | 'CUSTOMER';
  items: {
    product: string;
    productName: string;
    quantity: number;
    reason: string;
  }[];
  notes?: string;
}

export interface PnlSummary {
  totalRefunds: number;
  totalCostImpact: number;
  totalPnlImpact: number;
}

export const orderReturnsApi = {
  // Search completed sales by invoice ID / number
  searchSales: async (search: string) => {
    const res = await api.get('/order-returns/search-sales', { params: { search } });
    return res.data.sales as any[];
  },

  // Load a specific sale to populate return form
  getSaleForReturn: async (saleId: string) => {
    const res = await api.get(`/order-returns/sale/${saleId}`);
    return res.data.sale as any;
  },

  // Create an order return
  create: async (data: CreateOrderReturnData): Promise<OrderReturn> => {
    const res = await api.post('/order-returns', data);
    return res.data.orderReturn;
  },

  // List all order returns
  getAll: async (params?: { returnType?: string; page?: number; limit?: number }) => {
    const res = await api.get('/order-returns', { params });
    return {
      orderReturns: res.data.orderReturns as OrderReturn[],
      total:        res.data.total        as number,
      page:         res.data.page         as number,
      pnlSummary:   res.data.pnlSummary   as PnlSummary,
    };
  },

  // Get single return
  getById: async (id: string): Promise<OrderReturn> => {
    const res = await api.get(`/order-returns/${id}`);
    return res.data.orderReturn;
  },
};
