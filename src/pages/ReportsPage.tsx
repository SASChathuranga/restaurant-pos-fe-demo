import { useEffect, useMemo, useState } from 'react';
import { Layout, PageHeader, PageContent, Card, StatCard, PageLoader, Button, Table } from '../components';
import { orderReturnsApi, reportsApi } from '../api';
import type { OrderReturn } from '../api/orderReturns.api';
import type { DailyReport, PaymentSummary, Inventory, ProfitReport, ProfitReportDay } from '../types';
import { formatMoney } from '../money';

// Simple Pie Chart Component (CSS-based)
const SimplePieChart = ({ data, height = 320 }: { data: { name: string; value?: number; qty?: number }[]; height?: number }) => {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center" style={{ height }}>No data available</div>;
  }
  const total = data.reduce((sum, item) => sum + (item.value || item.qty || 0), 0);
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
  
  return (
    <div className="flex items-center gap-6" style={{ height }}>
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {(() => {
            let currentAngle = 0;
            return data.slice(0, 7).map((item, index) => {
              const value = item.value || item.qty || 0;
              const percentage = total > 0 ? (value / total) * 100 : 0;
              const angle = (percentage / 100) * 360;
              const largeArc = angle > 180 ? 1 : 0;
              const startX = 50 + 40 * Math.cos((currentAngle * Math.PI) / 180);
              const startY = 50 + 40 * Math.sin((currentAngle * Math.PI) / 180);
              const endX = 50 + 40 * Math.cos(((currentAngle + angle) * Math.PI) / 180);
              const endY = 50 + 40 * Math.sin(((currentAngle + angle) * Math.PI) / 180);
              const pathD = `M 50 50 L ${startX} ${startY} A 40 40 0 ${largeArc} 1 ${endX} ${endY} Z`;
              currentAngle += angle;
              return <path key={index} d={pathD} fill={colors[index % colors.length]} className="hover:opacity-80 transition-opacity" />;
            });
          })()}
          <circle cx="50" cy="50" r="20" fill="white" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-slate-700">{total}</span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {data.slice(0, 5).map((item, index) => {
          const value = item.value || item.qty || 0;
          const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
          return (
            <div key={index} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              <span className="text-sm text-slate-600 flex-1 truncate">{item.name}</span>
              <span className="text-sm font-medium text-slate-700">{percentage}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function ReportsPage() {
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number }[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({});
  const [lowStock, setLowStock] = useState<Inventory[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  const [profitReport, setProfitReport] = useState<ProfitReport | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitFrom, setProfitFrom] = useState(new Date().toISOString().split('T')[0]);
  const [profitTo, setProfitTo] = useState(new Date().toISOString().split('T')[0]);
  const [profitOrderType, setProfitOrderType] = useState('');

  const [orderReturns, setOrderReturns] = useState<OrderReturn[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [daily, top, payments, stock] = await Promise.all([
        reportsApi.getDailySales(selectedDate),
        reportsApi.getTopProducts(),
        reportsApi.getPaymentSummary(),
        reportsApi.getLowStock(),
      ]);
      setDailyReport(daily);
      setTopProducts(top || []);
      setPaymentSummary(payments || {});
      setLowStock(stock || []);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadProfitReport = async () => {
    try {
      setProfitLoading(true);
      const res = await reportsApi.getProfitReport({
        from: profitFrom || undefined,
        to: profitTo || undefined,
        orderType: profitOrderType || undefined,
      });
      setProfitReport(res);
    } catch (error) {
      console.error('Failed to load profit report:', error);
    } finally {
      setProfitLoading(false);
    }
  };

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

  const loadOrderReturnsForProfitRange = async () => {
    // Load enough returns to accurately adjust the profit table (refunds + wastage)
    setReturnsLoading(true);
    try {
      const from = profitFrom;
      const to = profitTo;
      const orderType = profitOrderType;
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
        if (page > 50) break; // safety cap
      }

      const filtered = all.filter((r) => {
        if (!r?.createdAt) return false;
        if (!isInRange(r.createdAt, from, to)) return false;

        // If order type filter is set and return includes a populated sale reference, match it.
        if (orderType && typeof r.sale_id === 'object' && r.sale_id?.orderType && r.sale_id.orderType !== orderType) {
          return false;
        }
        return true;
      });

      setOrderReturns(filtered);
    } catch (error) {
      console.error('Failed to load order returns:', error);
      setOrderReturns([]);
    } finally {
      setReturnsLoading(false);
    }
  };

  useEffect(() => {
    loadProfitReport();
  }, [profitFrom, profitTo, profitOrderType]);

  useEffect(() => {
    loadOrderReturnsForProfitRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profitFrom, profitTo, profitOrderType]);

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

  const profitDaysAdjusted: ProfitReportDay[] = useMemo(() => {
    const baseDays = profitReport?.days || [];
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
  }, [profitReport, returnsByDate]);

  const profitTotalsAdjusted = useMemo(() => {
    const days = profitDaysAdjusted || [];
    return days.reduce(
      (acc, d) => {
        acc.totalOrders += d.totalOrders || 0;
        acc.grossSales += d.grossSales || 0;
        acc.discount += d.discount || 0;
        acc.netSales += d.netSales || 0;
        acc.totalCost += d.totalCost || 0;
        acc.profit += d.profit || 0;
        return acc;
      },
      { totalOrders: 0, grossSales: 0, discount: 0, netSales: 0, totalCost: 0, profit: 0 }
    );
  }, [profitDaysAdjusted]);

  const escapeCsv = (val: unknown) => {
    const s = String(val ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadCsv = (filename: string, rows: string[][]) => {
    const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const escapeHtml = (text: unknown) =>
    String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const openPrintWindow = (title: string, htmlBody: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups to export PDF.');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
          h1 { text-align: center; margin: 0; font-size: 20px; }
          .subtitle { text-align: center; margin-top: 6px; color: #64748b; font-size: 12px; }
          .section { margin-top: 16px; }
          .section h2 { margin: 0 0 8px 0; font-size: 14px; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; font-size: 12px; }
          th { background: #f1f5f9; color: #334155; }
          td.num, th.num { text-align: right; }
          .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
          .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #f8fafc; font-size: 12px; }
          .box strong { color: #0f172a; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${htmlBody}
        <script>
          window.addEventListener('load', () => { window.print(); });
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const exportDailyCsv = () => {
    if (!dailyReport) {
      alert('No daily report data to export');
      return;
    }

    const rows: string[][] = [
      ['Section', 'Name', 'Value'],
      ['Daily Summary', 'Date', dailyReport.date || selectedDate],
      ['Daily Summary', 'Total Orders', String(dailyReport.totalOrders ?? 0)],
      ['Daily Summary', 'Total Sales', String(dailyReport.totalSales ?? 0)],
      ['Daily Summary', 'Total Tax', String(dailyReport.totalTax ?? 0)],
      ['Daily Summary', 'Avg Order Value', String(dailyReport.averageOrderValue ?? 0)],
    ];

    topProducts.slice(0, 50).forEach((p) => {
      rows.push(['Top Products', p.name, String(p.qty ?? 0)]);
    });

    Object.entries(paymentSummary || {}).forEach(([method, amount]) => {
      rows.push(['Payment Methods', method, String(amount ?? 0)]);
    });

    lowStock.slice(0, 100).forEach((inv) => {
      const product = typeof inv.product === 'object' ? inv.product : null;
      rows.push(['Low Stock', product?.name || 'Unknown', String(inv.stockQuantity ?? 0)]);
    });

    downloadCsv(`daily_report_${selectedDate}.csv`, rows);
  };

  const exportDailyPdf = () => {
    if (!dailyReport) {
      alert('No daily report data to export');
      return;
    }

    const htmlBody = `
      <h1>Daily Report</h1>
      <div class="subtitle">Date: ${escapeHtml(selectedDate)}</div>
      <div class="grid">
        <div class="box"><strong>Total Orders:</strong> ${escapeHtml(dailyReport.totalOrders ?? 0)}</div>
        <div class="box"><strong>Total Sales:</strong> ${escapeHtml(formatMoney(dailyReport.totalSales))}</div>
        <div class="box"><strong>Total Tax:</strong> ${escapeHtml(formatMoney(dailyReport.totalTax))}</div>
        <div class="box"><strong>Avg Order Value:</strong> ${escapeHtml(formatMoney(dailyReport.averageOrderValue))}</div>
      </div>

      <div class="section">
        <h2>Top Selling Products</h2>
        <table>
          <thead><tr><th>Product</th><th class="num">Qty</th></tr></thead>
          <tbody>
            ${(topProducts || []).slice(0, 25).map((p) => `
              <tr><td>${escapeHtml(p.name)}</td><td class="num">${escapeHtml(p.qty ?? 0)}</td></tr>
            `).join('')}
            ${(topProducts || []).length === 0 ? '<tr><td colspan="2">No data</td></tr>' : ''}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h2>Payment Methods</h2>
        <table>
          <thead><tr><th>Method</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${Object.entries(paymentSummary || {}).map(([method, amount]) => `
              <tr><td>${escapeHtml(method)}</td><td class="num">${escapeHtml(formatMoney(amount))}</td></tr>
            `).join('')}
            ${Object.keys(paymentSummary || {}).length === 0 ? '<tr><td colspan="2">No data</td></tr>' : ''}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h2>Low Stock</h2>
        <table>
          <thead><tr><th>Item</th><th class="num">Qty Left</th></tr></thead>
          <tbody>
            ${(lowStock || []).slice(0, 25).map((inv) => {
              const product = typeof inv.product === 'object' ? inv.product : null;
              return `\n<tr><td>${escapeHtml(product?.name || 'Unknown')}</td><td class="num">${escapeHtml(inv.stockQuantity ?? 0)}</td></tr>`;
            }).join('')}
            ${(lowStock || []).length === 0 ? '<tr><td colspan="2">No data</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `;

    openPrintWindow(`Daily Report - ${selectedDate}`, htmlBody);
  };

  const exportTopProductsCsv = () => {
    if (!topProducts || topProducts.length === 0) {
      alert('No top products data to export');
      return;
    }
    downloadCsv(`top_products_${selectedDate}.csv`, [
      ['Product', 'Qty'],
      ...topProducts.map((p) => [p.name, String(p.qty ?? 0)]),
    ]);
  };

  const exportTopProductsPdf = () => {
    if (!topProducts || topProducts.length === 0) {
      alert('No top products data to export');
      return;
    }

    const htmlBody = `
      <h1>Top Selling Products</h1>
      <div class="subtitle">As of ${escapeHtml(selectedDate)}</div>
      <table>
        <thead><tr><th>Product</th><th class="num">Qty</th></tr></thead>
        <tbody>
          ${topProducts.map((p) => `
            <tr><td>${escapeHtml(p.name)}</td><td class="num">${escapeHtml(p.qty ?? 0)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    `;
    openPrintWindow(`Top Products - ${selectedDate}`, htmlBody);
  };

  const exportPaymentMethodsCsv = () => {
    if (!paymentSummary || Object.keys(paymentSummary).length === 0) {
      alert('No payment data to export');
      return;
    }
    downloadCsv(`payment_methods_${selectedDate}.csv`, [
      ['Method', 'Amount'],
      ...Object.entries(paymentSummary).map(([method, amount]) => [method, String(amount ?? 0)]),
    ]);
  };

  const exportPaymentMethodsPdf = () => {
    if (!paymentSummary || Object.keys(paymentSummary).length === 0) {
      alert('No payment data to export');
      return;
    }

    const htmlBody = `
      <h1>Payment Methods</h1>
      <div class="subtitle">As of ${escapeHtml(selectedDate)}</div>
      <table>
        <thead><tr><th>Method</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${Object.entries(paymentSummary).map(([method, amount]) => `
            <tr><td>${escapeHtml(method)}</td><td class="num">${escapeHtml(formatMoney(amount))}</td></tr>
          `).join('')}
        </tbody>
      </table>
    `;
    openPrintWindow(`Payment Methods - ${selectedDate}`, htmlBody);
  };

  const exportProfitCsv = () => {
    const days = profitDaysAdjusted || [];
    if (days.length === 0) {
      alert('No profit data to export');
      return;
    }

    const headers = ['Date', 'Orders', 'Gross Sales', 'Discount', 'Net Sales', 'Total Cost', 'Profit'];
    const escapeCsv = (val: unknown) => {
      const s = String(val ?? '');
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const rows = days.map((d) => [
      d.date,
      d.totalOrders,
      d.grossSales,
      d.discount,
      d.netSales,
      d.totalCost,
      d.profit,
    ].map(escapeCsv).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit_report_${profitFrom || 'from'}_${profitTo || 'to'}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportProfitPdf = () => {
    const days = profitDaysAdjusted || [];
    if (days.length === 0) {
      alert('No profit data to export');
      return;
    }

    const escapeHtml = (text: unknown) => String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const title = 'Profit Report (Daily)';
    const orderTypeLabel = profitOrderType ? profitOrderType : 'All';

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
          h1 { text-align: center; margin: 0; font-size: 20px; }
          .subtitle { text-align: center; margin-top: 6px; color: #64748b; font-size: 12px; }
          .meta { margin-top: 16px; display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; font-size: 12px; color: #334155; }
          .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; font-size: 12px; }
          th { background: #f1f5f9; color: #334155; }
          td.num, th.num { text-align: right; }
          tfoot th { background: #f8fafc; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="subtitle">From ${escapeHtml(profitFrom)} to ${escapeHtml(profitTo)} • Order Type: ${escapeHtml(orderTypeLabel)}</div>
        <div class="meta">
          <div class="box"><strong>Orders:</strong> ${escapeHtml(profitTotalsAdjusted.totalOrders || 0)}</div>
          <div class="box"><strong>Gross Sales:</strong> ${escapeHtml(formatMoney(profitTotalsAdjusted.grossSales))}</div>
          <div class="box"><strong>Total Cost:</strong> ${escapeHtml(formatMoney(profitTotalsAdjusted.totalCost))}</div>
          <div class="box"><strong>Profit:</strong> ${escapeHtml(formatMoney(profitTotalsAdjusted.profit))}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th class="num">Orders</th>
              <th class="num">Gross Sales</th>
              <th class="num">Discount</th>
              <th class="num">Net Sales</th>
              <th class="num">Cost</th>
              <th class="num">Profit</th>
            </tr>
          </thead>
          <tbody>
            ${days.map(d => `
              <tr>
                <td>${escapeHtml(d.date)}</td>
                <td class="num">${escapeHtml(d.totalOrders)}</td>
                <td class="num">${escapeHtml(formatMoney(d.grossSales))}</td>
                <td class="num">${escapeHtml(formatMoney(d.discount))}</td>
                <td class="num">${escapeHtml(formatMoney(d.netSales))}</td>
                <td class="num">${escapeHtml(formatMoney(d.totalCost))}</td>
                <td class="num">${escapeHtml(formatMoney(d.profit))}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th class="num">${escapeHtml(profitTotalsAdjusted.totalOrders || 0)}</th>
              <th class="num">${escapeHtml(formatMoney(profitTotalsAdjusted.grossSales))}</th>
              <th class="num">${escapeHtml(formatMoney(profitTotalsAdjusted.discount))}</th>
              <th class="num">${escapeHtml(formatMoney(profitTotalsAdjusted.netSales))}</th>
              <th class="num">${escapeHtml(formatMoney(profitTotalsAdjusted.totalCost))}</th>
              <th class="num">${escapeHtml(formatMoney(profitTotalsAdjusted.profit))}</th>
            </tr>
          </tfoot>
        </table>

        <script>
          window.addEventListener('load', () => { window.print(); });
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups to export PDF.');
      return;
    }
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <Layout>
        <PageLoader />
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Reports"
        subtitle="Sales and inventory reports"
        actions={
          <div className="flex gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <Button 
              onClick={exportDailyPdf}
            >
              📥 Export PDF
            </Button>
            <Button 
              onClick={exportDailyCsv}
              variant="outline"
            >
              📊 Export CSV
            </Button>
          </div>
        }
      />
      <PageContent>
        {/* Daily Stats */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Orders"
            value={dailyReport?.totalOrders || 0}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
          <StatCard
            title="Total Sales"
            value={formatMoney(dailyReport?.totalSales)}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Total Tax"
            value={formatMoney(dailyReport?.totalTax)}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
              </svg>
            }
          />
          <StatCard
            title="Avg Order Value"
            value={formatMoney(dailyReport?.averageOrderValue)}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          />
        </div>

        {/* Profit Report (by date range) */}
        <Card className="mb-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Profit Report</h3>
              <p className="text-sm text-slate-600">
                Day-by-day profit using sales vs cost (includes returns/refunds).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={profitFrom}
                onChange={(e) => setProfitFrom(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={profitTo}
                onChange={(e) => setProfitTo(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={profitOrderType}
                onChange={(e) => setProfitOrderType(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All Order Types</option>
                <option value="DINE_IN">Dine In</option>
                <option value="TAKEAWAY">Takeaway</option>
                <option value="DELIVERY">Delivery</option>
              </select>
              <Button
                variant="ghost"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setProfitFrom(today);
                  setProfitTo(today);
                  setProfitOrderType('');
                }}
              >
                Today
              </Button>
              <Button
                variant="outline"
                onClick={exportProfitCsv}
                disabled={profitLoading || (profitReport?.days?.length || 0) === 0}
              >
                📥 Profit CSV
              </Button>
              <Button
                variant="secondary"
                onClick={exportProfitPdf}
                disabled={profitLoading || (profitReport?.days?.length || 0) === 0}
              >
                📄 Profit PDF
              </Button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <StatCard
              title="Orders"
              value={profitTotalsAdjusted.totalOrders || 0}
            />
            <StatCard
              title="Gross Sales"
              value={formatMoney(profitTotalsAdjusted.grossSales)}
            />
            <StatCard
              title="Discount"
              value={formatMoney(profitTotalsAdjusted.discount)}
            />
            <StatCard
              title="Net Sales"
              value={formatMoney(profitTotalsAdjusted.netSales)}
            />
            <StatCard
              title="Total Cost"
              value={formatMoney(profitTotalsAdjusted.totalCost)}
            />
            <StatCard
              title="Profit"
              value={formatMoney(profitTotalsAdjusted.profit)}
              className={
                (profitTotalsAdjusted.profit || 0) >= 0 ? 'border-green-200' : 'border-red-200'
              }
            />
          </div>

          <Table
            columns={[
              { key: 'date', header: 'Date', render: (d: ProfitReportDay) => d.date },
              { key: 'totalOrders', header: 'Orders', render: (d: ProfitReportDay) => d.totalOrders },
              { key: 'grossSales', header: 'Gross Sales', className: 'text-right', render: (d: ProfitReportDay) => formatMoney(d.grossSales) },
              { key: 'discount', header: 'Discount', className: 'text-right', render: (d: ProfitReportDay) => formatMoney(d.discount) },
              { key: 'netSales', header: 'Net Sales', className: 'text-right', render: (d: ProfitReportDay) => formatMoney(d.netSales) },
              { key: 'totalCost', header: 'Cost', className: 'text-right', render: (d: ProfitReportDay) => formatMoney(d.totalCost) },
              {
                key: 'profit',
                header: 'Profit',
                className: 'text-right',
                render: (d: ProfitReportDay) => (
                  <span className={d.profit >= 0 ? 'text-green-700' : 'text-red-700'}>
                    {formatMoney(d.profit)}
                  </span>
                ),
              },
            ]}
            data={profitDaysAdjusted || []}
            keyExtractor={(d: ProfitReportDay) => d.date}
            loading={profitLoading || returnsLoading}
            emptyMessage="No profit data found for selected filters"
          />
        </Card>

        {/* Charts Section */}
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Top Products Pie Chart */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Top Selling Products (Chart)
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={exportTopProductsPdf}
                  className="text-sm text-blue-600 hover:text-blue-800"
                  title="Export to PDF"
                >
                  📄 PDF
                </button>
                <button
                  onClick={exportTopProductsCsv}
                  className="text-sm text-green-600 hover:text-green-800"
                  title="Export to CSV"
                >
                  📊 CSV
                </button>
              </div>
            </div>
            {topProducts.length === 0 ? (
              <div className="flex items-center justify-center text-slate-500" style={{ height: 350 }}>
                No product sales data available
              </div>
            ) : (
              <SimplePieChart data={topProducts} height={350} />
            )}
          </Card>

          {/* Payment Methods Pie Chart */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Payment Methods Breakdown
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={exportPaymentMethodsPdf}
                  className="text-sm text-blue-600 hover:text-blue-800"
                  title="Export to PDF"
                >
                  📄 PDF
                </button>
                <button
                  onClick={exportPaymentMethodsCsv}
                  className="text-sm text-green-600 hover:text-green-800"
                  title="Export to CSV"
                >
                  📊 CSV
                </button>
              </div>
            </div>
            {Object.keys(paymentSummary).length === 0 ? (
              <div className="flex items-center justify-center text-slate-500" style={{ height: 350 }}>
                No payment data available
              </div>
            ) : (
              <SimplePieChart 
                data={Object.entries(paymentSummary).map(([name, value]) => ({ name, value }))} 
                height={350} 
              />
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Top Products */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Top Selling Products</h3>
            {topProducts.length === 0 ? (
              <p className="text-slate-500">No sales data</p>
            ) : (
              <div className="space-y-3">
                {topProducts.slice(0, 10).map((product, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-medium text-white">
                        {index + 1}
                      </span>
                      <span className="font-medium text-slate-900">{product.name}</span>
                    </div>
                    <span className="text-sm text-slate-600">{product.qty} sold</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Payment Methods */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Payment Methods</h3>
            {Object.keys(paymentSummary).length === 0 ? (
              <p className="text-slate-500">No payment data</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(paymentSummary).map(([method, amount]) => (
                  <div
                    key={method}
                    className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                  >
                    <span className="font-medium text-slate-900">{method}</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoney(amount as number)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Low Stock */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Low Stock Alert</h3>
            {lowStock.length === 0 ? (
              <p className="text-slate-500">All items well stocked</p>
            ) : (
              <div className="space-y-3">
                {lowStock.slice(0, 10).map((item) => {
                  const product = typeof item.product === 'object' ? item.product : null;
                  return (
                    <div
                      key={item._id}
                      className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3"
                    >
                      <span className="font-medium text-slate-900">
                        {product?.name || 'Unknown'}
                      </span>
                      <span className="text-sm font-medium text-red-600">
                        {item.stockQuantity} left
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </PageContent>
    </Layout>
  );
}
