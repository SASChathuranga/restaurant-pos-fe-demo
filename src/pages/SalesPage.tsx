import React, { useMemo, useState, useEffect } from 'react';
import notify from '../utils/notify';
import { Layout, PageHeader, PageContent, Button, Badge } from '../components';
import Table from '../components/Table';
import Modal from '../components/Modal';
import * as salesApi from '../api/sales.api';
import { configApi } from '../api';
import type { Sale, SaleFilters, Product, Customer, RestaurantTable, OrderType, Invoice, UserRef } from '../types';
import { formatMoney } from '../money';

const SalesPage: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalSales, setTotalSales] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SaleFilters>({
    page: 1,
    limit: 20,
  });
  
  // Modals
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

  const loadSales = async () => {
    setLoading(true);
    try {
      const data = await salesApi.getSales(filters);
      setSales(data.sales);
      setTotalSales(data.total);
      setCurrentPage(data.page);
    } catch (error) {
      console.error('Failed to load sales:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, [filters]);

  const displayedSales = useMemo(() => {
    const term = invoiceSearch.trim().toLowerCase();
    if (!term) return sales;
    return sales.filter((sale) => {
      const invoiceNumber = (sale.invoiceNumber || '').toLowerCase();
      return invoiceNumber.includes(term);
    });
  }, [invoiceSearch, sales]);

  const handleViewDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setShowDetailModal(true);
  };

  const handleVoidClick = (sale: Sale) => {
    setSelectedSale(sale);
    setVoidReason('');
    setShowVoidModal(true);
  };

  const handleVoidSale = async () => {
    if (!selectedSale || !voidReason.trim()) {
      notify.error('Please provide a reason for voiding the sale');
      return;
    }

    try {
      await salesApi.voidSale(selectedSale._id, voidReason);
      notify.success('Sale voided successfully');
      setShowVoidModal(false);
      loadSales();
    } catch (error: any) {
      notify.error(error.response?.data?.message || 'Failed to void sale');
    }
  };

  const handleRefundClick = (sale: Sale) => {
    setSelectedSale(sale);
    setRefundReason('');
    setRefundAmount(String(sale.paidAmount));
    setShowRefundModal(true);
  };

  const handleRefund = async () => {
    if (!selectedSale || !refundReason.trim()) {
      notify.error('Please provide a reason for the refund');
      return;
    }

    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > selectedSale.paidAmount) {
      notify.error('Please enter a valid refund amount');
      return;
    }

    try {
      await salesApi.refundSale(selectedSale._id, {
        reason: refundReason,
        amount,
      });
      notify.success('Refund processed successfully');
      setShowRefundModal(false);
      loadSales();
    } catch (error: any) {
      notify.error(error.response?.data?.message || 'Failed to process refund');
    }
  };

  const escapeHtml = (value: unknown) => {
    const str = String(value ?? '');
    return str
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  };

  const deriveOrderNumber = (invoiceNumber?: string) => {
    if (!invoiceNumber) return '';
    const digits = invoiceNumber.match(/\d+/g)?.join('') || '';
    if (!digits) return invoiceNumber;
    const short = digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, '0');
    return short;
  };

  const handlePrintInvoice = async (sale: Sale) => {
    setSelectedSale(sale);

    // Open immediately (avoids popup blockers), then fill once invoice data arrives.
    const printWindow = window.open('', '_blank', 'width=420,height=680');
    if (!printWindow) {
      notify.error('Popup blocked. Please allow popups to print.');
      return;
    }

    printWindow.document.write(`<!doctype html><html><head><title>Loading...</title></head><body>Loading...</body></html>`);
    printWindow.document.close();

    try {
      const [invoice, config] = await Promise.all([
        salesApi.getInvoice(sale._id).catch(() => null as Invoice | null),
        configApi.get().catch(() => null),
      ]);

      let localPrintSettings: any = null;
      try {
        const raw = localStorage.getItem('pos_print_settings');
        localPrintSettings = raw ? JSON.parse(raw) : null;
      } catch {
        localPrintSettings = null;
      }

      const businessDetails = config?.businessDetails || localPrintSettings?.businessDetails;
      const invoiceFormat = config?.invoiceFormat || localPrintSettings?.invoiceFormat;

      const configCompany = businessDetails
        ? {
            name: businessDetails.name || '',
            address: businessDetails.address || '',
            phone: businessDetails.phone || '',
            email: businessDetails.email || '',
            logo:
              businessDetails.logo ||
              (businessDetails as any).logoUrl ||
              config?.logo ||
              localPrintSettings?.logo ||
              undefined,
          }
        : null;

      const company = configCompany || invoice?.company;
      const headerText = invoiceFormat?.header || '';
      const footerText = invoiceFormat?.footer || '';
      const saleForReceipt =
        invoice?.sale && typeof invoice.sale === 'object' ? invoice.sale : sale;

      const html = generateThermalReceiptHtml(
        saleForReceipt,
        company || undefined,
        headerText,
        footerText
      );

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      printWindow.focus();
      printWindow.onafterprint = () => {
        try {
          printWindow.close();
        } catch {
          // ignore
        }
      };
      printWindow.print();
    } catch (error) {
      console.error('Print invoice failed:', error);
      notify.error('Failed to print invoice');
      try {
        printWindow.close();
      } catch {
        // ignore
      }
    }
  };

  // ── Download Invoice (saves as HTML file) ────────────────────────────────
  const handleDownloadInvoice = async (sale: Sale) => {
    const toastId = notify.loading('Preparing download...');
    try {
      const [invoice, config] = await Promise.all([
        salesApi.getInvoice(sale._id).catch(() => null as Invoice | null),
        configApi.get().catch(() => null),
      ]);

      let localPrintSettings: any = null;
      try {
        const raw = localStorage.getItem('pos_print_settings');
        localPrintSettings = raw ? JSON.parse(raw) : null;
      } catch {
        localPrintSettings = null;
      }

      const businessDetails = config?.businessDetails || localPrintSettings?.businessDetails;
      const invoiceFormat   = config?.invoiceFormat   || localPrintSettings?.invoiceFormat;

      const configCompany = businessDetails
        ? {
            name:    businessDetails.name    || '',
            address: businessDetails.address || '',
            phone:   businessDetails.phone   || '',
            email:   businessDetails.email   || '',
            logo:
              businessDetails.logo ||
              (businessDetails as any).logoUrl ||
              config?.logo ||
              localPrintSettings?.logo ||
              undefined,
          }
        : null;

      const company    = configCompany || invoice?.company;
      const headerText = invoiceFormat?.header || '';
      const footerText = invoiceFormat?.footer || '';
      const saleForReceipt =
        invoice?.sale && typeof invoice.sale === 'object' ? invoice.sale : sale;

      const html = generateThermalReceiptHtml(
        saleForReceipt,
        company || undefined,
        headerText,
        footerText,
      );

      // Create a Blob and trigger a browser download
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Invoice-${sale.invoiceNumber}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notify.success('Invoice downloaded!', { id: toastId });
    } catch (error) {
      console.error('Download invoice failed:', error);
      notify.error('Failed to download invoice', { id: toastId });
    }
  };

  const generateThermalReceiptHtml = (sale: Sale, company?: Invoice['company'], headerText?: string, footerText?: string) => {
    const orderType = (sale.orderType || (sale as any).saleType) as OrderType | undefined;
    const orderTypeLabel = orderType ? orderType.replaceAll('_', ' ') : 'POS';

    const customer = sale.customer_id && typeof sale.customer_id === 'object'
      ? (sale.customer_id as Customer)
      : null;

    const table = sale.table && typeof sale.table === 'object'
      ? (sale.table as RestaurantTable)
      : null;

    const orderNumber = deriveOrderNumber(sale.invoiceNumber);

    const itemsHtml = sale.items.map((item) => {
      const productName = typeof item.product === 'object' ? (item.product as Product).name : 'Product';
      const safeName = escapeHtml(productName);
      return `
        <div class="item">
          <div class="item-top">
            <div class="name">${safeName}</div>
            <div class="qty">${escapeHtml(item.quantity)}</div>
            <div class="amt">${escapeHtml(formatMoney(item.subtotal))}</div>
          </div>
          <div class="item-sub">${escapeHtml(item.quantity)} x ${escapeHtml(formatMoney(item.price))}</div>
        </div>
      `;
    }).join('');

    const companyName = company?.name ? escapeHtml(company.name) : '';
    const companyAddress = company?.address ? escapeHtml(company.address) : '';
    const companyPhone = company?.phone ? escapeHtml(company.phone) : '';
    const companyEmail = company?.email ? escapeHtml(company.email) : '';
    const companyLogo = company?.logo ? String(company.logo) : '';

    const companyHtml = (companyName || companyAddress || companyPhone || companyEmail || companyLogo)
      ? `
        <div class="company">
          ${companyLogo ? `<div class="logo"><img src="${escapeHtml(companyLogo)}" alt="Logo" /></div>` : ''}
          ${companyName ? `<div class="company-name">${companyName}</div>` : ''}
          ${companyAddress ? `<div class="muted">${companyAddress}</div>` : ''}
          ${companyPhone ? `<div class="muted">Tel: ${companyPhone}</div>` : ''}
          ${companyEmail ? `<div class="muted">${companyEmail}</div>` : ''}
        </div>
      `
      : '';

    const headerLines = String(headerText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const headerHtml = headerLines.length
      ? `<div class="center header">${headerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
      : '';

    const footerLines = String(footerText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const footerHtml = footerLines.length
      ? footerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')
      : '<div>Thank you!</div><div class="muted">Please come again</div>';

    const customerHtml = customer
      ? `<div class="muted">Customer: ${escapeHtml(customer.name)}${customer.phone ? ` (${escapeHtml(customer.phone)})` : ''}</div>`
      : '';

    const tableHtml = table
      ? `<div class="muted">Table: ${escapeHtml(table.tableNumber)}${table.section ? ` (${escapeHtml(table.section)})` : ''}</div>`
      : '';

    const cashierName = typeof sale.createdBy === 'object'
      ? (sale.createdBy as UserRef).name || (sale.createdBy as UserRef).email || (sale.createdBy as UserRef)._id
      : sale.createdBy;

    const cashierHtml = cashierName
      ? `<div class="muted">Cashier: ${escapeHtml(cashierName)}</div>`
      : '';

    const discountHtml = sale.discount > 0
      ? `<div class="row"><span>Discount</span><span>- ${escapeHtml(formatMoney(sale.discount))}</span></div>`
      : '';

    const serviceChargeValue = (sale.serviceCharge || (sale as any).serviceCharge || 0) as number;
    const packagingChargeValue = (sale.packagingCharge || (sale as any).packagingCharge || 0) as number;
    const showPackagingCharge = (orderType === 'TAKEAWAY' || orderType === 'DELIVERY') && packagingChargeValue > 0;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Receipt - ${escapeHtml(sale.invoiceNumber)}</title>
          <style>
            @page { size: 80mm auto; margin: 6mm; }
            html, body { padding: 0; margin: 0; }
            body {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
              color: #000;
              font-size: 12px;
              line-height: 1.25;
            }
            .receipt { width: 100%; }
            .center { text-align: center; }
            .muted { color: #111; opacity: 0.85; }
            .divider { border-top: 1px dashed #000; margin: 10px 0; }
            .company { text-align: center; }
            .header { font-weight: 900; letter-spacing: 0.4px; margin-top: 6px; }
            .company-name { font-weight: 800; font-size: 14px; margin-top: 4px; }
            .logo img { max-width: 160px; max-height: 60px; object-fit: contain; }
            .company .muted { white-space: pre-line; }
            .order-block { border: 2px solid #000; padding: 10px 8px; margin: 10px 0; text-align: center; }
            .order-label { font-weight: 800; letter-spacing: 0.5px; }
            .order-number { font-size: 28px; font-weight: 900; margin-top: 4px; }
            .meta { margin-top: 8px; }
            .meta .row { display: flex; justify-content: space-between; gap: 8px; }
            .meta .row span:last-child { text-align: right; }
            .items-header { display: grid; grid-template-columns: 1fr 44px 72px; gap: 8px; font-weight: 800; }
            .item { margin-top: 8px; }
            .item-top { display: grid; grid-template-columns: 1fr 44px 72px; gap: 8px; }
            .item-top .qty, .item-top .amt { text-align: right; }
            .item-sub { font-size: 11px; opacity: 0.85; margin-top: 2px; }
            .totals { margin-top: 8px; }
            .totals .row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
            .total-due { border-top: 2px solid #000; padding-top: 6px; margin-top: 6px; font-weight: 900; font-size: 14px; }
            .footer { margin-top: 12px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="receipt">
            ${companyHtml}
            ${headerHtml}

            <div class="divider"></div>

            <div class="order-block">
              <div class="order-label">ORDER NUMBER</div>
              <div class="order-number">${escapeHtml(orderNumber || sale.invoiceNumber)}</div>
            </div>

            <div class="meta">
              <div class="row"><span>Date</span><span>${escapeHtml(new Date(sale.createdAt).toLocaleString())}</span></div>
              <div class="row"><span>Invoice</span><span>${escapeHtml(sale.invoiceNumber)}</span></div>
              <div class="row"><span>Order Type</span><span>${escapeHtml(orderTypeLabel)}</span></div>
              ${customerHtml}
              ${tableHtml}
              ${cashierHtml}
            </div>

            <div class="divider"></div>

            <div class="items">
              <div class="items-header">
                <div>ITEM</div>
                <div style="text-align:right;">QTY</div>
                <div style="text-align:right;">AMT</div>
              </div>
              ${itemsHtml}
            </div>

            <div class="divider"></div>

            <div class="totals">
              <div class="row"><span>Subtotal</span><span>${escapeHtml(formatMoney(sale.subtotal))}</span></div>
              ${(sale.taxTotal || 0) > 0 ? `<div class="row"><span>Tax</span><span>${escapeHtml(formatMoney(sale.taxTotal || 0))}</span></div>` : ''}
              ${serviceChargeValue > 0 ? `<div class="row"><span>Service Charge</span><span>${escapeHtml(formatMoney(serviceChargeValue))}</span></div>` : ''}
              ${showPackagingCharge ? `<div class="row"><span>Packaging Charge</span><span>${escapeHtml(formatMoney(packagingChargeValue))}</span></div>` : ''}
              ${discountHtml}
              <div class="row total-due"><span>TOTAL DUE</span><span>${escapeHtml(formatMoney(sale.grandTotal))}</span></div>
              <div class="row"><span>Paid</span><span>${escapeHtml(formatMoney(sale.paidAmount))}</span></div>
              ${sale.balanceAmount > 0 ? `<div class="row"><span>Balance</span><span>${escapeHtml(formatMoney(sale.balanceAmount))}</span></div>` : ''}
            </div>

            <div class="divider"></div>

            <div class="footer">
              ${footerHtml}
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      COMPLETED: { variant: 'success', label: 'Completed' },
      PARTIALLY_PAID: { variant: 'default', label: 'Partially Paid' },
      OPEN: { variant: 'default', label: 'Open' },
      VOIDED: { variant: 'default', label: 'Voided' },
    };
    
    const config = statusMap[status as keyof typeof statusMap] || { variant: 'default', label: status };
    return <Badge variant={config.variant as any}>{config.label}</Badge>;
  };

  const columns = [
    { 
      key: 'invoiceNumber', 
      header: 'Invoice #',
      render: (sale: Sale) => sale.invoiceNumber
    },
    { 
      key: 'createdAt', 
      header: 'Date',
      render: (sale: Sale) => new Date(sale.createdAt).toLocaleDateString()
    },
    { 
      key: 'orderType', 
      header: 'Order Type',
      render: (sale: Sale) => {
        const ot = (sale.orderType || (sale as any).saleType) as string | undefined;
        return ot ? ot.replace('_', ' ') : '-';
      }
    },
    {
      key: 'createdBy',
      header: 'Cashier',
      render: (sale: Sale) => {
        const cashier = sale.createdBy;
        if (!cashier) return '-';
        if (typeof cashier === 'object') return cashier.name || cashier.email || cashier._id || '-';
        return cashier;
      },
    },
    { 
      key: 'items', 
      header: 'Items',
      render: (sale: Sale) => sale.items.length
    },
    { 
      key: 'grandTotal', 
      header: 'Total',
      render: (sale: Sale) => formatMoney(sale.grandTotal)
    },
    {
      // Subtotal = items total BEFORE any discount (subtotal + productDiscount + manualDiscount)
      key: 'subtotal', 
      header: 'Subtotal',
      render: (sale: Sale) => {
        const productDisc = (sale as any).productDiscount || 0;
        const origSubtotal = sale.subtotal + productDisc + (sale.discount || 0);
        return formatMoney(origSubtotal);
      }
    },
    { 
      key: 'discount', 
      header: 'Discount',
      render: (sale: Sale) => {
        const productDisc = (sale as any).productDiscount || 0;
        const manualDisc = sale.discount || 0;
        const total = productDisc + manualDisc;
        if (total <= 0) return <span className="text-slate-400">—</span>;
        return (
          <div className="text-emerald-600 font-semibold text-xs leading-tight">
            <div>-{formatMoney(total)}</div>
            {productDisc > 0 && <div className="text-[10px] text-slate-400">prod: -{formatMoney(productDisc)}</div>}
            {manualDisc > 0 && <div className="text-[10px] text-slate-400">manual: -{formatMoney(manualDisc)}</div>}
          </div>
        );
      }
    },
    { 
      key: 'paidAmount', 
      header: 'Paid',
      render: (sale: Sale) => formatMoney(sale.paidAmount)
    },
    { 
      key: 'status', 
      header: 'Status',
      render: (sale: Sale) => getStatusBadge(sale.status)
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (sale: Sale) => (
        <div className="flex items-center gap-0.5">

          {/* 👁️ View Details */}
          <button
            type="button"
            title="View Details"
            onClick={() => handleViewDetails(sale)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>

          {/* ⬇️ Download Invoice (saves HTML file) */}
          <button
            type="button"
            title="Download Invoice"
            onClick={() => handleDownloadInvoice(sale)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          {/* 🖨️ Print Invoice */}
          <button
            type="button"
            title="Print Invoice"
            onClick={() => handlePrintInvoice(sale)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>

          {/* Refund — only for completed sales */}
          {sale.status === 'COMPLETED' && (
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => handleRefundClick(sale)}
            >
              Refund
            </Button>
          )}

          {/* Void — hide when already voided */}
          {sale.status !== 'VOIDED' && (
            <button
              type="button"
              title="Void Sale"
              onClick={() => handleVoidClick(sale)}
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-9 0V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12a1 1 0 001 .917h6a1 1 0 001-.917l1-12" />
              </svg>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Sales History"
        subtitle="View and manage all sales transactions"
      />

      <PageContent>
        {/* ── Filter Bar ── */}
        <div className="mb-10 sm:mb-12 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {/* Filter header / toggle */}
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Invoice search always visible */}
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                placeholder="Search Invoice #"
              />
            </div>

            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                filtersOpen ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Filters
              {/* Active filter count badge */}
              {(() => {
                const count = [filters.status, filters.orderType, filters.from, filters.to].filter(Boolean).length;
                return count > 0 ? (
                  <span className={`inline-flex items-center justify-center h-5 min-w-[20px] rounded-full px-1.5 text-xs font-bold ${
                    filtersOpen ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'
                  }`}>{count}</span>
                ) : null;
              })()}
            </button>

            {/* Clear — only if any filter is active */}
            {(filters.status || filters.orderType || filters.from || filters.to || invoiceSearch) && (
              <button
                onClick={() => { setInvoiceSearch(''); setFilters({ page: 1, limit: 20 }); }}
                className="text-xs font-semibold text-red-500 hover:text-red-700 px-2 py-2 rounded-lg hover:bg-red-50 transition"
              >
                Clear
              </button>
            )}
          </div>

          {/* Collapsible filter panel */}
          {filtersOpen && (
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                <select
                  value={filters.status || ''}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value as any, page: 1 })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">All Status</option>
                  <option value="OPEN">Open</option>
                  <option value="PARTIALLY_PAID">Partially Paid</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="VOIDED">Voided</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Order Type</label>
                <select
                  value={filters.orderType || ''}
                  onChange={(e) => setFilters({ ...filters, orderType: (e.target.value || undefined) as any, page: 1 })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">All Order Types</option>
                  <option value="DINE_IN">Dine In</option>
                  <option value="TAKEAWAY">Takeaway</option>
                  <option value="DELIVERY">Delivery</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">From Date</label>
                <input
                  type="date"
                  value={filters.from || ''}
                  onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">To Date</label>
                <input
                  type="date"
                  value={filters.to || ''}
                  onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          )}
        </div>

        <div className="mb-6 sm:mb-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <Table
            columns={columns}
            data={displayedSales}
            keyExtractor={(sale) => sale._id}
            loading={loading}
            emptyMessage="No sales found"
          />
        </div>

        {/* ── Pagination ── */}
        {!invoiceSearch.trim() && totalSales > (filters.limit || 20) && (() => {
          const totalPages = Math.ceil(totalSales / (filters.limit || 20));
          const page = currentPage;

          // Build page number list with ellipsis
          const pageNums: (number | '...')[] = [];
          if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pageNums.push(i);
          } else {
            pageNums.push(1);
            if (page > 3) pageNums.push('...');
            for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pageNums.push(i);
            if (page < totalPages - 2) pageNums.push('...');
            pageNums.push(totalPages);
          }

          return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                {/* Info */}
                <p className="text-slate-500 text-xs sm:text-sm order-2 sm:order-1">
                  Showing {Math.min((page - 1) * (filters.limit || 20) + 1, totalSales)}–{Math.min(page * (filters.limit || 20), totalSales)} of {totalSales} sales
                </p>

                {/* Page buttons — responsive wrapping */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1 order-1 sm:order-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setFilters({ ...filters, page: page - 1 })}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 sm:px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="Previous page"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    <span className="hidden sm:inline">Prev</span>
                  </button>

                  {pageNums.map((n, i) =>
                    n === '...' ? (
                      <span key={`e${i}`} className="px-1 sm:px-2 py-1.5 text-slate-400 text-xs">…</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setFilters({ ...filters, page: n as number })}
                        className={`h-8 w-8 rounded-lg text-xs font-semibold transition ${
                          n === page
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-300 text-slate-700 hover:bg-slate-50 active:scale-95'
                        }`}
                        aria-current={n === page ? 'page' : undefined}
                      >
                        {n}
                      </button>
                    )
                  )}

                  <button
                    disabled={page >= totalPages}
                    onClick={() => setFilters({ ...filters, page: page + 1 })}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 sm:px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="Next page"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>

                {/* Rows per page */}
                <div className="flex items-center justify-center sm:justify-end gap-2 order-3">
                  <label htmlFor="page-size" className="text-slate-500 text-xs sm:text-sm font-medium">Rows per page:</label>
                  <select
                    id="page-size"
                    value={filters.limit || 20}
                    onChange={(e) => setFilters({ ...filters, limit: Number(e.target.value), page: 1 })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                  >
                    {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Void Sale Modal */}
        <Modal
          isOpen={showVoidModal}
          onClose={() => setShowVoidModal(false)}
          title="Void Sale"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Invoice: {selectedSale?.invoiceNumber}
            </p>
            <p className="text-sm text-gray-600">
              Amount: {formatMoney(selectedSale?.grandTotal)}
            </p>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Reason for Voiding *
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full border rounded px-3 py-2"
                rows={3}
                placeholder="Enter reason..."
                required
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowVoidModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVoidSale}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Void Sale
              </button>
            </div>
          </div>
        </Modal>

        {/* Sale Detail Modal */}
        <Modal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title={`Sale Details - ${selectedSale?.invoiceNumber || ''}`}
        >
          {selectedSale && (
            <div className="space-y-4">
              {/* Sale Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Date:</span>
                  <span className="ml-2">{new Date(selectedSale.createdAt).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>
                  <span className="ml-2">{selectedSale.status}</span>
                </div>
                <div>
                  <span className="text-gray-500">Cashier:</span>
                  <span className="ml-2">
                    {typeof selectedSale.createdBy === 'object'
                      ? (selectedSale.createdBy as UserRef).name || (selectedSale.createdBy as UserRef).email || (selectedSale.createdBy as UserRef)._id
                      : selectedSale.createdBy}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Order Type:</span>
                  <span className="ml-2">{(selectedSale.orderType || (selectedSale as any).saleType || 'POS').toString().replace('_', ' ')}</span>
                </div>

                {selectedSale.customer_id && typeof selectedSale.customer_id === 'object' && (
                  <div>
                    <span className="text-gray-500">Customer:</span>
                    <span className="ml-2">{(selectedSale.customer_id as Customer).name}</span>
                  </div>
                )}

                {selectedSale.table && typeof selectedSale.table === 'object' && (
                  <div>
                    <span className="text-gray-500">Table:</span>
                    <span className="ml-2">
                      {(selectedSale.table as RestaurantTable).tableNumber}
                      {(selectedSale.table as RestaurantTable).section
                        ? ` (${(selectedSale.table as RestaurantTable).section})`
                        : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <h4 className="font-medium mb-2">Items</h4>
                <div className="border rounded max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Item</th>
                        <th className="text-center p-2">Qty</th>
                        <th className="text-right p-2">Price</th>
                        <th className="text-right p-2">DIS</th>
                        <th className="text-right p-2">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSale.items.map((item, idx) => {
                        const productName = typeof item.product === 'object' ? (item.product as Product).name : 'Product';
                        const hasDiscount = item.originalPrice != null && item.originalPrice > item.price;
                        const discountAmount = hasDiscount ? (item.originalPrice! - item.price) * item.quantity : 0;
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{productName}</td>
                            <td className="text-center p-2">{item.quantity}</td>
                            <td className="text-right p-2">{formatMoney(item.price)}</td>
                            <td className={`text-right p-2 ${hasDiscount ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
                              {hasDiscount ? `-${formatMoney(discountAmount)}` : ''}
                            </td>
                            <td className="text-right p-2">{formatMoney(item.subtotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-1 text-sm">
                {/* Subtotal = original price before any discount */}
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatMoney(
                    selectedSale.subtotal +
                    ((selectedSale as any).productDiscount || 0) +
                    (selectedSale.discount || 0)
                  )}</span>
                </div>

                {/* Product-level discounts (from backend productDiscount field) */}
                {((selectedSale as any).productDiscount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Product Discount:</span>
                    <span>- {formatMoney((selectedSale as any).productDiscount)}</span>
                  </div>
                )}

                {/* Manual / coupon discount */}
                {(selectedSale.discount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Manual Discount:</span>
                    <span>- {formatMoney(selectedSale.discount)}</span>
                  </div>
                )}

                {/* Service Charge — only show if > 0 */}
                {(selectedSale.serviceCharge || 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Service Charge:</span>
                    <span>{formatMoney(selectedSale.serviceCharge || 0)}</span>
                  </div>
                )}

                {/* Packaging Charge — only show if > 0 */}
                {(selectedSale.packagingCharge || 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Packaging Charge:</span>
                    <span>{formatMoney(selectedSale.packagingCharge || 0)}</span>
                  </div>
                )}

                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Grand Total:</span>
                  <span>{formatMoney(selectedSale.grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid:</span>
                  <span>{formatMoney(selectedSale.paidAmount)}</span>
                </div>
                {selectedSale.balanceAmount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Balance Due:</span>
                    <span>{formatMoney(selectedSale.balanceAmount)}</span>
                  </div>
                )}
              </div>

              {/* Payments */}
              {selectedSale.payments && selectedSale.payments.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Payments</h4>
                  <div className="space-y-1 text-sm">
                    {selectedSale.payments.map((payment, idx) => (
                      <div key={idx} className="flex justify-between bg-gray-50 p-2 rounded">
                        <span className="capitalize">{(payment as any).method?.toLowerCase() || payment.paymentMethod || 'Cash'}</span>
                        <span>{formatMoney(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Refunds */}
              {selectedSale.refunds && selectedSale.refunds.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-red-600">Refunds</h4>
                  <div className="space-y-1 text-sm">
                    {selectedSale.refunds.map((refund, idx) => (
                      <div key={idx} className="bg-red-50 p-2 rounded">
                        <div className="flex justify-between">
                          <span>{new Date((refund as any).date || (refund as any).refundDate || Date.now()).toLocaleDateString()}</span>
                          <span>- {formatMoney(refund.amount)}</span>
                        </div>
                        <p className="text-gray-600 text-xs">{refund.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-4">
                <Button onClick={() => setShowDetailModal(false)}>Close</Button>
                <Button onClick={() => handlePrintInvoice(selectedSale)}>Print Invoice</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Refund Modal */}
        <Modal
          isOpen={showRefundModal}
          onClose={() => setShowRefundModal(false)}
          title="Process Refund"
        >
          {selectedSale && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-600">
                  Invoice: <strong>{selectedSale.invoiceNumber}</strong>
                </p>
                <p className="text-sm text-gray-600">
                  Paid Amount: <strong>{formatMoney(selectedSale.paidAmount)}</strong>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Refund Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedSale.paidAmount}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Max refundable: {formatMoney(selectedSale.paidAmount)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Reason for Refund *
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  placeholder="Enter refund reason..."
                  required
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRefund}
                  disabled={
                    !refundReason.trim() ||
                    !Number.isFinite(Number(refundAmount)) ||
                    Number(refundAmount) <= 0 ||
                    Number(refundAmount) > selectedSale.paidAmount
                  }
                  className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                >
                  Process Refund
                </button>
              </div>
            </div>
          )}
        </Modal>
      </PageContent>
    </Layout>
  );
};

export default SalesPage;
