import { useEffect, useMemo, useState } from 'react';
import { Layout, PageHeader, PageContent, Card, Button, Badge, PageLoader, Table } from '../components';
import { 
  productsApi, 
  salesApi, 
  customersApi, 
  suppliersApi, 
  purchaseOrdersApi, 
  grnApi, 
  batchesApi,
  tablesApi,
  reservationsApi,
  reportsApi,
  orderReturnsApi
} from '../api';
import type { OrderReturn } from '../api/orderReturns.api';
import type { 
  Product, 
  Sale, 
  Customer, 
  Supplier, 
  PurchaseOrder, 
  GRN, 
  Batch,
  RestaurantTable,
  Reservation,
  ProfitReport,
  ProfitReportDay
} from '../types';
import notify from '../utils/notify';
import { formatMoney } from '../money';

type ReportSection = 
  | 'products' 
  | 'sales' 
  | 'profit'
  | 'customers' 
  | 'suppliers' 
  | 'purchase-orders' 
  | 'grn' 
  | 'batches'
  | 'tables'
  | 'kitchens'
  | 'reservations';

export default function ComprehensiveReportsPage() {
  const [activeSection, setActiveSection] = useState<ReportSection>('sales');
  const [loading, setLoading] = useState(false);

  // Global date range filter (applies to sections with dates)
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Data states
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [profitReport, setProfitReport] = useState<ProfitReport | null>(null);
  const [orderReturns, setOrderReturns] = useState<OrderReturn[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);

  const parseDateValue = (value: string | Date | null | undefined): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = trimmed.length === 10 ? new Date(`${trimmed}T00:00:00`) : new Date(trimmed);
    return isNaN(date.getTime()) ? null : date;
  };

  const filterByDateRange = <T,>(data: T[], getDate: (item: T) => string | Date | null | undefined) => {
    const from = filterFrom ? new Date(`${filterFrom}T00:00:00`) : null;
    const to = filterTo ? new Date(`${filterTo}T23:59:59`) : null;
    if (!from && !to) return data;

    const fromMs = from ? from.getTime() : Number.NEGATIVE_INFINITY;
    const toMs = to ? to.getTime() : Number.POSITIVE_INFINITY;

    return data.filter((item) => {
      const date = parseDateValue(getDate(item));
      if (!date) return true; // if no date field, don't exclude
      const ms = date.getTime();
      return ms >= fromMs && ms <= toMs;
    });
  };

  const filteredSales = useMemo(
    () => filterByDateRange(sales, (s) => (s as any).createdAt),
    [sales, filterFrom, filterTo]
  );
  const filteredProducts = useMemo(
    () => filterByDateRange(products, (p) => (p as any).createdAt),
    [products, filterFrom, filterTo]
  );
  const filteredCustomers = useMemo(
    () => filterByDateRange(customers, (c) => (c as any).createdAt),
    [customers, filterFrom, filterTo]
  );
  const filteredSuppliers = useMemo(
    () => filterByDateRange(suppliers, (s) => (s as any).createdAt),
    [suppliers, filterFrom, filterTo]
  );
  const filteredPurchaseOrders = useMemo(
    () => filterByDateRange(purchaseOrders, (po) => (po as any).orderDate ?? (po as any).createdAt),
    [purchaseOrders, filterFrom, filterTo]
  );
  const filteredGrns = useMemo(
    () => filterByDateRange(grns, (g) => (g as any).receivedDate ?? (g as any).createdAt),
    [grns, filterFrom, filterTo]
  );
  const filteredBatches = useMemo(
    () => filterByDateRange(batches, (b) => (b as any).createdAt ?? (b as any).expiryDate),
    [batches, filterFrom, filterTo]
  );
  const filteredTables = useMemo(
    () => filterByDateRange(tables, (t) => (t as any).createdAt),
    [tables, filterFrom, filterTo]
  );
  const filteredReservations = useMemo(
    () => filterByDateRange(reservations, (r) => (r as any).reservationDateTime),
    [reservations, filterFrom, filterTo]
  );

  const filteredProfitDays = useMemo(() => {
    const days = profitReport?.days || [];
    return filterByDateRange(days, (d) => d.date);
  }, [profitReport, filterFrom, filterTo]);

  const returnsByDate = useMemo(() => {
    const map = new Map<string, { customerRefund: number; customerCost: number; internalCost: number }>();
    (orderReturns || []).forEach((r) => {
      const dateKey = r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '';
      if (!dateKey) return;
      const entry = map.get(dateKey) || { customerRefund: 0, customerCost: 0, internalCost: 0 };
      const refund = typeof r.refundAmount === 'number' ? r.refundAmount : 0;
      const cost = typeof r.totalCostAmount === 'number' ? r.totalCostAmount : 0;
      if (r.returnType === 'CUSTOMER') {
        entry.customerRefund += refund;
        entry.customerCost += cost;
      } else {
        entry.internalCost += cost;
      }
      map.set(dateKey, entry);
    });
    return map;
  }, [orderReturns]);

  const filteredProfitDaysAdjusted: ProfitReportDay[] = useMemo(() => {
    const baseDays = filteredProfitDays || [];
    const dayByDate = new Map<string, ProfitReportDay>();
    baseDays.forEach((d) => dayByDate.set(d.date, d));

    const dates = new Set<string>();
    baseDays.forEach((d) => dates.add(d.date));
    returnsByDate.forEach((_v, k) => dates.add(k));

    const sortedDates = Array.from(dates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return sortedDates.map((date) => {
      const base: ProfitReportDay =
        dayByDate.get(date) ||
        ({
          date,
          totalOrders: 0,
          grossSales: 0,
          discount: 0,
          netSales: 0,
          totalCost: 0,
          profit: 0,
        } as ProfitReportDay);

      const r = returnsByDate.get(date);
      if (!r) return base;

      const adjustedNetSales = (base.netSales || 0) - r.customerRefund;
      const adjustedCost = (base.totalCost || 0) - r.customerCost + r.internalCost;
      const adjustedProfit = adjustedNetSales - adjustedCost;

      return {
        ...base,
        netSales: adjustedNetSales,
        totalCost: adjustedCost,
        profit: adjustedProfit,
      };
    });
  }, [filteredProfitDays, returnsByDate]);

  const profitTotals = useMemo(() => {
    return filteredProfitDaysAdjusted.reduce(
      (acc, d) => {
        acc.totalOrders += d.totalOrders || 0;
        acc.grossSales += d.grossSales || 0;
        acc.discount += d.discount || 0;
        acc.netSales += d.netSales || 0;
        acc.totalCost += d.totalCost || 0;
        acc.profit += d.profit || 0;
        return acc;
      },
      {
        totalOrders: 0,
        grossSales: 0,
        discount: 0,
        netSales: 0,
        totalCost: 0,
        profit: 0,
      }
    );
  }, [filteredProfitDaysAdjusted]);

  const returnsTotals = useMemo(() => {
    return (orderReturns || []).reduce(
      (acc, r) => {
        const refund = typeof r.refundAmount === 'number' ? r.refundAmount : 0;
        const cost = typeof r.totalCostAmount === 'number' ? r.totalCostAmount : 0;
        const net = typeof r.netPnlImpact === 'number'
          ? r.netPnlImpact
          : (r.returnType === 'CUSTOMER' ? -Math.max(0, refund - cost) : -cost);

        if (r.returnType === 'CUSTOMER') {
          acc.customerRefund += refund;
          acc.customerCostRecovered += cost;
        } else {
          acc.internalCostWastage += cost;
        }

        acc.netReturnImpact += net;
        acc.count += 1;
        return acc;
      },
      {
        count: 0,
        customerRefund: 0,
        customerCostRecovered: 0,
        internalCostWastage: 0,
        netReturnImpact: 0,
      }
    );
  }, [orderReturns]);

  const isInRange = (iso: string, from: string, to: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    const fromD = from ? new Date(`${from}T00:00:00`) : null;
    const toD = to ? new Date(`${to}T23:59:59`) : null;
    const ms = d.getTime();
    if (fromD && ms < fromD.getTime()) return false;
    if (toD && ms > toD.getTime()) return false;
    return true;
  };

  const loadOrderReturnsForRange = async () => {
    setReturnsLoading(true);
    try {
      const from = filterFrom;
      const to = filterTo;
      const limit = 200;
      let page = 1;
      let total = Number.POSITIVE_INFINITY;
      const all: OrderReturn[] = [];
      while (all.length < total) {
        const res = await orderReturnsApi.getAll({ page, limit } as any);
        const batch = res.orderReturns || [];
        total = typeof res.total === 'number' ? res.total : all.length + batch.length;
        all.push(...batch);
        if (batch.length === 0) break;
        page += 1;
        if (page > 50) break;
      }

      // If no filters are set, keep all returns; otherwise, filter by range
      const filtered = !from && !to ? all : all.filter((r) => r?.createdAt && isInRange(r.createdAt, from, to));
      setOrderReturns(filtered);
    } catch (error) {
      console.error('Failed to load order returns:', error);
      setOrderReturns([]);
    } finally {
      setReturnsLoading(false);
    }
  };

  const loadSectionData = async (section: ReportSection) => {
    setLoading(true);
    try {
      switch (section) {
        case 'products':
          const productsData = await productsApi.getAll();
          const productsArray = productsData?.products || productsData?.data || productsData || [];
          setProducts(Array.isArray(productsArray) ? productsArray : []);
          break;
        case 'sales':
          const salesData = await salesApi.getAll();
          const salesArray = Array.isArray(salesData) ? salesData : (salesData as any)?.sales || [];
          setSales(Array.isArray(salesArray) ? salesArray : []);
          break;
        case 'profit':
          const profitData = await reportsApi.getProfitReport({
            from: filterFrom || undefined,
            to: filterTo || undefined,
          });
          setProfitReport(profitData || null);
          await loadOrderReturnsForRange();
          break;
        case 'customers':
          const customersData = await customersApi.getAll();
          const customersArray = customersData?.customers || customersData?.data || customersData || [];
          setCustomers(Array.isArray(customersArray) ? customersArray : []);
          break;
        case 'suppliers':
          const suppliersData = await suppliersApi.getAll();
          const suppliersArray = suppliersData?.suppliers || suppliersData?.data || suppliersData || [];
          setSuppliers(Array.isArray(suppliersArray) ? suppliersArray : []);
          break;
        case 'purchase-orders':
          const poData = await purchaseOrdersApi.getAll();
          const poArray = poData?.purchaseOrders || poData?.data || poData || [];
          setPurchaseOrders(Array.isArray(poArray) ? poArray : []);
          break;
        case 'grn':
          const grnData = await grnApi.getAll();
          const grnArray = grnData?.grns || grnData?.data || grnData || [];
          setGrns(Array.isArray(grnArray) ? grnArray : []);
          break;
        case 'batches':
          const batchData = await batchesApi.getAll();
          const batchArray = batchData?.batches || batchData?.data || batchData || [];
          setBatches(Array.isArray(batchArray) ? batchArray : []);
          break;
        case 'tables':
          const tablesData = await tablesApi.getAll();
          const tablesArray = Array.isArray(tablesData) ? tablesData : [];
          setTables(Array.isArray(tablesArray) ? tablesArray : []);
          break;
        case 'reservations':
          const reservationsData = await reservationsApi.getAll();
          const reservationsArray = Array.isArray(reservationsData) ? reservationsData : [];
          setReservations(Array.isArray(reservationsArray) ? reservationsArray : []);
          break;
      }
    } catch (error: any) {
      notify.error(error?.response?.data?.message || `Failed to load ${section}`);
      // Set empty arrays on error
      switch (section) {
        case 'products': setProducts([]); break;
        case 'sales': setSales([]); break;
        case 'profit': setProfitReport(null); break;
        case 'customers': setCustomers([]); break;
        case 'suppliers': setSuppliers([]); break;
        case 'purchase-orders': setPurchaseOrders([]); break;
        case 'grn': setGrns([]); break;
        case 'batches': setBatches([]); break;
        case 'tables': setTables([]); break;
        case 'reservations': setReservations([]); break;
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSectionData(activeSection);
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'profit') {
      loadSectionData('profit');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFrom, filterTo]);

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      notify.error('No data to export');
      return;
    }
    
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header];
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value).replace(/,/g, ';');
        }
        return value;
      }).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    notify.success(`Exported ${data.length} records`);
  };

  const exportToPDF = () => {
    // Get current section data
    const getSectionData = () => {
      switch (activeSection) {
        case 'products': return { title: 'Products Report', data: filteredProducts, columns: ['Name', 'SKU', 'Price', 'Cost', 'Category', 'Unit', 'Status'] };
        case 'sales': return { title: 'Sales Report', data: filteredSales, columns: ['Invoice', 'Customer', 'Total', 'Profit', 'Payment', 'Status', 'Date'] };
        case 'profit': return { title: 'Profit Report', data: filteredProfitDaysAdjusted, columns: ['Date', 'Orders', 'Gross Sales', 'Discount', 'Net Sales', 'Cost', 'Profit'] };
        case 'customers': return { title: 'Customers Report', data: filteredCustomers, columns: ['Name', 'Phone', 'Email', 'Address', 'Loyalty Points'] };
        case 'suppliers': return { title: 'Suppliers Report', data: filteredSuppliers, columns: ['Name', 'Contact', 'Email', 'Phone', 'Address'] };
        case 'purchase-orders': return { title: 'Purchase Orders Report', data: filteredPurchaseOrders, columns: ['PO Number', 'Supplier', 'Total', 'Status', 'Date'] };
        case 'grn': return { title: 'GRN Report', data: filteredGrns, columns: ['GRN Number', 'PO Reference', 'Supplier', 'Status', 'Date'] };
        case 'batches': return { title: 'Batches Report', data: filteredBatches, columns: ['Batch Number', 'Product', 'Quantity', 'Expiry Date', 'Status'] };
        case 'tables': return { title: 'Tables Report', data: filteredTables, columns: ['Table Number', 'Capacity', 'Location', 'Status'] };
        case 'reservations': return { title: 'Reservations Report', data: filteredReservations, columns: ['Customer', 'Table', 'Guests', 'Date/Time', 'Status'] };
        default: return { title: 'Report', data: [], columns: [] };
      }
    };

    const { title, data, columns } = getSectionData();
    
    if (!data || data.length === 0) {
      notify.error('No data to export');
      return;
    }

    // Helper function to get cell value
    const getCellValue = (item: any, colIndex: number): string => {
      const section = activeSection;
      try {
        if (section === 'products') {
          const vals = [
            item.name, 
            item.sku, 
            formatMoney(item.price), 
            formatMoney(item.cost),
            item.category?.name || '-', 
            item.unit?.name || '-', 
            item.isActive ? 'Active' : 'Inactive'
          ];
          return vals[colIndex] || '-';
        }
        if (section === 'sales') {
          // Calculate profit for this sale
          const itemCost = (item.items || []).reduce((sum: number, saleItem: any) => {
            const product = typeof saleItem.product === 'object' ? saleItem.product : null;
            const cost = product?.cost || 0;
            return sum + (cost * saleItem.quantity);
          }, 0);
          const profit = (item.grandTotal || 0) - itemCost;
          
          const vals = [
            item.invoiceNumber, 
            item.customer?.name || 'Walk-in', 
            formatMoney(item.grandTotal),
            formatMoney(profit),
            item.paymentMethod, 
            item.status, 
            new Date(item.createdAt).toLocaleDateString()
          ];
          return vals[colIndex] || '-';
        }
        if (section === 'profit') {
          const vals = [
            item.date,
            String(item.totalOrders ?? 0),
            formatMoney(item.grossSales),
            formatMoney(item.discount),
            formatMoney(item.netSales),
            formatMoney(item.totalCost),
            formatMoney(item.profit),
          ];
          return vals[colIndex] || '-';
        }
        if (section === 'customers') {
          const vals = [item.name, item.phone, item.email || '-', item.address || '-', String(item.loyaltyPoints || 0)];
          return vals[colIndex] || '-';
        }
        if (section === 'suppliers') {
          const vals = [item.name, item.contactPerson || '-', item.email || '-', item.phone || '-', item.address || '-'];
          return vals[colIndex] || '-';
        }
        if (section === 'purchase-orders') {
          const vals = [item.poNumber, item.supplier?.name || '-', formatMoney(item.totalAmount), item.status, new Date(item.createdAt).toLocaleDateString()];
          return vals[colIndex] || '-';
        }
        if (section === 'grn') {
          const vals = [item.grnNumber, item.purchaseOrder?.poNumber || '-', item.supplier?.name || '-', item.status, new Date(item.createdAt).toLocaleDateString()];
          return vals[colIndex] || '-';
        }
        if (section === 'batches') {
          const vals = [item.batchNumber, item.product?.name || '-', String(item.quantity || 0), item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-', item.status || '-'];
          return vals[colIndex] || '-';
        }
        if (section === 'tables') {
          const vals = [item.tableNumber, String(item.capacity || 0), item.location || '-', item.status];
          return vals[colIndex] || '-';
        }
        if (section === 'reservations') {
          const vals = [item.customerName, typeof item.table === 'object' ? item.table.tableNumber : '-', String(item.guestCount || 0), new Date(item.reservationDateTime).toLocaleString(), item.status];
          return vals[colIndex] || '-';
        }
        return '-';
      } catch {
        return '-';
      }
    };
    
    // Calculate stats based on section
    const getStats = () => {
      if (activeSection === 'sales') {
        const revenue = data.reduce((sum: number, s: any) => sum + (s.grandTotal || 0), 0);
        const cost = data.reduce((sum: number, s: any) => {
          return sum + (s.items || []).reduce((itemSum: number, item: any) => {
            const product = typeof item.product === 'object' ? item.product : null;
            const itemCost = product?.cost || 0;
            return itemSum + (itemCost * item.quantity);
          }, 0);
        }, 0);
        const profit = revenue - cost;
        return `
          <div class="stat-box">
            <div class="stat-value">${data.length}</div>
            <div class="stat-label">Total Sales</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${formatMoney(revenue)}</div>
            <div class="stat-label">Total Revenue</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${formatMoney(profit)}</div>
            <div class="stat-label">Total Profit</div>
          </div>
        `;
      } else if (activeSection === 'profit') {
        return `
          <div class="stat-box">
            <div class="stat-value">${profitTotals.totalOrders}</div>
            <div class="stat-label">Orders</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${formatMoney(profitTotals.netSales)}</div>
            <div class="stat-label">Net Sales</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${formatMoney(profitTotals.totalCost)}</div>
            <div class="stat-label">Total Cost</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${formatMoney(profitTotals.profit)}</div>
            <div class="stat-label">Profit</div>
          </div>
        `;
      } else if (activeSection === 'products') {
        const totalValue = data.reduce((sum: number, p: any) => sum + ((p.price || 0) * (p.stockQuantity || 0)), 0);
        return `
          <div class="stat-box">
            <div class="stat-value">${data.length}</div>
            <div class="stat-label">Total Products</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${formatMoney(totalValue)}</div>
            <div class="stat-label">Inventory Value</div>
          </div>
        `;
      } else {
        return `
          <div class="stat-box">
            <div class="stat-value">${data.length}</div>
            <div class="stat-label">Total Records</div>
          </div>
        `;
      }
    };
    
    // Create printable HTML content
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { text-align: center; color: #1e293b; margin-bottom: 10px; }
          .subtitle { text-align: center; color: #64748b; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #f1f5f9; color: #334155; font-weight: 600; text-align: left; padding: 10px; border: 1px solid #e2e8f0; }
          td { padding: 8px 10px; border: 1px solid #e2e8f0; font-size: 13px; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #94a3b8; }
          .stats { display: flex; gap: 20px; margin-bottom: 20px; justify-content: center; flex-wrap: wrap; }
          .stat-box { background: #f1f5f9; padding: 15px 25px; border-radius: 8px; text-align: center; }
          .stat-value { font-size: 24px; font-weight: bold; color: #1e293b; }
          .stat-label { font-size: 12px; color: #64748b; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="subtitle">Generated on ${new Date().toLocaleString()}</div>
        <div class="stats">
          ${getStats()}
        </div>
        <table>
          <thead>
            <tr>
              ${columns.map(col => `<th>${col}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.slice(0, 100).map(item => `
              <tr>
                ${columns.map((_, idx) => `<td>${getCellValue(item, idx)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${data.length > 100 ? '<p style="text-align:center; color:#94a3b8; margin-top:10px;">Showing first 100 records...</p>' : ''}
        <div class="footer">Restaurant POS System - ${new Date().toLocaleDateString()}</div>
      </body>
      </html>
    `;

    // Open print window
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
      notify.success('PDF ready for printing');
    } else {
      notify.error('Please allow popups to download PDF');
    }
  };

  const sections = [
    { id: 'sales' as ReportSection, label: '💰 Sales', count: filteredSales.length },
    { id: 'profit' as ReportSection, label: '📈 Profit', count: filteredProfitDaysAdjusted.length },
    { id: 'products' as ReportSection, label: '📦 Products', count: filteredProducts.length },
    { id: 'customers' as ReportSection, label: '👥 Customers', count: filteredCustomers.length },
    { id: 'suppliers' as ReportSection, label: '🏭 Suppliers', count: filteredSuppliers.length },
    { id: 'purchase-orders' as ReportSection, label: '📋 Purchase Orders', count: filteredPurchaseOrders.length },
    { id: 'grn' as ReportSection, label: '📥 GRN', count: filteredGrns.length },
    { id: 'batches' as ReportSection, label: '🏷️ Batches', count: filteredBatches.length },
    { id: 'tables' as ReportSection, label: '🪑 Tables', count: filteredTables.length },
    { id: 'reservations' as ReportSection, label: '📅 Reservations', count: filteredReservations.length },
  ];

  // Calculate summary statistics
  const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.grandTotal || 0), 0);
  // Calculate profit: Revenue - Cost (from product items sold)
  const totalCost = filteredSales.reduce((sum, s) => {
    return sum + (s.items || []).reduce((itemSum, item) => {
      const product = typeof item.product === 'object' ? item.product : null;
      const cost = product?.cost || 0;
      return itemSum + (cost * item.quantity);
    }, 0);
  }, 0);
  const totalProfit = totalRevenue - totalCost;
  const totalProducts = filteredProducts.length;
  const totalCustomers = filteredCustomers.length;
  const totalOrders = filteredPurchaseOrders.length;

  return (
    <Layout>
      <PageHeader 
        title="📊 Comprehensive Reports" 
        subtitle="View and export all system data"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="text-sm text-slate-500">to</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        }
      />
      
      <PageContent>
        {/* Summary Stats Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Sales</p>
                <p className="mt-1 text-2xl font-bold text-blue-600">{filteredSales.length}</p>
              </div>
              <div className="rounded-full bg-blue-100 p-3">
                <span className="text-2xl">💰</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Revenue: {formatMoney(totalRevenue)}
            </p>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Profit</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">{formatMoney(totalProfit)}</p>
              </div>
              <div className="rounded-full bg-emerald-100 p-3">
                <span className="text-2xl">📈</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Margin: {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Products</p>
                <p className="mt-1 text-2xl font-bold text-green-600">{totalProducts}</p>
              </div>
              <div className="rounded-full bg-green-100 p-3">
                <span className="text-2xl">📦</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Available: {filteredProducts.filter(p => p.isAvailable).length}
            </p>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Customers</p>
                <p className="mt-1 text-2xl font-bold text-purple-600">{totalCustomers}</p>
              </div>
              <div className="rounded-full bg-purple-100 p-3">
                <span className="text-2xl">👥</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Platinum: {filteredCustomers.filter(c => c.tier === 'PLATINUM').length}
            </p>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Purchase Orders</p>
                <p className="mt-1 text-2xl font-bold text-orange-600">{totalOrders}</p>
              </div>
              <div className="rounded-full bg-orange-100 p-3">
                <span className="text-2xl">📋</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Pending: {filteredPurchaseOrders.filter(po => po.status === 'PENDING').length}
            </p>
          </Card>
        </div>

        {/* Section Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeSection === section.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {section.label} ({section.count})
            </button>
          ))}
        </div>

        {loading ? (
          <PageLoader />
        ) : (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {sections.find(s => s.id === activeSection)?.label}
              </h2>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    const dataMap: Record<string, any[]> = { 
                      products: filteredProducts,
                      sales: filteredSales,
                      profit: filteredProfitDaysAdjusted,
                      customers: filteredCustomers,
                      suppliers: filteredSuppliers,
                      'purchase-orders': filteredPurchaseOrders,
                      grn: filteredGrns,
                      batches: filteredBatches,
                      tables: filteredTables,
                      reservations: filteredReservations,
                    };
                    const dataToExport = dataMap[activeSection] || [];
                    exportToCSV(dataToExport as any[], activeSection);
                  }}
                >
                  📥 CSV
                </Button>
                <Button
                  variant="secondary"
                  onClick={exportToPDF}
                >
                  📄 PDF
                </Button>
              </div>
            </div>

            {/* Products Report */}
            {activeSection === 'products' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">SKU</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Category</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Price</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Tax Rate</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredProducts.map((product) => (
                      <tr key={product._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{product.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{product.sku || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {typeof product.category === 'object' ? product.category?.name : product.category}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">{formatMoney(product.price)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{product.taxRate || 0}%</td>
                        <td className="px-4 py-3">
                          <Badge variant={product.isAvailable ? 'success' : 'danger'}>
                            {product.isAvailable ? 'Available' : 'Unavailable'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredProducts.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No products found</div>
                )}
              </div>
            )}

            {/* Sales Report */}
            {activeSection === 'sales' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Invoice #</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Customer</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Items</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Subtotal</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Tax</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Total</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredSales.map((sale) => (
                      <tr key={sale._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-blue-600">{sale.invoiceNumber}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {new Date(sale.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {typeof sale.customer_id === 'object' && (sale.customer_id as any)?.name ? (sale.customer_id as any).name : 'Walk-in'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{sale.items?.length || 0}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">{formatMoney(sale.subtotal)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {formatMoney(typeof (sale as any).tax === 'number' ? (sale as any).tax : (sale.subtotal ? sale.subtotal * 0.1 : 0))}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-green-600">
                          {formatMoney(sale.grandTotal)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="info">{sale.paymentMethod || 'CASH'}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredSales.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No sales found</div>
                )}
              </div>
            )}

            {/* Profit Report */}
            {activeSection === 'profit' && (
              <div>
                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-600">Orders</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {profitTotals.totalOrders}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-600">Net Sales</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {formatMoney(profitTotals.netSales)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-600">Total Cost</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {formatMoney(profitTotals.totalCost)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-600">Profit</p>
                    <p
                      className={`mt-1 text-xl font-semibold ${
                        profitTotals.profit >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {formatMoney(profitTotals.profit)}
                    </p>
                  </div>
                </div>

                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-600">Customer Refunds</p>
                    <p className="mt-1 text-xl font-semibold text-red-700">
                      {formatMoney(returnsTotals.customerRefund)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{returnsTotals.count} return(s)</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-600">COGS Recovered</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-700">
                      {formatMoney(returnsTotals.customerCostRecovered)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Restocked items cost</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-600">Wastage Cost</p>
                    <p className="mt-1 text-xl font-semibold text-red-700">
                      {formatMoney(returnsTotals.internalCostWastage)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Internal returns</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-600">Net Return Impact</p>
                    <p className="mt-1 text-xl font-semibold text-red-700">
                      − {formatMoney(Math.abs(returnsTotals.netReturnImpact))}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">P&amp;L loss from returns</p>
                  </div>
                </div>

                <Table
                  columns={[
                    { key: 'date', header: 'Date', render: (d: ProfitReportDay) => d.date },
                    {
                      key: 'totalOrders',
                      header: 'Orders',
                      className: 'text-right',
                      render: (d: ProfitReportDay) => d.totalOrders,
                    },
                    {
                      key: 'grossSales',
                      header: 'Gross Sales',
                      className: 'text-right',
                      render: (d: ProfitReportDay) => formatMoney(d.grossSales),
                    },
                    {
                      key: 'discount',
                      header: 'Discount',
                      className: 'text-right',
                      render: (d: ProfitReportDay) => formatMoney(d.discount),
                    },
                    {
                      key: 'netSales',
                      header: 'Net Sales',
                      className: 'text-right',
                      render: (d: ProfitReportDay) => formatMoney(d.netSales),
                    },
                    {
                      key: 'totalCost',
                      header: 'Cost',
                      className: 'text-right',
                      render: (d: ProfitReportDay) => formatMoney(d.totalCost),
                    },
                    {
                      key: 'profit',
                      header: 'Profit',
                      className: 'text-right',
                      render: (d: ProfitReportDay) => (
                        <span className={d.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                          {formatMoney(d.profit)}
                        </span>
                      ),
                    },
                  ]}
                  data={filteredProfitDaysAdjusted}
                  keyExtractor={(d: ProfitReportDay) => d.date}
                  loading={loading || returnsLoading}
                  emptyMessage="No profit data found"
                />
              </div>
            )}

            {/* Customers Report */}
            {activeSection === 'customers' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Phone</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Tier</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredCustomers.map((customer) => (
                      <tr key={customer._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{customer.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{customer.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{customer.phone}</td>
                        <td className="px-4 py-3">
                          <Badge variant={customer.tier === 'PLATINUM' ? 'warning' : 'info'}>
                            {customer.tier || 'REGULAR'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {new Date(customer.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredCustomers.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No customers found</div>
                )}
              </div>
            )}

            {/* Suppliers Report */}
            {activeSection === 'suppliers' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Contact Person</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Phone</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Address</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredSuppliers.map((supplier) => (
                      <tr key={supplier._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{supplier.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{supplier.contactPerson || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{supplier.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{supplier.phone}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{supplier.address || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={supplier.status === 'ACTIVE' ? 'success' : 'danger'}>
                            {supplier.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredSuppliers.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No suppliers found</div>
                )}
              </div>
            )}

            {/* Purchase Orders Report */}
            {activeSection === 'purchase-orders' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">PO Number</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Supplier</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Order Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Expected</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Total Amount</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredPurchaseOrders.map((po) => (
                      <tr key={po._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-blue-600">{po.poNumber}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {typeof po.supplier_id === 'object' ? (po.supplier_id as any)?.name : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {(po as any).orderDate ? new Date((po as any).orderDate).toLocaleDateString() : 
                           po.createdAt ? new Date(po.createdAt).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                          {formatMoney(po.totalAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge 
                            variant={
                              po.status === 'RECEIVED' ? 'success' : 
                              po.status === 'PENDING' ? 'warning' : 
                              'info'
                            }
                          >
                            {po.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPurchaseOrders.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No purchase orders found</div>
                )}
              </div>
            )}

            {/* GRN Report */}
            {activeSection === 'grn' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">GRN Number</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">PO Number</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Supplier</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Received Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Items</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredGrns.map((grn) => (
                      <tr key={grn._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-blue-600">{grn.grnNumber}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {typeof grn.purchaseOrder_id === 'object' ? (grn.purchaseOrder_id as any)?.poNumber : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {typeof grn.supplier_id === 'object' ? (grn.supplier_id as any)?.name : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {new Date(grn.receivedDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{grn.items?.length || 0}</td>
                        <td className="px-4 py-3">
                          <Badge variant={grn.status === 'RECEIVED' ? 'success' : 'warning'}>
                            {grn.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredGrns.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No GRN records found</div>
                )}
              </div>
            )}

            {/* Batches Report */}
            {activeSection === 'batches' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Batch Number</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Product</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Quantity</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Used</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Remaining</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Expiry Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredBatches.map((batch) => (
                      <tr key={batch._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-blue-600">{batch.batchNumber}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {typeof batch.product_id === 'object' ? (batch.product_id as any)?.name : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{batch.quantity}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{batch.quantity || 0}</td>
                        <td className="px-4 py-3 text-sm font-medium text-green-600">
                          {batch.remainingQuantity || batch.quantity}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge 
                            variant={
                              batch.status === 'ACTIVE' ? 'success' : 
                              batch.status === 'EXPIRED' ? 'danger' : 
                              'warning'
                            }
                          >
                            {batch.status || 'ACTIVE'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredBatches.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No batches found</div>
                )}
              </div>
            )}

            {/* Tables Report */}
            {activeSection === 'tables' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Table Number</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Section</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Capacity</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Current Sale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTables.map((table) => (
                      <tr key={table._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{table.tableNumber}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{table.section || 'Main'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{table.capacity} seats</td>
                        <td className="px-4 py-3">
                          <Badge 
                            variant={
                              table.status === 'AVAILABLE' ? 'success' : 
                              table.status === 'OCCUPIED' ? 'danger' : 
                              table.status === 'RESERVED' ? 'warning' : 
                              'info'
                            }
                          >
                            {table.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {table.currentSale ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredTables.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No tables found</div>
                )}
              </div>
            )}

            {/* Reservations Report */}
            {activeSection === 'reservations' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Customer</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Phone</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Date & Time</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Table</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Guests</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredReservations.map((reservation) => (
                      <tr key={reservation._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{reservation.customerName}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{reservation.customerPhone}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {new Date(reservation.reservationDateTime).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {typeof reservation.table === 'object' ? reservation.table?.tableNumber : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{reservation.guestCount || 0}</td>
                        <td className="px-4 py-3">
                          <Badge 
                            variant={
                              reservation.status === 'COMPLETED' ? 'success' : 
                              reservation.status === 'SEATED' ? 'info' :
                              reservation.status === 'CONFIRMED' ? 'warning' : 
                              'danger'
                            }
                          >
                            {reservation.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredReservations.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No reservations found</div>
                )}
              </div>
            )}

            {/* Kitchens placeholder */}
            {activeSection === 'kitchens' && (
              <div className="py-12 text-center text-slate-500">
                Kitchen reports coming soon
              </div>
            )}
          </Card>
        )}
      </PageContent>
    </Layout>
  );
}
