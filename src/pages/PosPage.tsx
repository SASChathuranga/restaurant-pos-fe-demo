import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import notify from "../utils/notify";
import { useAuthStore } from "../store/auth.store";
import { useCartStore } from "../store/cart.store";
import Sidebar from "../components/Sidebar";
import api from "../api/axios";
import { createSale, getSaleById, getInvoice, paySale } from "../api/sales.api";
import { categoriesApi, configApi, inventoryApi } from "../api";
import { tablesApi } from "../api/tables.api";
import { shiftsApi } from "../api/shifts.api";
import { customersApi } from "../api/customers.api";
import { loyaltyApi } from "../api/loyalty.api";
import { couponsApi, type CouponValidationResult } from "../api/coupons.api";
import { reservationsApi } from "../api/reservations.api";
import { kitchenApi } from "../api/kitchen.api";
import { PERMISSIONS } from "../types";
import type { Category, RestaurantTable, Shift, Customer, Reservation, ReservationFormData, ReservationStatus, KitchenOrder, Sale, Invoice, Discount } from "../types";
import { formatMoney } from "../money";

type Product = {
  _id: string;
  name: string;
  price: number;
  category?: string | { _id: string; name: string };
  discount?: string | Discount | null;
  taxRate?: number;
  lowStockThreshold?: number;
  lowStock?: boolean;
  isAvailable?: boolean;
  trackStock?: boolean;
  stockQuantity?: number;
  outOfStock?: boolean;
};

type PaymentMethod = 'CASH' | 'CARD' | 'BANK' | 'UPI' | 'WALLET' | 'SPLIT';
type ManualDiscountType = 'PERCENTAGE' | 'FLAT' | '';  // Changed FIXED to FLAT to match backend

type CustomerOption = {
  _id: string;
  name: string;
  phone: string;
  tier: string;
  loyaltyPoints?: number;
};

export default function PosPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsViewer, setReservationsViewer] = useState<Reservation[]>([]);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  // Order options
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [discountType, setDiscountType] = useState<ManualDiscountType>('');
  const [discountValue, setDiscountValue] = useState('');
  const [couponCode, setCouponCode] = useState<string>("");
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('TAKEAWAY');
  const [serviceCharge, setServiceCharge] = useState(0);
  const [serviceChargeType, setServiceChargeType] = useState<'FIXED' | 'PERCENTAGE'>('PERCENTAGE');
  const [packagingCharge, setPackagingCharge] = useState(0);
  const [packagingChargeType, setPackagingChargeType] = useState<'FIXED' | 'PERCENTAGE'>('PERCENTAGE');
  const [pointsMultiplierByTier, setPointsMultiplierByTier] = useState({
    BASIC: 1,
    SILVER: 1,
    GOLD: 1,
    PLATINUM: 1,
  } as Record<'BASIC' | 'SILVER' | 'GOLD' | 'PLATINUM', number>);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Coupon validation
  const [couponValidation, setCouponValidation] = useState<CouponValidationResult | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  
  // Customer selection & Loyalty
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState<string>("");
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [selectedCustomerLoyalty, setSelectedCustomerLoyalty] = useState<number | null>(null);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [showCustomerDetailsModal, setShowCustomerDetailsModal] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ name: "", phone: "", email: "" });
  
  // Loyalty Points Payment
  const [usePoints, setUsePoints] = useState(false);
  const [pointsToUse, setPointsToUse] = useState<number>(0);
  
  // Table orders (tracking items for occupied tables before creating sale)
  type TableOrder = {
    tableId: string;
    items: Array<{ _id: string; name: string; price: number; taxRate?: number; quantity: number }>;
  };
  const [tableOrders, setTableOrders] = useState<TableOrder[]>([]);
  const [tableSaleIdByTable, setTableSaleIdByTable] = useState<Record<string, string>>({});
  
  // Table bill/payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [selectedTableForPayment, setSelectedTableForPayment] = useState<RestaurantTable | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [quickView, setQuickView] = useState<{ title: string; path: string } | null>(null);

  // Prevent duplicate submissions
  const [creatingSale, setCreatingSale] = useState(false);
  const creatingSaleRef = useRef(false);
  const [addingToTable, setAddingToTable] = useState(false);
  const addingToTableRef = useRef(false);
  
  // Shift modal
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [openingCash, setOpeningCash] = useState<string>("");
  const [processingShift, setProcessingShift] = useState(false);

  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [closingCash, setClosingCash] = useState<string>("");
  const [processingCloseShift, setProcessingCloseShift] = useState(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Logout confirmation
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Post-payment actions (no auto-print)
  const [postPaymentSale, setPostPaymentSale] = useState<Sale | null>(null);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printingKitchen, setPrintingKitchen] = useState(false);
  const [showCollectCashModal, setShowCollectCashModal] = useState(false);
  const [collectAmountGiven, setCollectAmountGiven] = useState<number>(0);

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

  const getLocalDayKey = (value: string | Date) => {
    const d = value instanceof Date ? value : new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const buildDailyKitchenSequenceMap = (orders: KitchenOrder[]) => {
    const groups = new Map<string, KitchenOrder[]>();
    for (const order of orders) {
      const key = getLocalDayKey(order.createdAt);
      const list = groups.get(key);
      if (list) list.push(order);
      else groups.set(key, [order]);
    }

    const map: Record<string, number> = {};
    for (const [, list] of groups) {
      list
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .forEach((order, idx) => {
          map[order._id] = (idx % 1000) + 1;
        });
    }
    return map;
  };

  const generateThermalReceiptHtml = (sale: Sale, company?: Invoice['company'], headerText?: string, footerText?: string) => {
    const rawOrderType = ((sale.orderType || (sale as any).saleType) as string | undefined) || '';
    const orderTypeLabel = rawOrderType ? rawOrderType.replaceAll('_', ' ') : 'POS';
    const orderNumber = deriveOrderNumber(sale.invoiceNumber);

    const packagingChargeValue = (sale.packagingCharge || 0) as number;
    const showPackagingCharge =
      (rawOrderType === 'TAKEAWAY' || rawOrderType === 'DELIVERY') && packagingChargeValue > 0;

    const customer = sale.customer_id && typeof sale.customer_id === 'object'
      ? (sale.customer_id as any)
      : null;

    const table = sale.table && typeof sale.table === 'object'
      ? (sale.table as any)
      : null;

    const itemsHtml = sale.items.map((item: any) => {
      const productName = typeof item.product === 'object'
        ? (item.product?.name ?? 'Product')
        : 'Product';

      return `
        <div class="item">
          <div class="item-top">
            <div class="name">${escapeHtml(productName)}</div>
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

    const customerHtml = customer
      ? `<div class="muted">Customer: ${escapeHtml(customer.name)}${customer.phone ? ` (${escapeHtml(customer.phone)})` : ''}</div>`
      : '';

    const tableHtml = table
      ? `<div class="muted">Table: ${escapeHtml(table.tableNumber)}${table.section ? ` (${escapeHtml(table.section)})` : ''}</div>`
      : '';

    const headerLines = String(headerText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const headerHtml = headerLines.length
      ? `<div class="header">${headerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
      : '';

    const footerLines = String(footerText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const footerHtml = footerLines.length
      ? footerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')
      : '<div>Thank you!</div><div class="muted">Please come again</div>';

    return `
      <!DOCTYPE html>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="touch-manipulation hidden sm:flex items-center gap-2 rounded-2xl bg-slate-100 px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200 transition-all hover-lift active:scale-95 shadow-sm border border-slate-200"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <button
        type="button"
        onClick={() => setIsFullscreen((value) => !value)}
        className="touch-manipulation hidden sm:flex items-center gap-2 rounded-2xl bg-slate-100 px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200 transition-all hover-lift active:scale-95 shadow-sm border border-slate-200"
      >
        {isFullscreen ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h6m-6 6h6m3-12v3m0 0h-3m3 0l-4 4m-8 0l4-4m-4 0h3m-3 0V3m0 18v-3m0 0h3m-3 0l4-4m8 0l-4 4m4 0h-3m3 0v3" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        )}
      </button>
            .muted { color: #111; opacity: 0.85; }
            .divider { border-top: 1px dashed #000; margin: 10px 0; }
            .company { text-align: center; }
            .header { text-align: center; font-weight: 900; letter-spacing: 0.4px; margin-top: 6px; }
            .company-name { font-weight: 800; font-size: 14px; margin-top: 4px; }
            .logo img { max-width: 160px; max-height: 60px; object-fit: contain; }
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
              ${(sale.serviceCharge || 0) > 0 ? `<div class="row"><span>Service Charge</span><span>${escapeHtml(formatMoney(sale.serviceCharge || 0))}</span></div>` : ''}
              ${showPackagingCharge ? `<div class="row"><span>Packaging Charge</span><span>${escapeHtml(formatMoney(packagingChargeValue))}</span></div>` : ''}
              ${sale.discount > 0 ? `<div class="row"><span>Discount</span><span>- ${escapeHtml(formatMoney(sale.discount))}</span></div>` : ''}
              <div class="row total-due"><span>TOTAL DUE</span><span>${escapeHtml(formatMoney(sale.grandTotal))}</span></div>
              <div class="row"><span>Paid</span><span>${escapeHtml(formatMoney(sale.paidAmount))}</span></div>
              ${sale.balanceAmount > 0 ? `<div class="row"><span>Balance</span><span>${escapeHtml(formatMoney(sale.balanceAmount))}</span></div>` : ''}
            </div>
            <div class="divider"></div>
            <div class="footer">${footerHtml}</div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintReceipt = async () => {
    if (!postPaymentSale || printingReceipt) return;

    setPrintingReceipt(true);
    const printWindow = window.open('', '_blank', 'width=420,height=680');
    if (!printWindow) {
      notify.error('Popup blocked. Please allow popups to print.');
      setPrintingReceipt(false);
      return;
    }

    printWindow.document.write(`<!doctype html><html><head><title>Loading...</title></head><body>Loading...</body></html>`);
    printWindow.document.close();

    try {
      const [invoice, config] = await Promise.all([
        getInvoice(postPaymentSale._id).catch(() => null as Invoice | null),
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

      const html = generateThermalReceiptHtml((invoice?.sale as Sale) ?? postPaymentSale, company || undefined, headerText, footerText);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.onafterprint = () => {
        try { printWindow.close(); } catch { /* ignore */ }
      };
      printWindow.print();
    } catch (error) {
      console.error('Print receipt failed:', error);
      notify.error('Failed to print receipt');
      try { printWindow.close(); } catch { /* ignore */ }
    } finally {
      setPrintingReceipt(false);
    }
  };

  // Touch/quick actions
  const [showTablesModal, setShowTablesModal] = useState(false);
  const [tablesTab, setTablesTab] = useState<'available' | 'active' | 'cleaning'>('available');
  // View order on an active table
  const [viewOrderTable, setViewOrderTable] = useState<{ table: RestaurantTable; items: any[]; total: number } | null>(null);
  const [loadingViewOrder, setLoadingViewOrder] = useState(false);
  // Reservations viewer (read-only for cashier)
  const [showReservationsViewer, setShowReservationsViewer] = useState(false);
  const [loadingReservationsViewer, setLoadingReservationsViewer] = useState(false);
  const [reservationsViewerStatusFilter, setReservationsViewerStatusFilter] = useState<'ALL' | ReservationStatus>('ALL');
  const [showReservationEditor, setShowReservationEditor] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [reservationFormData, setReservationFormData] = useState<ReservationFormData>({
    tableId: '',
    customerName: '',
    customerPhone: '',
    guestCount: 1,
    reservationDateTime: '',
    notes: '',
  });
  const [savingReservation, setSavingReservation] = useState(false);
  // Kitchen orders viewer (read-only for cashier)
  const [showKitchenViewer, setShowKitchenViewer] = useState(false);
  const [kitchenOrders, setKitchenOrders] = useState<KitchenOrder[]>([]);
  const [loadingKitchen, setLoadingKitchen] = useState(false);
  const [kitchenStatusFilter, setKitchenStatusFilter] = useState<'ALL' | 'PENDING' | 'PREPARING' | 'READY'>('ALL');
  const [kitchenViewMode, setKitchenViewMode] = useState<'QUEUE' | 'TABLES'>('QUEUE');
  const [kitchenBillPrintingEnabled, setKitchenBillPrintingEnabled] = useState(true);
  const cartSectionRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const customerSearchRef = useRef<HTMLInputElement | null>(null);
  const [isLgLayout, setIsLgLayout] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [mobileTab, setMobileTab] = useState<'products' | 'cart' | 'tables' | 'orders'>('products');
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);
  const [showSidebarMenu, setShowSidebarMenu] = useState(false);

  const kitchenDailySequenceMap = useMemo(() => buildDailyKitchenSequenceMap(kitchenOrders), [kitchenOrders]);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    setIsLgLayout(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsLgLayout(e.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }

    // Safari < 14
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(handler);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(handler);
  }, []);

  const isDineInKitchenOrder = (order: KitchenOrder) => {
    if (order.tableNumber) return true;
    if (typeof order.sale === 'object' && order.sale) {
      return (order.sale as any).orderType === 'DINE_IN' || Boolean((order.sale as any).table);
    }
    return false;
  };

  useEffect(() => {
    if (!showKitchenViewer) return;
    const active = kitchenOrders.filter((o) => o.status !== 'SERVED');
    const tableCount = active.filter(isDineInKitchenOrder).length;
    const queueCount = active.length - tableCount;

    // If there are only table orders, open Table View automatically
    if (kitchenViewMode === 'QUEUE' && queueCount === 0 && tableCount > 0) {
      setKitchenViewMode('TABLES');
    }
  }, [showKitchenViewer, kitchenOrders, kitchenViewMode]);

  const handlePrintKitchenOrder = async (order: KitchenOrder) => {
    if (!kitchenBillPrintingEnabled) {
      notify.error('Kitchen printing is disabled in Settings');
      return;
    }

    try {
      const cfg = await configApi.get().catch(() => null);
      const businessName = cfg?.businessDetails?.name || '';
      const businessPhone = cfg?.businessDetails?.phone || '';

      const saleInvoiceNumber = typeof order.sale === 'object' && order.sale ? (order.sale as any).invoiceNumber : '';
      const dailySeq = kitchenDailySequenceMap[order._id];
      const orderNo = (order as any).orderNumber || (dailySeq ? String(dailySeq) : '') || saleInvoiceNumber || '';
      const tableText = order.tableNumber ? `Table ${order.tableNumber}${order.section ? ` (${order.section})` : ''}` : '';
      const created = order.createdAt ? new Date(order.createdAt) : null;
      const createdText = created && !Number.isNaN(created.getTime()) ? created.toLocaleString() : '';

      const escapeHtml = (value: any) =>
        String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

      const itemsHtml = (order.items || [])
        .map((it) => `
          <tr>
            <td class="name">${escapeHtml(it.name)}</td>
            <td class="qty">${escapeHtml(it.quantity)}</td>
          </tr>
        `)
        .join('');

      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Kitchen Print</title>
            <style>
              @page { size: 80mm auto; margin: 4mm; }
              html, body { padding: 0; margin: 0; }
              body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; color: #000; }
              .center { text-align: center; }
              .title { font-weight: 900; font-size: 16px; letter-spacing: 0.6px; }
              .sub { font-size: 12px; margin-top: 2px; }
              .divider { border-top: 1px dashed #000; margin: 8px 0; }
              .order-no { font-weight: 900; font-size: 18px; letter-spacing: 0.6px; margin-top: 6px; }
              table { width: 100%; border-collapse: collapse; }
              td { padding: 4px 0; vertical-align: top; }
              .name { width: 78%; }
              .qty { width: 22%; text-align: right; font-weight: 900; }
              .meta { font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="center">
              ${businessName ? `<div class="title">${escapeHtml(businessName)}</div>` : `<div class="title">KITCHEN ORDER</div>`}
              ${businessPhone ? `<div class="sub">Tel: ${escapeHtml(businessPhone)}</div>` : ''}
              <div class="order-no">${orderNo ? `ORDER # ${escapeHtml(orderNo)}` : 'ORDER'}</div>
            </div>
            <div class="divider"></div>
            <div class="meta">
              ${tableText ? `<div>${escapeHtml(tableText)}</div>` : ''}
              ${createdText ? `<div>${escapeHtml(createdText)}</div>` : ''}
              <div>Status: ${escapeHtml(order.status)}</div>
            </div>
            <div class="divider"></div>
            <table>
              ${itemsHtml}
            </table>
            <div class="divider"></div>
            <div class="center sub">(Kitchen Copy)</div>
          </body>
        </html>
      `;

      // Print without popups (avoids popup-blocker issues)
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc || !iframe.contentWindow) {
        try { document.body.removeChild(iframe); } catch { /* ignore */ }
        notify.error('Unable to start printing');
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      iframe.contentWindow.focus();
      iframe.contentWindow.print();

      window.setTimeout(() => {
        try { document.body.removeChild(iframe); } catch { /* ignore */ }
      }, 1000);
    } catch (e) {
      console.error('Kitchen print failed:', e);
      notify.error('Failed to print kitchen order');
    }
  };

  const openQuickView = (title: string, path: string) => {
    setQuickView({ title, path });
  };

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const increaseQty = useCartStore((s) => s.increaseQty);
  const decreaseQty = useCartStore((s) => s.decreaseQty);
  const setQty = useCartStore((s) => s.setQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const subtotal = useCartStore((s) => s.subtotal);
  const taxTotal = useCartStore((s) => s.taxTotal);
  const productDiscountTotal = useCartStore((s) => s.productDiscountTotal);

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }

    const loadData = async () => {
      try {
        const fetchAllProducts = async () => {
          const limit = 200;
          const maxPages = 50;
          const all: Product[] = [];

          for (let page = 1; page <= maxPages; page += 1) {
            const res = await api.get('/products', { params: { page, limit } });
            const batch = (res?.data?.products || []) as Product[];
            all.push(...batch);

            const pages = res?.data?.pagination?.pages;
            if (typeof pages === 'number' && Number.isFinite(pages)) {
              if (page >= pages) break;
            } else {
              // Fallback if backend doesn't return pagination
              if (batch.length < limit) break;
            }
          }

          return all;
        };

        const [productsList, activeCategoriesRes, inactiveCategoriesRes, tablesRes, shiftRes, customersRes, reservationsRes, configRes, inventoryRes] = await Promise.all([
          fetchAllProducts().catch(() => [] as Product[]),
          categoriesApi.getAll({ isActive: true }).catch(() => []),
          categoriesApi.getAll({ isActive: false }).catch(() => []),
          tablesApi.getAll(),
          shiftsApi.getCurrent().catch(() => null),
          customersApi.getAll({ limit: 100 }).catch(() => ({ customers: [] })),
          reservationsApi.getAll().catch(() => []),
          configApi.get().catch(() => null),
          inventoryApi.getAll().catch(() => []),
        ]);

        const flattenCats = (cats: Category[]): Category[] => {
          const out: Category[] = [];
          const walk = (arr: Category[]) => {
            for (const c of arr || []) {
              out.push(c);
              if (Array.isArray(c.children) && c.children.length) walk(c.children);
            }
          };
          if (Array.isArray(cats)) walk(cats);
          return out;
        };

        // Store a flat list so we always have inactive category IDs available
        const mergedCategoryMap = new Map<string, Category>();
        [...flattenCats(activeCategoriesRes || []), ...flattenCats(inactiveCategoriesRes || [])].forEach((c) => {
          mergedCategoryMap.set(c._id, c);
        });
        const mergedCategories = Array.from(mergedCategoryMap.values());

        const inventoryByProductId = new Map<string, number>();
        (inventoryRes || []).forEach((inv) => {
          const productId = typeof inv.product === 'object' && inv.product ? inv.product._id : String(inv.product);
          inventoryByProductId.set(productId, inv.stockQuantity);
        });

        const mergedProducts = (productsList || []).map((p: Product) => {
          if (p.trackStock === true) {
            const qty = inventoryByProductId.get(p._id);
            if (typeof qty === 'number') {
              const outOfStock = qty <= 0;
              const lowStock = !outOfStock && typeof p.lowStockThreshold === 'number' ? qty <= p.lowStockThreshold : false;
              return { ...p, stockQuantity: qty, outOfStock, lowStock };
            }
          }
          return p;
        });

        setProducts(mergedProducts);
        setCategories(mergedCategories);
        setTables(tablesRes || []);
        setCurrentShift(shiftRes);
        // Store active reservations (CONFIRMED or SEATED)
        const activeReservations = (reservationsRes || []).filter(
          (r: Reservation) => r.status === 'CONFIRMED' || r.status === 'SEATED'
        );
        setReservations(activeReservations);
        setCustomers(
          (customersRes.customers || [])
            .filter((c: Customer) => !c.isWalkIn && c.status === 'ACTIVE')
            .map((c: Customer) => ({
              _id: c._id,
              name: c.name,
              phone: c.phone,
              tier: c.tier,
            }))
        );
        setServiceCharge(typeof configRes?.serviceCharge === 'number' ? configRes.serviceCharge : 0);
        setServiceChargeType((configRes?.serviceChargeType as 'FIXED' | 'PERCENTAGE') || 'PERCENTAGE');
        setPackagingCharge(typeof configRes?.packagingCharge === 'number' ? configRes.packagingCharge : 0);
        setPackagingChargeType((configRes?.packagingChargeType as 'FIXED' | 'PERCENTAGE') || 'PERCENTAGE');
        setKitchenBillPrintingEnabled(typeof configRes?.kitchenBillPrintingEnabled === 'boolean' ? configRes.kitchenBillPrintingEnabled : true);

        const m = (configRes as any)?.pointsMultiplierByTier;
        if (m && typeof m === 'object') {
          setPointsMultiplierByTier({
            BASIC: typeof m.BASIC === 'number' ? m.BASIC : 1,
            SILVER: typeof m.SILVER === 'number' ? m.SILVER : 1,
            GOLD: typeof m.GOLD === 'number' ? m.GOLD : 1,
            PLATINUM: typeof m.PLATINUM === 'number' ? m.PLATINUM : 1,
          });
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, navigate]);

  // Handle incoming navigation state (from Tables page "Close & Pay")
  useEffect(() => {
    const state = location.state as { tableId?: string; saleId?: string; action?: string } | null;
    if (state?.tableId && tables.length > 0) {
      // Set the table as selected
      setSelectedTable(state.tableId);
      setOrderType('DINE_IN');
      
      // If action is 'pay', open the payment modal for this table
      if (state.action === 'pay') {
        const table = tables.find(t => t._id === state.tableId);
        if (table) {
          // Trigger payment flow for this table
          handleOpenTableBill(table);
        }
      }
      
      // Clear the location state to prevent re-triggering
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, tables]);

  // Fetch loyalty points when customer is selected
  useEffect(() => {
    const fetchLoyalty = async () => {
      if (selectedCustomerId) {
        try {
          const account = await loyaltyApi.getAccount(selectedCustomerId);
          setSelectedCustomerLoyalty(account?.pointsBalance || 0);
        } catch {
          setSelectedCustomerLoyalty(0);
        }
      } else {
        setSelectedCustomerLoyalty(null);
      }
    };
    fetchLoyalty();
  }, [selectedCustomerId]);

  // Re-validate coupon when cart changes
  useEffect(() => {
    const revalidateCoupon = async () => {
      if (couponValidation?.success && couponCode.trim()) {
        const orderTotal = subtotal() + taxTotal();
        if (orderTotal > 0) {
          try {
            const result = await couponsApi.validate(couponCode.trim(), orderTotal);
            setCouponValidation(result);
          } catch {
            // Keep existing validation if re-validation fails
          }
        }
      }
    };
    revalidateCoupon();
  }, [items]); // Re-validate when items change

  // Keyboard shortcuts for POS efficiency
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      switch (e.key) {
        case 'Escape':
          if (showCartDrawer) {
            e.preventDefault();
            setShowCartDrawer(false);
          }
          break;
        case 'F1':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'F2':
          e.preventDefault();
          if (items.length > 0 && currentShift) {
            if (isPayingTable) handleTablePayment();
            else if (orderType === 'DINE_IN' && selectedTable) handleAddToTable();
            else handleCreateSale();
          }
          break;
        case 'F3':
          e.preventDefault();
          if (!isTyping) {
            setDiscountType(prev => prev ? '' : 'PERCENTAGE');
          }
          break;
        case 'F4':
          e.preventDefault();
          if (!isTyping && items.length > 0) {
            clearCart();
            setSelectedTableForPayment(null);
            setShowPaymentModal(false);
            notify.success('Cart cleared');
          }
          break;
        case 'F5':
          e.preventDefault();
          customerSearchRef.current?.focus();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, currentShift, selectedTableForPayment, orderType, selectedTable, showCartDrawer]);

  const handleOpenShift = async () => {
    const openingCashNumber = openingCash === "" ? 0 : Number(openingCash);

    if (!Number.isFinite(openingCashNumber)) {
      notify.error("Opening cash amount is invalid");
      return;
    }

    if (openingCashNumber < 0) {
      notify.error("Opening cash cannot be negative");
      return;
    }
    
    setProcessingShift(true);
    try {
      const shift = await shiftsApi.open(openingCashNumber);
      setCurrentShift(shift);
      setShowShiftModal(false);
      setOpeningCash("");
      notify.success("Shift opened successfully!");
    } catch (error: any) {
      notify.error(error?.response?.data?.message || "Failed to open shift");
    } finally {
      setProcessingShift(false);
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift) {
      notify.error("No open shift");
      return;
    }

    if (closingCash.trim() === "") {
      notify.error("Closing cash amount is required");
      return;
    }

    const closingCashNumber = Number(closingCash);

    if (!Number.isFinite(closingCashNumber)) {
      notify.error("Closing cash amount is invalid");
      return;
    }

    if (closingCashNumber < 0) {
      notify.error("Closing cash cannot be negative");
      return;
    }

    setProcessingCloseShift(true);
    try {
      await shiftsApi.close(closingCashNumber);
      setCurrentShift(null);
      setShowCloseShiftModal(false);
      setClosingCash("");
      notify.success("Shift closed successfully!");
    } catch (error: any) {
      notify.error(error?.response?.data?.message || "Failed to close shift");
    } finally {
      setProcessingCloseShift(false);
    }
  };

  useEffect(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }

    if (!currentShift || currentShift.status !== 'OPEN') {
      return;
    }

    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const delay = nextMidnight.getTime() - now.getTime();

    autoCloseTimerRef.current = setTimeout(async () => {
      try {
        const closingAmount = currentShift.expectedCash ?? currentShift.openingCash ?? 0;
        const closedShift = await shiftsApi.close(closingAmount);
        setCurrentShift(closedShift);
        setShowCloseShiftModal(false);
        setClosingCash("");
        notify.success("Shift auto-closed at 12:00 AM");
      } catch (error: any) {
        notify.error(error?.response?.data?.message || "Failed to auto-close shift");
      }
    }, delay);

    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [currentShift]);

  // Create new customer from POS
  const handleCreateCustomer = async () => {
    if (!newCustomerData.name.trim() || !newCustomerData.phone.trim()) {
      notify.error("Name and phone are required");
      return;
    }
    
    try {
      console.log("Creating customer:", {
        name: newCustomerData.name.trim(),
        phone: newCustomerData.phone.trim(),
        email: newCustomerData.email.trim() || undefined,
      });
      
      const customer = await customersApi.create({
        name: newCustomerData.name.trim(),
        phone: newCustomerData.phone.trim(),
        email: newCustomerData.email.trim() || undefined,
      });
      
      console.log("Customer created:", customer);
      
      setCustomers([...customers, {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        tier: customer.tier,
      }]);
      setSelectedCustomerId(customer._id);
      setShowNewCustomerModal(false);
      setNewCustomerData({ name: "", phone: "", email: "" });
      notify.success("Customer created and selected!");
    } catch (error: any) {
      console.error("Create customer error:", error?.response?.data || error);
      notify.error(error?.response?.data?.message || "Failed to create customer");
    }
  };

  // Filter customers for search
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  );
  const selectedCustomer = selectedCustomerId
    ? customers.find(c => c._id === selectedCustomerId)
    : undefined;

  const normalizePhone = (value?: string) => String(value ?? '').replace(/\D/g, '');

  const sortedActiveReservations = useMemo(() => {
    return [...reservations].sort(
      (a, b) => new Date(a.reservationDateTime).getTime() - new Date(b.reservationDateTime).getTime()
    );
  }, [reservations]);

  const sortedReservationsViewer = useMemo(() => {
    const filtered = reservationsViewerStatusFilter === 'ALL'
      ? reservationsViewer
      : reservationsViewer.filter((r) => r.status === reservationsViewerStatusFilter);
    return [...filtered].sort(
      (a, b) => new Date(a.reservationDateTime).getTime() - new Date(b.reservationDateTime).getTime()
    );
  }, [reservationsViewer, reservationsViewerStatusFilter]);

  const toDateTimeLocalValue = (value?: string) => {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  const selectedCustomerActiveReservation = useMemo(() => {
    const phone = normalizePhone(selectedCustomer?.phone);
    if (!phone) return null;
    return sortedActiveReservations.find((r) => normalizePhone(r.customerPhone) === phone) ?? null;
  }, [selectedCustomer?.phone, sortedActiveReservations]);

  // Validate coupon code
  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponValidation(null);
      return;
    }

    const orderTotal = subtotal() + taxTotal();
    if (orderTotal <= 0) {
      notify.error("Add items to cart first");
      return;
    }

    setValidatingCoupon(true);
    try {
      const result = await couponsApi.validate(couponCode.trim(), orderTotal);
      setCouponValidation(result);
      if (result.success) {
        notify.success(`Coupon applied! Discount: ${formatMoney(result.discount)}`);
      }
    } catch (error: any) {
      setCouponValidation({
        success: false,
        message: error?.response?.data?.message || "Invalid coupon"
      });
      notify.error(error?.response?.data?.message || "Invalid coupon");
    } finally {
      setValidatingCoupon(false);
    }
  };

  // Clear coupon
  const handleClearCoupon = () => {
    setCouponCode("");
    setCouponValidation(null);
  };

  const loadCartFromLines = (
    lines: Array<{ _id: string; name: string; price: number; taxRate?: number; quantity: number }>
  ) => {
    const normalized = (lines || [])
      .map((li) => ({
        _id: String(li?._id || ''),
        name: String(li?.name || 'Item'),
        price: Number(li?.price || 0),
        taxRate: typeof li?.taxRate === 'number' ? li.taxRate : Number(li?.taxRate || 0),
        quantity: Math.max(0, Math.floor(Number(li?.quantity || 0)))
      }))
      .filter((li) => li._id && li.quantity > 0);

    if (normalized.length === 0) return false;

    // Aggregate duplicates by product id
    const byId = new Map<string, { _id: string; name: string; price: number; taxRate?: number; quantity: number }>();
    for (const li of normalized) {
      const existing = byId.get(li._id);
      if (existing) existing.quantity += li.quantity;
      else byId.set(li._id, { ...li });
    }

    clearCart();
    for (const li of byId.values()) {
      addItem({ _id: li._id, name: li.name, price: li.price, taxRate: li.taxRate });
      setQty(li._id, li.quantity);
    }
    return true;
  };

  // Handle opening table bill for payment
  const handleOpenTableBill = async (table: RestaurantTable) => {
    // Load the table bill into the cart (no popup)
    setOrderType('DINE_IN');
    setSelectedTable(table._id);
    setSelectedTableForPayment(table);
    setShowPaymentModal(false);

    // Prefer backend sale if present; fall back to locally-tracked saleId (newly created OPEN sale)
    let saleId: string | null = null;
    if (table.currentSale) {
      saleId = typeof table.currentSale === 'string' ? table.currentSale : table.currentSale._id;
    } else if (tableSaleIdByTable[table._id]) {
      saleId = tableSaleIdByTable[table._id];
    } else {
      // Try refetching the table to see if backend has attached currentSale
      try {
        const fresh = await tablesApi.getById(table._id);
        if (fresh?.currentSale) {
          saleId = typeof fresh.currentSale === 'string' ? fresh.currentSale : fresh.currentSale._id;
          setTableSaleIdByTable((prev) => ({ ...prev, [table._id]: saleId! }));
        }
      } catch {
        // ignore and try local order fallback
      }
    }

    if (saleId) {
      try {
        const sale = await getSaleById(saleId);

        const rawItems: any[] = Array.isArray((sale as any)?.items)
          ? (sale as any).items
          : (Array.isArray((sale as any)?.sale?.items) ? (sale as any).sale.items : []);

        const saleLines = rawItems.map((item: any) => {
          const productObj = typeof item?.product === 'object' && item.product ? item.product : null;
          const productId = productObj?._id || item?.productId || item?.product_id || item?.product || '';
          const quantity = item?.quantity ?? item?.qty ?? item?.count ?? 0;
          const price = item?.price ?? item?.unitPrice ?? item?.sellingPrice ?? 0;
          const taxRate = item?.taxRate ?? item?.tax ?? 0;
          const productName = productObj?.name || item?.productName || item?.name || 'Item';
          return {
            _id: String(productId),
            name: String(productName),
            price: Number(price || 0),
            taxRate: Number(taxRate || 0),
            quantity: Number(quantity || 0)
          };
        });

        if (loadCartFromLines(saleLines)) {
          setSelectedTableForPayment({ ...table, currentSale: table.currentSale ?? saleId } as any);
          return;
        }
      } catch (error) {
        console.error('Failed to fetch table sale:', error);
      }
    }
    
    // Otherwise check local table orders
    const tableOrder = tableOrders.find(order => order.tableId === table._id);
    
    if (!tableOrder || tableOrder.items.length === 0) {
      notify.error("No items in this table order");

      setShowPaymentModal(false);
      setSelectedTableForPayment(null);
      return;
    }

    // Load items into the cart for this table
    if (!loadCartFromLines(tableOrder.items as any)) {
      notify.error("No items in this table order");

      setShowPaymentModal(false);
      setSelectedTableForPayment(null);
      return;
    }
    setSelectedTableForPayment({ ...table, currentSale: table.currentSale ?? saleId } as any);
  };

  // Handle payment for table
  const handleTablePayment = async () => {
    if (!selectedTableForPayment || items.length === 0) {
      notify.error("No items to pay for");
      return;
    }

    if (!currentShift) {
      notify.error("No open shift");
      return;
    }

    setProcessingPayment(true);
    try {
      let sale: Sale;

      const saleIdFromTable = selectedTableForPayment.currentSale
        ? (typeof selectedTableForPayment.currentSale === 'string'
          ? selectedTableForPayment.currentSale
          : selectedTableForPayment.currentSale._id)
        : null;
      const saleId = saleIdFromTable || tableSaleIdByTable[selectedTableForPayment._id] || null;

      if (saleId) {
        const existing = await getSaleById(saleId);
        const cartTotal = finalTotal();
        const amountToPay =
          (typeof existing?.balanceAmount === 'number' && existing.balanceAmount > 0)
            ? existing.balanceAmount
            : ((typeof existing?.grandTotal === 'number' && existing.grandTotal > 0)
              ? existing.grandTotal
              : cartTotal);

        sale = await paySale(saleId, { amount: amountToPay, paymentMethod });
      } else {
        // Fallback: Create the sale with all items and payment
        const payload: any = {
          items: items.map((item) => ({
            product: item._id,
            quantity: item.quantity,
            price: item.price,
            originalPrice: item.originalPrice
          })),
          paymentMethod: paymentMethod,
          orderType: 'DINE_IN',
          tableId: selectedTableForPayment._id,
        };

        // Add customer if selected
        if (selectedCustomerId) {
          payload.customerId = selectedCustomerId;
        }

        // Add discount if applied
        const discountAmount = Number(discountValue);
        if (discountType && Number.isFinite(discountAmount) && discountAmount > 0) {
          payload.discountType = discountType;
          payload.discountValue = discountAmount;
        }

        // Add coupon if entered
        if (couponCode.trim()) {
          payload.couponCode = couponCode.trim();
        }

        // Add serviceCharge and packagingCharge computed values
        if (getServiceCharge() > 0) {
          payload.serviceCharge = getServiceCharge();
        }
        if (getPackagingCharge() > 0) {
          payload.packagingCharge = getPackagingCharge();
        }

        sale = (await createSale(payload)) as Sale;
      }
      setPostPaymentSale(sale);
      setShowPrintModal(true);

      // Earn loyalty points for customer if selected
      if (selectedCustomerId && sale.grandTotal > 0) {
        try {
          await loyaltyApi.earnPoints(selectedCustomerId, sale.grandTotal, sale._id);
          const pointsEarned = Math.floor(sale.grandTotal / 10);
          if (pointsEarned > 0) {
            notify.success(`Customer earned ${pointsEarned} loyalty points!`, { duration: 3000 });
          }
        } catch (loyaltyError) {
          console.log("Loyalty points earning failed:", loyaltyError);
        }
      }

      // Table paid — set to CLEANING so cashier can physically clear it before marking available
      await tablesApi.updateStatus(selectedTableForPayment._id, 'CLEANING');

      // Check if this table has an active reservation and complete it
      try {
        const allReservations = await reservationsApi.getAll({ status: 'SEATED' });
        const activeReservation = allReservations.find(r => {
          const tableId = typeof r.table === 'object' ? r.table._id : r.table;
          return tableId === selectedTableForPayment._id;
        });
        
        if (activeReservation) {
          await reservationsApi.updateStatus(activeReservation._id, 'COMPLETED');
          notify.success('Reservation completed', { duration: 2000 });
        }
      } catch (reservationError) {
        console.log('No active reservation for this table or completion failed:', reservationError);
      }

      // Remove table order from state
      setTableOrders((prev) => prev.filter(order => order.tableId !== selectedTableForPayment._id));

      // Refresh tables and reservations
      const [tablesRes, reservationsRes] = await Promise.all([
        tablesApi.getAll(),
        reservationsApi.getAll().catch(() => [])
      ]);
      setTables(tablesRes || []);
      const activeReservations = (reservationsRes || []).filter(
        (r: Reservation) => r.status === 'CONFIRMED' || r.status === 'SEATED'
      );
      setReservations(activeReservations);

      notify.success(`Payment complete! Invoice: ${sale.invoiceNumber}`, { duration: 4000 });
      
      clearCart();
      setDiscountType('');
      setDiscountValue('');
      setCouponCode('');
      setCouponValidation(null);
      setSelectedCustomerId('');
      setSelectedCustomerLoyalty(null);
      setShowPaymentModal(false);

      // Clear locally-tracked sale id for this table
      setTableSaleIdByTable((prev) => {
        const copy = { ...prev };
        delete copy[selectedTableForPayment._id];
        return copy;
      });

      setSelectedTableForPayment(null);
    } catch (error: any) {
      notify.error(error?.response?.data?.message || "Payment failed");
    } finally {
      setProcessingPayment(false);
    }
  };

  // Get occupied tables (show tables with OCCUPIED status OR in local tableOrders)
  const occupiedTables = tables.filter(t => 
    t.status === 'OCCUPIED' || tableOrders.some(order => order.tableId === t._id)
  );

  // Tables paid and waiting for physical cleaning before being re-opened
  const cleaningTables = tables.filter(t => t.status === 'CLEANING');

  // Calculate manual discount amount (discount base = subtotal + tax, before charges)
  const calculateManualDiscount = () => {
    const base = subtotal() + taxTotal();
    const discountAmount = Number(discountValue);
    if (!discountType || !Number.isFinite(discountAmount) || discountAmount <= 0) return 0;
    if (discountType === 'PERCENTAGE') {
      return Math.round(Math.min(base, (base * discountAmount) / 100) * 100) / 100;
    }
    return Math.min(base, discountAmount);
  };

  // Calculate coupon discount amount
  const calculateCouponDiscount = () => {
    if (couponValidation?.success && couponValidation.discount) {
      return couponValidation.discount;
    }
    return 0;
  };

  // Calculate loyalty points discount (1 point = Rs. 0.1, so 100 points = Rs. 10)
  const calculatePointsDiscount = () => {
    if (!usePoints || pointsToUse <= 0) return 0;
    return (pointsToUse / 100) * 10;
  };

  // Total discount (manual + coupon + points)
  const calculateDiscount = () => {
    return calculateManualDiscount() + calculateCouponDiscount() + calculatePointsDiscount();
  };

  const getEffectiveOrderType = () => (selectedTableForPayment ? 'DINE_IN' : orderType);

  const getServiceCharge = () => {
    if (getEffectiveOrderType() !== 'DINE_IN') return 0;
    if (serviceChargeType === 'PERCENTAGE') {
      return Math.round((subtotal() * serviceCharge / 100) * 100) / 100;
    }
    return serviceCharge;
  };

  const getPackagingCharge = () => {
    if (getEffectiveOrderType() === 'DINE_IN') return 0;
    if (packagingChargeType === 'PERCENTAGE') {
      return Math.round((subtotal() * packagingCharge / 100) * 100) / 100;
    }
    return packagingCharge;
  };

  const getChargesTotal = () => getServiceCharge() + getPackagingCharge();

  const finalTotal = () => {
    // Correct formula: subtotal + tax + charges - discount (minimum 0)
    const base = subtotal() + taxTotal() + getChargesTotal();
    return Math.max(0, base - calculateDiscount());
  };
  const isPayingTable = Boolean(selectedTableForPayment);
  const isProcessing = isPayingTable
    ? processingPayment
    : (orderType === 'DINE_IN' && selectedTable ? addingToTable : creatingSale);

  const flattenCategories = (cats: Category[]): Category[] => {
    let result: Category[] = [];
    for (const cat of cats) {
      result.push(cat);
      if (cat.children?.length) {
        result = result.concat(flattenCategories(cat.children));
      }
    }
    return result;
  };

  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);
  const inactiveCategoryIds = useMemo(
    () => new Set(flatCategories.filter((c) => c.isActive === false).map((c) => c._id)),
    [flatCategories]
  );
  const activeFlatCategories = useMemo(
    () => flatCategories.filter((c) => c.isActive !== false),
    [flatCategories]
  );

  useEffect(() => {
    if (selectedCategory && inactiveCategoryIds.has(selectedCategory)) {
      setSelectedCategory('');
    }
  }, [selectedCategory, inactiveCategoryIds]);

  const getCategoryId = (product: Product) => {
    if (!product.category) return "";
    if (typeof product.category === "object") return product.category._id;
    return product.category;
  };

  const getActiveProductDiscount = (product: Product): Discount | null => {
    const d = product.discount && typeof product.discount === 'object' ? (product.discount as Discount) : null;
    if (!d || !d.isActive) return null;

    const now = new Date();
    if (d.validFrom) {
      const from = new Date(d.validFrom);
      if (!Number.isNaN(from.getTime()) && now < from) return null;
    }
    if (d.validTo) {
      const to = new Date(d.validTo);
      if (!Number.isNaN(to.getTime()) && now > to) return null;
    }
    return d;
  };

  const getDiscountedUnitPrice = (unitPrice: number, discount: Discount) => {
    const base = Number.isFinite(unitPrice) ? unitPrice : 0;
    if (base <= 0) return 0;

    if (discount.discountType === 'PERCENTAGE') {
      const pct = Math.max(0, Math.min(100, discount.value || 0));
      const discounted = base - (base * pct) / 100;
      return Math.round(Math.max(0, discounted) * 100) / 100;
    }

    const flat = Math.max(0, discount.value || 0);
    return Math.round(Math.max(0, base - flat) * 100) / 100;
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const categoryId = getCategoryId(product);
    const matchesCategory = !selectedCategory || categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

const handleAddToTable = async () => {
  if (addingToTableRef.current) return;

  if (items.length === 0) {
    notify.error("Cart is empty");
    return;
  }

  if (!selectedTable) {
    notify.error("Please select a table");
    return;
  }

  if (!currentShift) {
    notify.error("No open shift. Please open a shift first.");
    setShowShiftModal(true);
    return;
  }

  addingToTableRef.current = true;
  setAddingToTable(true);

  try {
    // Check if table already has an order
    const existingOrderIndex = tableOrders.findIndex(order => order.tableId === selectedTable);
    
    if (existingOrderIndex >= 0) {
      // Add to existing table order
      const updatedOrders = [...tableOrders];
      const existingOrder = updatedOrders[existingOrderIndex];
      
      items.forEach(newItem => {
        const existingItemIndex = existingOrder.items.findIndex(i => i._id === newItem._id);
        if (existingItemIndex >= 0) {
          existingOrder.items[existingItemIndex].quantity += newItem.quantity;
        } else {
          existingOrder.items.push({ ...newItem });
        }
      });
      
      setTableOrders(updatedOrders);
    } else {
      // Create new table order
      setTableOrders([...tableOrders, {
        tableId: selectedTable,
        items: items.map(item => ({ ...item }))
      }]);
    }

    // Update table status to OCCUPIED
    await tablesApi.updateStatus(selectedTable, 'OCCUPIED');

    // Sync to backend OPEN sale so Kitchen can show it
    try {
      const payload: any = {
        items: items.map((item) => ({
          product: item._id,
          quantity: item.quantity,
          price: item.price,
          originalPrice: item.originalPrice
        })),
        orderType: 'DINE_IN',
        tableId: selectedTable,
      };

      if (selectedCustomerId) {
        payload.customerId = selectedCustomerId;
      }
      const discountAmount = Number(discountValue);
      if (discountType && Number.isFinite(discountAmount) && discountAmount > 0) {
        payload.discountType = discountType;
        payload.discountValue = discountAmount;
      }
      if (couponCode.trim()) {
        payload.couponCode = couponCode.trim();
      }
      if (getServiceCharge() > 0) {
        payload.serviceCharge = getServiceCharge();
      }
      if (getPackagingCharge() > 0) {
        payload.packagingCharge = getPackagingCharge();
      }

      // Important: omit paymentMethod to keep it as an OPEN sale
      const openSale = (await createSale(payload)) as Sale;

      const openSaleId = (openSale as any)?._id as string | undefined;
      if (openSaleId) {
        setTableSaleIdByTable((prev) => ({ ...prev, [selectedTable]: openSaleId }));
        // Ensure the table can be viewed/paid immediately even if /tables doesn't populate currentSale
        setTables((prev) =>
          prev.map((t) =>
            t._id === selectedTable
              ? ({ ...t, status: 'OCCUPIED', currentSale: t.currentSale ?? openSaleId } as any)
              : t
          )
        );
      }

      // Keep local tableOrders as a fallback until we can successfully load the backend sale.
      // It will be cleared after payment.
    } catch (saleErr: any) {
      console.warn('Kitchen sync failed (open table sale):', saleErr?.response?.data || saleErr);
    }
    
    // Refresh tables
    const tablesRes = await tablesApi.getAll();
    setTables(tablesRes || []);
    
    clearCart();
    notify.success("Items added to table! Table is now OCCUPIED.");
  } catch (error: any) {
    console.error("Add to table error:", error);
    notify.error(error?.response?.data?.message || "Failed to add items to table");
  } finally {
    addingToTableRef.current = false;
    setAddingToTable(false);
  }
};

const handleCreateSale = async (paidAmount?: number) => {
  if (creatingSaleRef.current) return;

  if (items.length === 0) {
    notify.error("Cart is empty");
    return;
  }

  if (!currentShift) {
    notify.error("No open shift. Please open a shift first.");
    setShowShiftModal(true);
    return;
  }

  creatingSaleRef.current = true;
  setCreatingSale(true);

  try {
    const payload: any = {
      items: items.map((item) => ({
        product: item._id,
        quantity: item.quantity,
        price: item.price,
        originalPrice: item.originalPrice
      })),
      paymentMethod: paymentMethod,
      orderType,
    };

      if (typeof paidAmount === 'number') {
        payload.payments = [{ amount: paidAmount, method: paymentMethod }];
        payload.paidAmount = paidAmount;
      }

    // Add customer if selected
    if (selectedCustomerId) {
      payload.customerId = selectedCustomerId;
    }

    // Add discount if applied
    const discountAmount = Number(discountValue);
    if (discountType && Number.isFinite(discountAmount) && discountAmount > 0) {
      payload.discountType = discountType;
      payload.discountValue = discountAmount;
    }

    // Add coupon if entered
    if (couponCode.trim()) {
      payload.couponCode = couponCode.trim();
    }

    // Pass computed service/packaging charge values
    if (getServiceCharge() > 0) {
      payload.serviceCharge = getServiceCharge();
    }
    if (getPackagingCharge() > 0) {
      payload.packagingCharge = getPackagingCharge();
    }

    const sale = (await createSale(payload)) as Sale;
    setPostPaymentSale(sale);
    setShowPrintModal(true);

    // Redeem loyalty points if used
    if (selectedCustomerId && usePoints && pointsToUse > 0) {
      try {
        await loyaltyApi.redeemPoints({
          customer_id: selectedCustomerId,
          points: pointsToUse,
          sale_id: sale._id,
        });
        notify.success(`Redeemed ${pointsToUse} loyalty points! (${formatMoney(calculatePointsDiscount())} off)`, { duration: 3000 });
      } catch (redeemError: any) {
        console.log("Points redemption failed:", redeemError);
        notify.error(redeemError?.response?.data?.message || "Failed to redeem points");
      }
    }

    // Earn loyalty points for customer if selected (only if not paying with points)
    if (selectedCustomerId && sale.grandTotal > 0 && !usePoints) {
      try {
        const tier = customers.find((c) => c._id === selectedCustomerId)?.tier as 'BASIC' | 'SILVER' | 'GOLD' | 'PLATINUM' | undefined;
        const multiplier = tier ? (pointsMultiplierByTier[tier] ?? 1) : 1;
        const adjustedAmount = sale.grandTotal * multiplier;

        await loyaltyApi.earnPoints(selectedCustomerId, adjustedAmount, sale._id);

        // Display-only estimate (backend is source of truth)
        const pointsEarned = Math.floor(adjustedAmount / 10);
        if (pointsEarned > 0) {
          notify.success(`Customer earned ${pointsEarned} loyalty points!`, { duration: 3000 });
        }
      } catch (loyaltyError) {
        console.log("Loyalty points earning failed:", loyaltyError);
        // Don't fail sale if loyalty fails
      }
    }

    notify.success(`Sale created successfully! Invoice: ${sale.invoiceNumber}`, { duration: 4000 });
    clearCart();
    setDiscountType('');
    setDiscountValue('');
    setCouponCode('');
    setCouponValidation(null);
    setSelectedCustomerId('');
    setSelectedCustomerLoyalty(null);
    setUsePoints(false);
    setPointsToUse(0);
    console.log("SALE:", sale);
  } catch (error: any) {
    console.error("Create sale error:", error?.response?.data || error);
    notify.error(error?.response?.data?.message || "Failed to create sale");
  } finally {
    creatingSaleRef.current = false;
    setCreatingSale(false);
  }
};

  // Get table IDs that have CONFIRMED reservations (reserved but not yet seated)
  const confirmedReservationTableIds = reservations
    .filter(r => r.status === 'CONFIRMED')
    .map(r => typeof r.table === 'object' ? r.table._id : r.table);

  // Get available tables (only AVAILABLE tables and NOT having CONFIRMED reservations)
  const availableTables = tables.filter(t => 
    t.status === 'AVAILABLE' && !confirmedReservationTableIds.includes(t._id)
  );

  const headerActions = (
    <>
      {!loading && !currentShift && (
        <button
          type="button"
          onClick={() => setShowShiftModal(true)}
          className="touch-manipulation rounded-xl sm:rounded-2xl bg-yellow-500 text-white px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-extrabold hover:bg-yellow-600 active:scale-95 shadow-sm"
        >
          Open Shift
        </button>
      )}

      {!hasPermission(PERMISSIONS.VIEW_DASHBOARD) && (
        <button
          type="button"
          onClick={() => setShowSidebarMenu(true)}
          className="touch-manipulation flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-all hover-lift active:scale-95 shadow-sm"
          aria-label="Open sidebar menu"
          title="Open sidebar menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {currentShift && (
        <button
          type="button"
          onClick={() => {
            setClosingCash("");
            setShowCloseShiftModal(true);
          }}
          className="touch-manipulation rounded-xl sm:rounded-2xl bg-emerald-600 text-white px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-extrabold hover:bg-emerald-700 active:scale-95 shadow-sm"
        >
          Close Shift
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
          } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
          }
        }}
        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        className="touch-manipulation flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-all hover-lift active:scale-95 shadow-sm"
      >
        {isFullscreen ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h6m-6 6h6m3-12v3m0 0h-3m3 0l-4 4m-8 0l4-4m-4 0h3m-3 0V3m0 18v-3m0 0h3m-3 0l4-4m8 0l-4 4m4 0h-3m3 0v3" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        )}
      </button>

      {hasPermission(PERMISSIONS.VIEW_DASHBOARD) && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate("/dashboard");
          }}
          className="touch-manipulation hidden sm:flex items-center gap-2 rounded-2xl bg-indigo-50 px-6 py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-100 transition-all hover-lift active:scale-95 shadow-sm border border-indigo-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Dashboard
        </button>
      )}

      <button
        onClick={() => setShowLogoutConfirm(true)}
        className="touch-manipulation flex items-center gap-1 sm:gap-2 rounded-xl sm:rounded-2xl bg-slate-900 px-3 py-2 sm:px-6 sm:py-3 text-xs sm:text-sm font-bold text-white hover:bg-slate-800 transition-all hover-lift active:scale-95 shadow-md shadow-slate-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        <span className="hidden sm:inline">Logout</span>
      </button>
    </>
  );

  const quickNavContent = (
    <div className="flex w-full flex-wrap gap-2 pb-1 2xl:flex-nowrap 2xl:overflow-x-auto no-scrollbar scroll-smooth">
      {hasPermission(PERMISSIONS.VIEW_DASHBOARD) && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openQuickView("Sale Summary", "/dashboard");
          }}
          className="touch-manipulation shrink-0 whitespace-nowrap rounded-xl sm:rounded-2xl bg-slate-900 px-3 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-sm sm:shadow-lg hover:bg-slate-800 transition-all active:scale-95"
        >
          📊 Summary
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openQuickView("Sales", "/sales");
        }}
        className="touch-manipulation shrink-0 whitespace-nowrap rounded-xl sm:rounded-2xl bg-slate-900 px-3 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-sm sm:shadow-lg hover:bg-slate-800 transition-all active:scale-95"
      >
        🧻 Sales
      </button>
      {hasPermission(PERMISSIONS.VIEW_DISCOUNTS) && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openQuickView("Discounts", "/discounts");
          }}
          className="touch-manipulation shrink-0 whitespace-nowrap rounded-xl sm:rounded-2xl bg-slate-900 px-3 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-sm sm:shadow-lg hover:bg-slate-800 transition-all active:scale-95"
        >
          🏷️ Discounts
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openQuickView("Stocks", "/inventory");
        }}
        className="touch-manipulation shrink-0 whitespace-nowrap rounded-xl sm:rounded-2xl bg-slate-900 px-3 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-sm sm:shadow-lg hover:bg-slate-800 transition-all active:scale-95"
      >
        📦 Stocks
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openQuickView("Returns", "/returns?posOnly=1");
        }}
        className="touch-manipulation shrink-0 whitespace-nowrap rounded-xl sm:rounded-2xl bg-slate-900 px-3 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-sm sm:shadow-lg hover:bg-slate-800 transition-all active:scale-95"
      >
        ↩️ Returns
      </button>
    </div>
  );

  return (
    <div className="min-h-screen h-dvh bg-slate-100 flex flex-col overflow-hidden">
      {/* Main Header */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center h-14 sm:h-16 border-b border-slate-200/60 bg-white/80 backdrop-blur-md px-3 sm:px-8 z-50 sticky top-0">
        <div className="min-w-0 justify-self-start">
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
            POS <span className="text-indigo-600">Terminal</span>
          </h1>
          <div className="flex items-center gap-2 min-w-0">
            <p className="hidden sm:block text-[11px] font-bold uppercase tracking-widest text-slate-400 truncate">
              Restaurant Management System
            </p>
            {!loading && !currentShift && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5 text-[10px] font-extrabold tracking-wide">
                ⚠️ NO SHIFT
              </span>
            )}
            {currentShift && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-extrabold tracking-wide">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
                <span className="hidden sm:inline">ACTIVE SHIFT</span>
                <span className="sm:hidden">OPEN</span>
              </span>
            )}
          </div>
        </div>
        <div className="justify-self-end col-start-3">
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4 rounded-2xl bg-slate-100/80 p-1.5 sm:p-2">
            {headerActions}
          </div>
        </div>

        {/* center column spacer */}
        <div className="col-start-2" />
      </header>

      {/* Quick Navigation Bar — desktop only (lg+), mobile now uses 'More' sheet */}
      {false && !isLgLayout && null}

      {showSidebarMenu && (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close sidebar menu"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setShowSidebarMenu(false)}
          />
          <div className="relative h-full w-64 max-w-[85vw] shadow-2xl">
            <Sidebar onNavigate={() => setShowSidebarMenu(false)} hideDashboard={!hasPermission(PERMISSIONS.VIEW_DASHBOARD)} />
          </div>
        </div>
      )}

      <main className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">
        <aside className="hidden w-56 border-r border-slate-200 bg-white p-4 lg:flex lg:flex-col lg:min-h-0">
          <h2 className="mb-4 shrink-0 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Categories
          </h2>

          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
            <button
              onClick={() => setSelectedCategory("")}
              className={`touch-manipulation w-full rounded-xl px-3 py-3 text-left text-sm font-semibold transition active:scale-[0.99] ${
                selectedCategory === ""
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              All
            </button>
            {activeFlatCategories.map((cat) => (
              <button
                key={cat._id}
                onClick={() => setSelectedCategory(cat._id)}
                className={`touch-manipulation w-full rounded-xl px-3 py-3 text-left text-sm font-semibold transition active:scale-[0.99] ${
                  selectedCategory === cat._id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {cat.icon && <span className="mr-2">{cat.icon}</span>}
                {cat.name}
              </button>
            ))}
          </div>

          <div className="mt-auto shrink-0 space-y-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => {
                setTablesTab('available');
                setShowTablesModal(true);
              }}
              className="touch-manipulation flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-all active:scale-95"
            >
              🍽️ Tables
              {(occupiedTables.length + cleaningTables.length) > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-slate-900">
                  {occupiedTables.length + cleaningTables.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={async () => {
                setShowReservationsViewer(true);
                setLoadingReservationsViewer(true);
                try {
                  const reservationsRes = await reservationsApi.getAll().catch(() => []);
                  setReservationsViewer(reservationsRes || []);
                  const activeReservations = (reservationsRes || []).filter(
                    (r: Reservation) => r.status === 'CONFIRMED' || r.status === 'SEATED'
                  );
                  setReservations(activeReservations);
                } finally {
                  setLoadingReservationsViewer(false);
                }
              }}
              className="touch-manipulation w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-all active:scale-95"
            >
              📅 Reservations
            </button>

            <button
              type="button"
              onClick={async () => {
                setShowKitchenViewer(true);
                setLoadingKitchen(true);
                try {
                  const orders = await kitchenApi.getQueue();
                  setKitchenOrders(orders);
                } catch {
                  setKitchenOrders([]);
                } finally {
                  setLoadingKitchen(false);
                }
              }}
              className="touch-manipulation w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-all active:scale-95"
            >
              👨‍🍳 Kitchen
            </button>
          </div>
        </aside>

        <section className={`flex-1 p-4 sm:p-6 overflow-visible md:flex md:flex-col md:min-h-0 md:overflow-hidden ${
          !isLgLayout && mobileTab === 'cart' ? 'hidden' : ''
        } md:flex`}>
          {isLgLayout && (
            <nav className="shrink-0 border-b border-slate-200 bg-white/50 backdrop-blur-sm py-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  {quickNavContent}
                </div>
              </div>
            </nav>
          )}
          <div className="md:flex-1 md:min-h-0 md:overflow-auto">
          {/* Mobile/Tablet Category scroller */}
          <div className="mb-4 lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory("")}
                className={`touch-manipulation shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition active:scale-[0.99] ${
                  selectedCategory === ""
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                All
              </button>
              {activeFlatCategories.map((cat) => (
                <button
                  key={cat._id}
                  onClick={() => setSelectedCategory(cat._id)}
                  className={`touch-manipulation shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition active:scale-[0.99] ${
                    selectedCategory === cat._id
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {cat.icon && <span className="mr-2">{cat.icon}</span>}
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <input
              ref={searchInputRef}
              placeholder="Search products... (F1)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-none sm:max-w-md rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-slate-500 sm:py-4"
            />
          </div>

          <h2 className="mb-4 text-lg font-semibold text-slate-800">Products</h2>

          {loading ? (
            <p className="text-slate-500">Loading products...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredProducts.map((product) => {
                const isOutOfStock =
                  product.outOfStock === true ||
                  (product.trackStock !== false &&
                    typeof product.stockQuantity === 'number' &&
                    product.stockQuantity <= 0);
                const categoryId = getCategoryId(product);
                const isInactiveCategory = Boolean(categoryId) && inactiveCategoryIds.has(categoryId);
                const isUnavailable = product.isAvailable === false || isOutOfStock;
                const isDisabled = isUnavailable || isInactiveCategory;
                const activeDiscount = getActiveProductDiscount(product);
                const discountedPrice = activeDiscount
                  ? getDiscountedUnitPrice(product.price, activeDiscount)
                  : product.price;
                const discountChip = activeDiscount
                  ? (activeDiscount.discountType === 'FLAT'
                    ? `${formatMoney(activeDiscount.value)} OFF`
                    : `${activeDiscount.value}% OFF`)
                  : '';
                return (
                  <div
                    key={product._id}
                    role={isDisabled ? undefined : "button"}
                    tabIndex={isDisabled ? -1 : 0}
                    aria-disabled={isDisabled}
                    onClick={
                      isDisabled
                        ? undefined
                        : () =>
                            addItem({
                              _id: product._id,
                              name: product.name,
                              price: discountedPrice,
                              originalPrice: activeDiscount ? product.price : undefined,
                              taxRate: product.taxRate || 0,
                            })
                    }
                    onKeyDown={
                      isDisabled
                        ? undefined
                        : (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              addItem({
                                _id: product._id,
                                name: product.name,
                                price: discountedPrice,
                                originalPrice: activeDiscount ? product.price : undefined,
                                taxRate: product.taxRate || 0,
                              });
                            }
                          }
                    }
                    className={`touch-manipulation select-none rounded-2xl border p-4 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                      isDisabled
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                        : 'cursor-pointer border-slate-200 bg-white hover:shadow-md active:scale-[0.99] active:bg-slate-50'
                    }`}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-800 leading-tight">
                        {product.name}
                      </h3>

                      {isInactiveCategory ? (
                        <span className="shrink-0 rounded-full bg-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700">
                          Inactive
                        </span>
                      ) : isUnavailable ? (
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-1 text-[10px] font-medium text-red-600">
                          Out of Stock
                        </span>
                      ) : product.lowStock ? (
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-1 text-[10px] font-medium text-red-600">
                          Low
                        </span>
                      ) : activeDiscount ? (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                          {discountChip}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`text-sm font-bold ${isDisabled ? 'text-slate-400' : 'text-slate-900'}`}>
                          {formatMoney(discountedPrice)}
                        </span>
                        {activeDiscount && discountedPrice !== product.price && (
                          <div className="text-[11px] text-slate-400 line-through">
                            {formatMoney(product.price)}
                          </div>
                        )}
                      </div>

                      {isDisabled && (
                        <span className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-lg font-bold bg-slate-200 text-slate-400">
                          —
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>

          {/* Desktop-only Bottom Bar (stays under products, not under cart) */}
          {isLgLayout && (
          <div className="shrink-0 -mx-4 sm:-mx-6 px-4 sm:px-6 border-t border-slate-200 bg-white z-20 shadow-[0_-8px_20px_-16px_rgba(0,0,0,0.35)]">
            <div className="py-3">
              {/* Bottom Bar Inputs (Customer / Discount / Coupon) */}
              <div className="grid w-full gap-3 lg:grid-cols-12">
                {/* Customer */}
                <div className="lg:col-span-5 min-w-0">
                  <label className="block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">Customer</label>
                  <div className="relative">
                    {selectedCustomerId ? (
                      <div className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-blue-900">{selectedCustomer?.name}</div>
                          <div className="truncate text-xs font-semibold text-blue-700">{selectedCustomer?.phone}</div>
                          {selectedCustomerActiveReservation && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-amber-800">
                              📅 Active booking
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowCustomerDetailsModal(true)}
                            className="touch-manipulation rounded-xl bg-white/70 px-3 py-2 text-xs font-extrabold text-blue-800 hover:bg-white active:scale-[0.99]"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId('');
                              setSelectedCustomerLoyalty(null);
                              setUsePoints(false);
                              setPointsToUse(0);
                            }}
                            className="touch-manipulation rounded-xl bg-white/70 px-3 py-2 text-xs font-extrabold text-blue-800 hover:bg-white active:scale-[0.99]"
                            aria-label="Clear customer"
                            title="Clear"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <div className="relative flex-1 min-w-0">
                          <input
                            ref={customerSearchRef}
                            type="text"
                            value={customerSearch}
                            onChange={(e) => {
                              setCustomerSearch(e.target.value);
                              setShowCustomerSearch(true);
                            }}
                            onFocus={() => setShowCustomerSearch(true)}
                            placeholder="Search customer... (F5)"
                            className="touch-manipulation w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                          />

                          {showCustomerSearch && customerSearch && (
                            <div className="absolute bottom-full mb-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto z-60">
                              {filteredCustomers.length === 0 ? (
                                <div className="p-4 text-sm text-slate-500 text-center">No customers found</div>
                              ) : (
                                filteredCustomers.slice(0, 10).map((customer) => (
                                  <button
                                    key={customer._id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCustomerId(customer._id);
                                      setCustomerSearch('');
                                      setShowCustomerSearch(false);
                                    }}
                                    className="touch-manipulation w-full text-left px-4 py-3 text-sm hover:bg-slate-50 border-b last:border-b-0"
                                  >
                                    <div className="font-bold text-slate-900">{customer.name}</div>
                                    <div className="text-xs font-semibold text-slate-500">{customer.phone} • {customer.tier}</div>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowNewCustomerModal(true)}
                          className="touch-manipulation w-12 h-12 flex items-center justify-center rounded-2xl bg-green-500 text-white text-2xl font-black hover:bg-green-600 active:scale-[0.99]"
                          title="Add New Customer"
                          aria-label="Add New Customer"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Discount */}
                <div className="lg:col-span-3 min-w-0">
                  <label className="block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">Discount</label>
                  <div className="flex gap-2">
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as ManualDiscountType)}
                      className="touch-manipulation w-1/2 rounded-2xl border border-slate-300 px-3 py-3 text-sm"
                    >
                      <option value="">None</option>
                      <option value="PERCENTAGE">%</option>
                      <option value="FLAT">Rs</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === 'PERCENTAGE' ? '%' : 'Rs.'}
                      disabled={!discountType}
                      className="touch-manipulation w-1/2 rounded-2xl border border-slate-300 px-3 py-3 text-sm disabled:bg-slate-50 disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Coupon */}
                <div className="lg:col-span-4 min-w-0">
                  <label className="block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">Coupon</label>
                  {couponValidation?.success ? (
                    <div className="flex items-center justify-between rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-green-800">{couponCode}</div>
                        <div className="truncate text-xs font-semibold text-green-700">
                          {couponValidation.coupon?.discountType === 'PERCENTAGE'
                            ? `${couponValidation.coupon?.value}% off`
                            : `${formatMoney(couponValidation.coupon?.value)} off`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearCoupon}
                        className="touch-manipulation rounded-xl bg-white/70 px-3 py-2 text-xs font-extrabold text-green-800 hover:bg-white active:scale-[0.99]"
                        aria-label="Clear coupon"
                        title="Clear"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 min-w-0">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          setCouponValidation(null);
                        }}
                        placeholder="Enter code"
                        className={`touch-manipulation flex-1 min-w-0 rounded-2xl border px-3 py-3 text-sm ${
                          couponValidation?.success === false
                            ? 'border-red-300 bg-red-50'
                            : 'border-slate-300'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handleValidateCoupon}
                        disabled={!couponCode.trim() || validatingCoupon}
                        className="touch-manipulation shrink-0 rounded-2xl bg-blue-500 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {validatingCoupon ? '...' : 'Apply'}
                      </button>
                    </div>
                  )}

                  {couponValidation?.success === false && (
                    <p className="text-xs font-semibold text-red-500 mt-1">{couponValidation.message}</p>
                  )}
                </div>
              </div>

              {/* Action Buttons (Order Type / Tables / Clear) */}
              <div className="mt-3 flex items-stretch gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
                <div className="flex rounded-xl bg-slate-100 p-1">
                  {(['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setOrderType(type);
                        if (type !== 'DINE_IN') setSelectedTable('');
                      }}
                      className={`touch-manipulation rounded-lg px-5 py-3 text-base font-semibold transition active:scale-[0.99] ${
                        orderType === type
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {type === 'DINE_IN' ? 'Dine-in' : type === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowTablesModal(true)}
                  disabled={orderType !== 'DINE_IN'}
                  className="touch-manipulation rounded-xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                >
                  Tables
                  {orderType === 'DINE_IN' && selectedTable && (
                    <span className="ml-2 text-sm font-medium text-slate-500">
                      #{tables.find(t => t._id === selectedTable)?.tableNumber ?? ''}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setShowCartDrawer(true)}
                  className="md:hidden touch-manipulation rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800 active:scale-[0.99]"
                >
                  Cart
                  {items.length > 0 && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-sm font-semibold">
                      {items.reduce((s, i) => s + i.quantity, 0)} · {formatMoney(finalTotal())}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    clearCart();
                    setSelectedTableForPayment(null);
                    setShowPaymentModal(false);
                    notify.success('Cart cleared');
                  }}
                  className="touch-manipulation rounded-xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50 active:scale-[0.99]"
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>
          )}
        </section>

        {/* Cart aside — full tab on mobile, sidebar on md+ */}
        <aside
          ref={cartSectionRef}
          className={`bg-white flex flex-col min-h-0 overflow-hidden border-slate-200 ${
            !isLgLayout && mobileTab !== 'cart' ? 'hidden' : ''
          } md:static md:z-auto md:flex md:w-[460px] md:max-w-[520px] md:h-full md:max-h-none md:rounded-none md:border-t-0 md:border-l lg:w-[520px] xl:w-[560px]`}
        >
          {/* Cart Header — fixed */}
          <div className="px-4 py-3 sm:px-5 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-800">Cart</h2>
              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <span className="text-xs font-medium bg-slate-900 text-white px-2 py-0.5 rounded-full">{items.reduce((s, i) => s + i.quantity, 0)}</span>
                )}
              </div>
            </div>
            {orderType === 'DINE_IN' && selectedTable && (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600">🍽️</span>
                    <span className="text-sm font-medium text-blue-800">
                      Table {tables.find(t => t._id === selectedTable)?.tableNumber}
                      {tables.find(t => t._id === selectedTable)?.section && (
                        <span className="text-blue-600 ml-1">
                          ({tables.find(t => t._id === selectedTable)?.section})
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedTable('');
                      setSelectedTableForPayment(null);
                      setShowPaymentModal(false);
                    }}
                    className="touch-manipulation rounded-lg px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 active:scale-[0.99]"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable Cart Items */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 pb-2">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No items in cart yet.
              </div>
            ) : (
              <div className="space-y-1">
                {/* Cart header row */}
                <div className="flex items-center gap-2 px-1 pb-1 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  <span className="flex-1">Item</span>
                  <span className="w-20 text-center">Qty</span>
                  <span className="w-16 text-right">DIS</span>
                  <span className="w-20 text-right">Total</span>
                  <span className="w-8"></span>
                </div>
                {items.map((item) => {
                  const hasDiscount = item.originalPrice != null && item.originalPrice > item.price;
                  const origPrice   = hasDiscount ? item.originalPrice! : item.price;
                  const discAmt     = hasDiscount ? origPrice - item.price : 0;

                  return (
                  <div key={item._id} className="border-b border-slate-50">
                    {/* ── Main item row ── */}
                    <div className="flex items-center gap-2 py-2 group">
                      {/* Name + unit price */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-slate-800 truncate">{item.name}</h3>
                        <div className="text-xs text-slate-500 mt-0.5">{formatMoney(origPrice)}</div>
                      </div>

                      {/* Qty controls */}
                      <div className="flex items-center justify-center w-20 shrink-0">
                        <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white">
                          <button
                            onClick={() => decreaseQty(item._id)}
                            className="touch-manipulation flex h-8 w-6 items-center justify-center text-sm font-bold text-slate-700 hover:bg-slate-50 active:bg-slate-100 md:h-7 md:w-6"
                            aria-label="Decrease quantity"
                            title="Decrease"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const next = raw === '' ? 1 : parseInt(raw, 10);
                              setQty(item._id, Number.isFinite(next) ? Math.max(1, next) : 1);
                            }}
                            className="qty-stepper-input h-8 w-8 border-x border-slate-300 bg-white text-center text-sm text-slate-800 outline-none md:h-7 md:w-8"
                            aria-label="Quantity"
                          />
                          <button
                            onClick={() => increaseQty(item._id)}
                            className="touch-manipulation flex h-8 w-6 items-center justify-center text-sm font-bold text-slate-700 hover:bg-slate-50 active:bg-slate-100 md:h-7 md:w-6"
                            aria-label="Increase quantity"
                            title="Increase"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* DIS (line discount) */}
                      <span className={`w-16 text-right text-xs font-semibold ${hasDiscount ? 'text-emerald-600' : 'text-slate-400'} shrink-0`}>
                        {hasDiscount ? `-${formatMoney(discAmt * item.quantity)}` : ''}
                      </span>

                      {/* Line total (show original/non-discounted total) */}
                      <span className="w-20 text-right text-sm font-semibold text-slate-800 shrink-0">
                        {formatMoney(origPrice * item.quantity)}
                      </span>

                      {/* Trash */}
                      <button
                        onClick={() => removeItem(item._id)}
                        className="touch-manipulation w-11 h-11 flex items-center justify-center rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 active:scale-[0.97] transition-colors shrink-0 md:w-9 md:h-9 md:rounded-lg"
                        aria-label="Remove item"
                        title="Remove"
                      >
                        <svg className="h-5 w-5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    {/* removed separate discount sub-row; DIS is now inline in the main row */}
                  </div>
                  );
                })}

              </div>
            )}
          </div>

          {/* Mobile-only: Order Options (shown inside Cart tab on mobile) */}
          {!isLgLayout && (
            <div className="shrink-0 px-4 py-3 border-t border-slate-100 bg-slate-50 space-y-3">
              {/* Order Type */}
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">Order Type</label>
                <div className="flex rounded-xl bg-white border border-slate-200 p-1 gap-1">
                  {(['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setOrderType(type); if (type !== 'DINE_IN') setSelectedTable(''); }}
                      className={`touch-manipulation flex-1 rounded-lg py-2.5 text-sm font-semibold transition active:scale-[0.99] ${
                        orderType === type
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {type === 'DINE_IN' ? 'Dine-in' : type === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}
                    </button>
                  ))}
                </div>
                {orderType === 'DINE_IN' && (
                  <button
                    type="button"
                    onClick={() => setShowTablesModal(true)}
                    className="mt-2 w-full touch-manipulation rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 active:scale-[0.99] text-left"
                  >
                    🍽️ {selectedTable ? `Table #${tables.find(t => t._id === selectedTable)?.tableNumber ?? ''}` : 'Select Table…'}
                  </button>
                )}
              </div>

              {/* Customer */}
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">Customer</label>
                {selectedCustomerId ? (
                  <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-blue-900">{selectedCustomer?.name}</div>
                      <div className="truncate text-xs text-blue-700">{selectedCustomer?.phone}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedCustomerId(''); setSelectedCustomerLoyalty(null); setUsePoints(false); setPointsToUse(0); }}
                      className="touch-manipulation ml-2 shrink-0 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-extrabold text-blue-800 hover:bg-white"
                    >✕</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerSearch(true); }}
                        onFocus={() => setShowCustomerSearch(true)}
                        placeholder="Search customer…"
                        className="touch-manipulation w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      />
                      {showCustomerSearch && customerSearch && (
                        <div className="absolute bottom-full mb-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto z-60">
                          {filteredCustomers.length === 0 ? (
                            <div className="p-3 text-sm text-slate-500 text-center">No customers found</div>
                          ) : (
                            filteredCustomers.slice(0, 8).map((c) => (
                              <button
                                key={c._id}
                                type="button"
                                onClick={() => { setSelectedCustomerId(c._id); setCustomerSearch(''); setShowCustomerSearch(false); }}
                                className="touch-manipulation w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b last:border-b-0"
                              >
                                <div className="font-bold text-slate-900">{c.name}</div>
                                <div className="text-xs text-slate-500">{c.phone} · {c.tier}</div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNewCustomerModal(true)}
                      className="touch-manipulation h-11 w-11 shrink-0 flex items-center justify-center rounded-xl bg-green-500 text-white text-xl font-black hover:bg-green-600 active:scale-[0.99]"
                      title="Add Customer"
                      aria-label="Add Customer"
                    >+</button>
                  </div>
                )}
              </div>

              {/* Discount */}
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">Discount</label>
                <div className="flex gap-2">
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as ManualDiscountType)}
                    className="touch-manipulation w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">None</option>
                    <option value="PERCENTAGE">%</option>
                    <option value="FLAT">Rs.</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'PERCENTAGE' ? '%' : 'Amount'}
                    disabled={!discountType}
                    className="touch-manipulation w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Coupon */}
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">Coupon</label>
                {couponValidation?.success ? (
                  <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-green-800">{couponCode}</div>
                      <div className="text-xs text-green-700">
                        {couponValidation.coupon?.discountType === 'PERCENTAGE' ? `${couponValidation.coupon?.value}% off` : `${formatMoney(couponValidation.coupon?.value)} off`}
                      </div>
                    </div>
                    <button type="button" onClick={handleClearCoupon} className="touch-manipulation ml-2 shrink-0 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-extrabold text-green-800 hover:bg-white">✕</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponValidation(null); }}
                      placeholder="Enter code"
                      className={`touch-manipulation flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-sm ${couponValidation?.success === false ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                    />
                    <button
                      type="button"
                      onClick={handleValidateCoupon}
                      disabled={!couponCode.trim() || validatingCoupon}
                      className="touch-manipulation shrink-0 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-blue-600 disabled:opacity-50"
                    >{validatingCoupon ? '…' : 'Apply'}</button>
                  </div>
                )}
                {couponValidation?.success === false && (
                  <p className="text-xs font-semibold text-red-500 mt-1">{couponValidation.message}</p>
                )}
              </div>

              {/* Clear Cart */}
              <button
                type="button"
                onClick={() => { clearCart(); setSelectedTableForPayment(null); setShowPaymentModal(false); notify.success('Cart cleared'); }}
                className="touch-manipulation w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.99]"
              >
                🗑️ Clear Cart
              </button>
            </div>
          )}

          {/* Totals — ALWAYS VISIBLE at bottom of cart */}
          <div className="shrink-0 px-4 sm:px-5 pb-3 pt-2 border-t border-slate-200 bg-white space-y-1.5">
            {/* Subtotal — original price before any product discounts (matches receipt) */}
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal() + productDiscountTotal())}</span>
            </div>

            {productDiscountTotal() > 0 && (
              <div className="flex items-center justify-between text-sm text-emerald-600 font-semibold">
                <span>discount</span>
                <span>-{formatMoney(productDiscountTotal())}</span>
              </div>
            )}

            {getServiceCharge() > 0 && (
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Service Charge</span>
                <span>{formatMoney(getServiceCharge())}</span>
              </div>
            )}

            {getPackagingCharge() > 0 && (
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Packaging Charge</span>
                <span>{formatMoney(getPackagingCharge())}</span>
              </div>
            )}

            {calculateManualDiscount() > 0 && (
              <div className="flex items-center justify-between text-sm text-green-600">
                <span>Manual Discount</span>
                <span>- {formatMoney(calculateManualDiscount())}</span>
              </div>
            )}

            {calculateCouponDiscount() > 0 && (
              <div className="flex items-center justify-between text-sm text-green-600">
                <span>🎫 Coupon Discount</span>
                <span>- {formatMoney(calculateCouponDiscount())}</span>
              </div>
            )}

            {calculatePointsDiscount() > 0 && (
              <div className="flex items-center justify-between text-sm text-purple-600">
                <span>🎁 Loyalty Points ({pointsToUse} pts)</span>
                <span>- {formatMoney(calculatePointsDiscount())}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-lg font-bold text-slate-900 pt-2 border-t">
              <span>Total</span>
              <span>{formatMoney(finalTotal())}</span>
            </div>

            {/* Payment Method (immediate pay + table bill pay) */}
            {!postPaymentSale && (isPayingTable || !(orderType === 'DINE_IN' && selectedTable)) && (
              <div className="pt-2">
                <label className="block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'CASH', label: 'CASH', icon: '💵' },
                    { value: 'CARD', label: 'CARD', icon: '💳' },
                    { value: 'BANK', label: 'BANK', icon: '🏦' },
                  ] as const).map((opt) => {
                    const selected = paymentMethod === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPaymentMethod(opt.value)}
                        className={
                          "touch-manipulation rounded-xl border px-3 py-3 text-center text-sm font-extrabold transition active:scale-[0.99] " +
                          (selected
                            ? "border-indigo-600 bg-white text-indigo-700"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100")
                        }
                      >
                        <div className="text-lg leading-none">{opt.icon}</div>
                        <div className="mt-1 text-[11px] tracking-widest">{opt.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cart Action Buttons */}
            <div className="pt-3 flex items-center gap-2">
              {postPaymentSale ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPrintModal(true)}
                    className="touch-manipulation flex-1 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white hover:bg-emerald-700 active:scale-[0.99]"
                  >
                    🖨️ Print Bill
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPostPaymentSale(null); setShowPrintModal(false); }}
                    className="touch-manipulation flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-800 hover:bg-slate-50 active:scale-[0.99]"
                  >
                    Next →
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (isPayingTable) return handleTablePayment();
                    if (orderType === 'DINE_IN' && selectedTable) return handleAddToTable();
                    // For immediate sales: collect cash first when paying by cash
                    if (paymentMethod === 'CASH') {
                      setCollectAmountGiven(finalTotal());
                      return setShowCollectCashModal(true);
                    }
                    return handleCreateSale();
                  }}
                  disabled={
                    !currentShift ||
                    items.length === 0 ||
                    isProcessing
                  }
                  className="touch-manipulation w-full rounded-2xl bg-slate-900 px-8 py-4 text-base font-bold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  <span>
                    {isPayingTable
                      ? (processingPayment ? 'Processing…' : 'Pay Bill')
                      : (orderType === 'DINE_IN' && selectedTable
                        ? (addingToTable ? 'Adding…' : 'Add to Table')
                        : (creatingSale ? 'Processing…' : `Pay ${formatMoney(finalTotal())}`))}
                  </span>
                  {!isProcessing && <span>→</span>}
                </button>
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* ── Mobile Bottom Navigation Bar ── */}
      {/* ── Mobile Bottom Navigation Bar (5 tabs) ── */}
      {!isLgLayout && (
        <nav
          id="mobile-bottom-nav"
          className="shrink-0 bg-white border-t border-slate-200 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.10)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-stretch">

            {/* PRODUCTS */}
            <button
              id="mobile-tab-products"
              type="button"
              onClick={() => setMobileTab('products')}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors relative ${
                mobileTab === 'products' ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              {mobileTab === 'products' && <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-indigo-600" />}
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={mobileTab === 'products' ? 2.5 : 1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span className="text-[10px] font-bold tracking-wide">PRODUCTS</span>
            </button>

            {/* CART */}
            <button
              id="mobile-tab-cart"
              type="button"
              onClick={() => setMobileTab('cart')}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative transition-colors ${
                mobileTab === 'cart' ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              {mobileTab === 'cart' && <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-indigo-600" />}
              <div className="relative">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={mobileTab === 'cart' ? 2.5 : 1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {items.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-black text-white">
                    {items.reduce((s, i) => s + i.quantity, 0)}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold tracking-wide">CART</span>
            </button>

            {/* TABLES */}
            <button
              id="mobile-tab-tables"
              type="button"
              onClick={() => { setMobileTab('tables'); setTablesTab('available'); setShowTablesModal(true); }}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative transition-colors ${
                mobileTab === 'tables' ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              {mobileTab === 'tables' && <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-indigo-600" />}
              <div className="relative">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={mobileTab === 'tables' ? 2.5 : 1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 6h18M3 14h6m-6 4h6m5-4h7m-7 4h7" />
                </svg>
                {(occupiedTables.length + cleaningTables.length) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-black text-white">
                    {occupiedTables.length + cleaningTables.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold tracking-wide">TABLES</span>
            </button>

            {/* ORDERS */}
            <button
              id="mobile-tab-orders"
              type="button"
              onClick={() => { setMobileTab('orders'); openQuickView('Sales', '/sales'); }}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative transition-colors ${
                mobileTab === 'orders' ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              {mobileTab === 'orders' && <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-indigo-600" />}
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={mobileTab === 'orders' ? 2.5 : 1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-[10px] font-bold tracking-wide">ORDERS</span>
            </button>

            {/* MORE */}
            <button
              id="mobile-tab-more"
              type="button"
              onClick={() => setShowMobileMoreMenu(true)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative transition-colors ${
                showMobileMoreMenu ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              {showMobileMoreMenu && <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-indigo-600" />}
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={showMobileMoreMenu ? 2.5 : 1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" />
              </svg>
              <span className="text-[10px] font-bold tracking-wide">MORE</span>
            </button>

          </div>
        </nav>
      )}

      {/* ── Mobile "More" Bottom Sheet ── */}
      {!isLgLayout && showMobileMoreMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowMobileMoreMenu(false)}
            aria-hidden="true"
          />
          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white shadow-2xl">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="h-1 w-10 rounded-full bg-slate-300" />
            </div>
            <div className="px-5 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">

                {/* Summary */}
                <button
                  type="button"
                  onClick={() => { openQuickView('Sale Summary', '/dashboard'); setShowMobileMoreMenu(false); }}
                  className="touch-manipulation flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-slate-100 active:scale-[0.98] transition-all"
                >
                  <span className="text-2xl">📊</span>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">Summary</div>
                    <div className="text-[11px] text-slate-500">Sales overview</div>
                  </div>
                </button>

                {/* Sales */}
                <button
                  type="button"
                  onClick={() => { openQuickView('Sales', '/sales'); setShowMobileMoreMenu(false); }}
                  className="touch-manipulation flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-slate-100 active:scale-[0.98] transition-all"
                >
                  <span className="text-2xl">🧾</span>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">Sales</div>
                    <div className="text-[11px] text-slate-500">Transaction history</div>
                  </div>
                </button>

                {/* Discounts */}
                {hasPermission(PERMISSIONS.VIEW_DISCOUNTS) && (
                  <button
                    type="button"
                    onClick={() => { openQuickView('Discounts', '/discounts'); setShowMobileMoreMenu(false); }}
                    className="touch-manipulation flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-slate-100 active:scale-[0.98] transition-all"
                  >
                    <span className="text-2xl">🏷️</span>
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">Discounts</div>
                      <div className="text-[11px] text-slate-500">Manage offers</div>
                    </div>
                  </button>
                )}

                {/* Stocks */}
                <button
                  type="button"
                  onClick={() => { openQuickView('Stocks', '/inventory'); setShowMobileMoreMenu(false); }}
                  className="touch-manipulation flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-slate-100 active:scale-[0.98] transition-all"
                >
                  <span className="text-2xl">📦</span>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">Stocks</div>
                    <div className="text-[11px] text-slate-500">Inventory levels</div>
                  </div>
                </button>

                {/* Returns */}
                <button
                  type="button"
                  onClick={() => { openQuickView('Returns', '/returns?posOnly=1'); setShowMobileMoreMenu(false); }}
                  className="touch-manipulation flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-slate-100 active:scale-[0.98] transition-all"
                >
                  <span className="text-2xl">↩️</span>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">Returns</div>
                    <div className="text-[11px] text-slate-500">Process refunds</div>
                  </div>
                </button>

                {/* Reservations */}
                <button
                  type="button"
                  onClick={async () => {
                    setShowMobileMoreMenu(false);
                    setShowReservationsViewer(true);
                    setLoadingReservationsViewer(true);
                    try {
                      const res = await reservationsApi.getAll().catch(() => []);
                      setReservationsViewer(res || []);
                      setReservations((res || []).filter((r: Reservation) => r.status === 'CONFIRMED' || r.status === 'SEATED'));
                    } finally { setLoadingReservationsViewer(false); }
                  }}
                  className="touch-manipulation flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-slate-100 active:scale-[0.98] transition-all"
                >
                  <span className="text-2xl">📅</span>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">Reservations</div>
                    <div className="text-[11px] text-slate-500">Bookings</div>
                  </div>
                </button>

                {/* Kitchen */}
                <button
                  type="button"
                  onClick={async () => {
                    setShowMobileMoreMenu(false);
                    setShowKitchenViewer(true);
                    setLoadingKitchen(true);
                    try {
                      const orders = await kitchenApi.getQueue();
                      setKitchenOrders(orders);
                    } catch { setKitchenOrders([]); } finally { setLoadingKitchen(false); }
                  }}
                  className="touch-manipulation flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-slate-100 active:scale-[0.98] transition-all"
                >
                  <span className="text-2xl">👨‍🍳</span>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">Kitchen</div>
                    <div className="text-[11px] text-slate-500">Live queue</div>
                  </div>
                </button>

                {hasPermission(PERMISSIONS.VIEW_DASHBOARD) && (
                  <button
                    type="button"
                    onClick={() => { setShowMobileMoreMenu(false); navigate('/dashboard'); }}
                    className="touch-manipulation flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-slate-100 active:scale-[0.98] transition-all"
                  >
                    <span className="text-2xl">🏠</span>
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">Dashboard</div>
                      <div className="text-[11px] text-slate-500">Main menu</div>
                    </div>
                  </button>
                )}

              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={() => setShowMobileMoreMenu(false)}
                className="mt-4 w-full touch-manipulation rounded-2xl border border-slate-200 bg-slate-100 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-200 active:scale-[0.99]"
              >
                Close
              </button>
            </div>
            {/* safe area spacer */}
            <div style={{ height: 'env(safe-area-inset-bottom)' }} />
          </div>
        </>
      )}

      {/* Quick View Modal */}
      {quickView && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{quickView.title}</h3>
              <button
                onClick={() => setQuickView(null)}
                className="touch-manipulation rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 active:scale-[0.99]"
              >
                ✕
              </button>
            </div>
            <iframe
              title={quickView.title}
              src={quickView.path.includes('?') ? `${quickView.path}&embedded=1` : `${quickView.path}?embedded=1`}
              className="flex-1 w-full"
            />
          </div>
        </div>
      )}

      {/* ── Reservations Viewer (read-only) ── */}
      {showReservationsViewer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">📅</span>
                <h3 className="text-lg font-bold text-slate-900">Reservations</h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Cashier</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingReservation(null);
                    setReservationFormData({
                      tableId: selectedTable || '',
                      customerName: selectedCustomer?.name || '',
                      customerPhone: selectedCustomer?.phone || '',
                      guestCount: 1,
                      reservationDateTime: '',
                      notes: '',
                    });
                    setShowReservationEditor(true);
                  }}
                  className="touch-manipulation rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-slate-800 active:scale-[0.99]"
                >
                  + New
                </button>
                <button
                  onClick={() => {
                    setShowReservationEditor(false);
                    setEditingReservation(null);
                    setShowReservationsViewer(false);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 text-lg transition"
                >✕</button>
              </div>
            </div>

            <div className="shrink-0 px-6 py-3 border-b border-slate-100 bg-white">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-bold text-slate-600">Status</label>
                <select
                  value={reservationsViewerStatusFilter}
                  onChange={(e) => setReservationsViewerStatusFilter(e.target.value as any)}
                  className="touch-manipulation rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800"
                >
                  <option value="ALL">ALL</option>
                  <option value="PENDING">PENDING</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="SEATED">SEATED</option>
                  <option value="CANCELLED">CANCELLED</option>
                  <option value="COMPLETED">COMPLETED</option>
                  
                </select>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setLoadingReservationsViewer(true);
                      const reservationsRes = await reservationsApi.getAll().catch(() => []);
                      setReservationsViewer(reservationsRes || []);
                      const activeReservations = (reservationsRes || []).filter(
                        (r: Reservation) => r.status === 'CONFIRMED' || r.status === 'SEATED'
                      );
                      setReservations(activeReservations);
                    } finally {
                      setLoadingReservationsViewer(false);
                    }
                  }}
                  className="touch-manipulation ml-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50 active:scale-[0.99]"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5">
              {loadingReservationsViewer ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900 mr-3"></div>
                  Loading reservations…
                </div>
              ) : sortedReservationsViewer.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">
                  {reservationsViewerStatusFilter === 'ALL' ? 'No reservations found' : 'No reservations for this status'}
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedReservationsViewer.map((r) => {
                    const dt = new Date(r.reservationDateTime);

                    const tableObj = typeof r.table === 'object'
                      ? (r.table as any)
                      : tables.find((t) => t._id === r.table);

                    const tableLabel = tableObj
                      ? `Table ${tableObj.tableNumber}${tableObj.section ? ` (${tableObj.section})` : ''}`
                      : 'Table';

                    const statusStyles: Record<string, string> = {
                      PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
                      CONFIRMED: 'bg-amber-100 text-amber-800 border-amber-200',
                      SEATED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                      CANCELLED: 'bg-rose-100 text-rose-800 border-rose-200',
                      COMPLETED: 'bg-slate-100 text-slate-700 border-slate-200',
                      NO_SHOW: 'bg-rose-100 text-rose-800 border-rose-200',
                    };

                    const canSeat = r.status === 'CONFIRMED';
                    const canStatusUpdate = !['SEATED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(r.status);
                    const canCancel = r.status === 'PENDING' || r.status === 'CONFIRMED';

                    return (
                      <div key={r._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate">{r.customerName}</div>
                            <div className="text-xs font-semibold text-slate-600 truncate">{r.customerPhone}</div>
                            <div className="text-xs text-slate-500 mt-1">{dt.toLocaleString()}</div>
                          </div>
                          <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[r.status] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            {r.status}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                            {tableLabel}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                            👥 {r.guestCount}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {canSeat && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  setLoadingReservationsViewer(true);
                                  await reservationsApi.seat(r._id);

                                  const tableId = typeof r.table === 'object' ? (r.table as any)._id : r.table;
                                  if (tableId) {
                                    try {
                                      await tablesApi.updateStatus(tableId, 'OCCUPIED');
                                    } catch {
                                      // ignore; backend may already update
                                    }
                                  }

                                  notify.success('Customer seated');
                                  const updated = await reservationsApi.getAll().catch(() => []);
                                  setReservationsViewer(updated || []);
                                  const activeReservations = (updated || []).filter(
                                    (x: Reservation) => x.status === 'CONFIRMED' || x.status === 'SEATED'
                                  );
                                  setReservations(activeReservations);
                                } catch (err: any) {
                                  notify.error(err?.response?.data?.message || 'Failed to seat reservation');
                                } finally {
                                  setLoadingReservationsViewer(false);
                                }
                              }}
                              className="touch-manipulation rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-700 active:scale-[0.99]"
                            >
                              Seat
                            </button>
                          )}

                          {canStatusUpdate && (
                            <select
                              value={r.status}
                              onChange={async (e) => {
                                const next = e.target.value as ReservationStatus;
                                try {
                                  setLoadingReservationsViewer(true);
                                  await reservationsApi.updateStatus(r._id, next);
                                  notify.success(`Status: ${next}`);
                                  const updated = await reservationsApi.getAll().catch(() => []);
                                  setReservationsViewer(updated || []);
                                  const activeReservations = (updated || []).filter(
                                    (x: Reservation) => x.status === 'CONFIRMED' || x.status === 'SEATED'
                                  );
                                  setReservations(activeReservations);
                                } catch (err: any) {
                                  notify.error(err?.response?.data?.message || 'Failed to update status');
                                } finally {
                                  setLoadingReservationsViewer(false);
                                }
                              }}
                              className="touch-manipulation rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800"
                            >
                              <option value="PENDING">PENDING</option>
                              <option value="CONFIRMED">CONFIRMED</option>
                              <option value="CANCELLED">CANCELLED</option>
                              <option value="NO_SHOW">NO_SHOW</option>
                              <option value="COMPLETED">COMPLETED</option>
                            </select>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setEditingReservation(r);
                              setReservationFormData({
                                tableId: typeof r.table === 'object' ? (r.table as any)._id : (r.table as string),
                                customerName: r.customerName,
                                customerPhone: r.customerPhone,
                                guestCount: r.guestCount,
                                reservationDateTime: toDateTimeLocalValue(r.reservationDateTime),
                                notes: r.notes || '',
                              });
                              setShowReservationEditor(true);
                            }}
                            className="touch-manipulation rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-slate-800 border border-slate-200 hover:bg-slate-50 active:scale-[0.99]"
                          >
                            Edit
                          </button>

                          {canCancel && (
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = window.confirm('Cancel this reservation?');
                                if (!ok) return;
                                try {
                                  setLoadingReservationsViewer(true);
                                  await reservationsApi.delete(r._id);
                                  notify.success('Reservation cancelled');
                                  const updated = await reservationsApi.getAll().catch(() => []);
                                  setReservationsViewer(updated || []);
                                  const activeReservations = (updated || []).filter(
                                    (x: Reservation) => x.status === 'CONFIRMED' || x.status === 'SEATED'
                                  );
                                  setReservations(activeReservations);
                                } catch (err: any) {
                                  notify.error(err?.response?.data?.message || 'Failed to cancel reservation');
                                } finally {
                                  setLoadingReservationsViewer(false);
                                }
                              }}
                              className="touch-manipulation rounded-xl bg-rose-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-rose-700 active:scale-[0.99]"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-100 px-6 py-3 flex items-center justify-between bg-slate-50 rounded-b-2xl">
              <p className="text-xs text-slate-400">Create, edit, seat, or cancel reservations</p>
              <button
                onClick={() => {
                  setShowReservationEditor(false);
                  setEditingReservation(null);
                  setShowReservationsViewer(false);
                }}
                className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-white transition"
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Reservation Editor Modal */}
      {showReservationsViewer && showReservationEditor && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-70 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">{editingReservation ? 'Edit Reservation' : 'New Reservation'}</h3>
              <button
                type="button"
                onClick={() => setShowReservationEditor(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 text-lg transition"
              >✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer Name</label>
                <input
                  value={reservationFormData.customerName}
                  onChange={(e) => setReservationFormData({ ...reservationFormData, customerName: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                  placeholder="Enter customer name"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  value={reservationFormData.customerPhone}
                  onChange={(e) => setReservationFormData({ ...reservationFormData, customerPhone: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                  placeholder="Enter phone number"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Table</label>
                <select
                  value={reservationFormData.tableId}
                  onChange={(e) => setReservationFormData({ ...reservationFormData, tableId: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select table</option>
                  {(() => {
                    const currentId = reservationFormData.tableId;
                    const currentTable = currentId ? tables.find((t) => t._id === currentId) : null;
                    const base = availableTables;
                    const list = currentTable && !base.some((t) => t._id === currentTable._id)
                      ? [currentTable, ...base]
                      : base;
                    return list.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.tableNumber}{t.section ? ` (${t.section})` : ''} (Cap: {t.capacity})
                      </option>
                    ));
                  })()}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Guests</label>
                  <input
                    type="number"
                    min={1}
                    value={reservationFormData.guestCount}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, guestCount: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={reservationFormData.reservationDateTime}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, reservationDateTime: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes (Optional)</label>
                <input
                  value={reservationFormData.notes || ''}
                  onChange={(e) => setReservationFormData({ ...reservationFormData, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                  placeholder="Special requests, etc."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowReservationEditor(false)}
                className="touch-manipulation rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.99]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  savingReservation ||
                  !reservationFormData.customerName ||
                  !reservationFormData.customerPhone ||
                  !reservationFormData.tableId ||
                  !reservationFormData.reservationDateTime
                }
                onClick={async () => {
                  try {
                    setSavingReservation(true);
                    if (editingReservation) {
                      await reservationsApi.update(editingReservation._id, reservationFormData);
                      notify.success('Reservation updated');
                    } else {
                      await reservationsApi.create(reservationFormData);
                      notify.success('Reservation created');
                    }

                    const updated = await reservationsApi.getAll().catch(() => []);
                    setReservationsViewer(updated || []);
                    const activeReservations = (updated || []).filter(
                      (x: Reservation) => x.status === 'CONFIRMED' || x.status === 'SEATED'
                    );
                    setReservations(activeReservations);

                    setShowReservationEditor(false);
                    setEditingReservation(null);
                  } catch (err: any) {
                    notify.error(err?.response?.data?.message || 'Failed to save reservation');
                  } finally {
                    setSavingReservation(false);
                  }
                }}
                className="touch-manipulation rounded-xl bg-slate-900 px-6 py-2 text-sm font-extrabold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {savingReservation ? 'Saving…' : (editingReservation ? 'Save' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tables Modal (Touch friendly) */}
      {showTablesModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300">
          <div className="bg-white rounded-4xl w-full max-w-5xl max-h-[90vh] flex flex-col premium-shadow-xl border border-white/20 overflow-hidden">

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0 bg-slate-50/50 backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-100">
                  <span className="text-xl">🍽️</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Tables Management</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {availableTables.length} Online · {occupiedTables.length} Active
                      {cleaningTables.length > 0 && ` · ${cleaningTables.length} Cleaning`}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowTablesModal(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-900 transition-all hover-lift"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Tabs ── */}
            <div className="flex px-8 py-2 border-b border-slate-100 shrink-0 bg-white gap-2">
              <button
                onClick={() => setTablesTab('available')}
                className={`py-3 px-6 text-sm font-bold rounded-xl tab-transition flex items-center gap-3 ${
                  tablesTab === 'available'
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${tablesTab === 'available' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                Available
                <span className={`ml-1 px-2 py-0.5 rounded-lg text-[10px] ${tablesTab === 'available' ? 'bg-emerald-200/50' : 'bg-slate-100'}`}>
                  {availableTables.length}
                </span>
              </button>
              <button
                onClick={() => setTablesTab('active')}
                className={`py-3 px-6 text-sm font-bold rounded-xl tab-transition flex items-center gap-3 ${
                  tablesTab === 'active'
                    ? 'bg-amber-50 text-amber-700 shadow-sm border border-amber-100'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${tablesTab === 'active' ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`}></span>
                Active Orders
                <span className={`ml-1 px-2 py-0.5 rounded-lg text-[10px] ${tablesTab === 'active' ? 'bg-amber-200/50' : 'bg-slate-100'}`}>
                  {occupiedTables.length}
                </span>
              </button>
              <button
                onClick={() => setTablesTab('cleaning')}
                className={`py-3 px-6 text-sm font-bold rounded-xl tab-transition flex items-center gap-3 ${
                  tablesTab === 'cleaning'
                    ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${tablesTab === 'cleaning' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`}></span>
                Cleaning
                <span className={`ml-1 px-2 py-0.5 rounded-lg text-[10px] ${tablesTab === 'cleaning' ? 'bg-indigo-200/50' : 'bg-slate-100'}`}>
                  {cleaningTables.length}
                </span>
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div className="overflow-y-auto flex-1 px-8 py-8 bg-slate-50/30">

              {/* ── TAB 1: Available Tables ── */}
              {tablesTab === 'available' && (
                availableTables.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 glass-panel rounded-4xl">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-3xl">☕</div>
                    <div className="text-center">
                      <p className="text-base font-bold text-slate-900">No tables available</p>
                      <p className="text-xs text-slate-400 mt-1">Wait for a table to be cleared or cleaned.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {availableTables.map((t) => (
                      <button
                        key={t._id}
                        onClick={() => {
                          setOrderType('DINE_IN');
                          setSelectedTable(t._id);
                          setShowTablesModal(false);
                        }}
                        className="group relative touch-manipulation flex flex-col items-center justify-center rounded-4xl border border-emerald-100 bg-white px-2 py-6 text-center premium-shadow hover:border-emerald-500 hover:shadow-emerald-100 transition-all hover-lift"
                      >
                        <div className="absolute top-3 right-4 h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                        <span className="text-2xl font-black text-slate-900 group-hover:text-emerald-700 leading-tight">
                          {t.tableNumber}
                        </span>
                        {t.section && (
                          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate w-full px-4">
                            {t.section}
                          </span>
                        )}
                        <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-600 border border-emerald-100">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {t.capacity} SEATS
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}

              {/* ── TAB 2: Active Orders ── */}
              {tablesTab === 'active' && (
                occupiedTables.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 glass-panel rounded-4xl">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-3xl">📭</div>
                    <div className="text-center">
                      <p className="text-base font-bold text-slate-900">No active tables</p>
                      <p className="text-xs text-slate-400 mt-1">Tables will appear here once guests are seated.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {occupiedTables.map((t) => {
                      const saleIdFromTable = t.currentSale
                        ? (typeof t.currentSale === 'string' ? t.currentSale : (t.currentSale as any)._id)
                        : null;
                      const saleId = saleIdFromTable || tableSaleIdByTable[t._id] || null;
                      return (
                        <div
                          key={t._id}
                          className="flex flex-col rounded-[2.5rem] border border-amber-100 bg-white p-6 shadow-xl shadow-amber-50/50 hover:shadow-amber-100 transition-all border-l-4 border-l-amber-400"
                        >
                          {/* Table info */}
                          <div className="flex items-start justify-between mb-6">
                            <div>
                              <div className="text-xl font-black text-slate-900 leading-none">Table {t.tableNumber}</div>
                              <div className="text-[11px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
                                {t.section ? `${t.section} · ` : ''}{t.capacity} SEATS
                              </div>
                            </div>
                            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-black text-amber-700 shadow-sm border border-amber-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                               OCCUPIED
                            </span>
                          </div>

                          {/* 3 buttons: View | Add Items | Pay Bill */}
                          <div className="grid grid-cols-1 gap-2">
                            <div className="grid grid-cols-2 gap-2">
                              {/* VIEW */}
                              <button
                                onClick={async () => {
                                  setLoadingViewOrder(true);
                                  try {
                                    let items: any[] = [];
                                    let total = 0;

                                    let effectiveSaleId: string | null = saleId;
                                    if (!effectiveSaleId) {
                                      try {
                                        const fresh = await tablesApi.getById(t._id);
                                        if (fresh?.currentSale) {
                                          effectiveSaleId =
                                            typeof fresh.currentSale === 'string'
                                              ? fresh.currentSale
                                              : (fresh.currentSale as any)._id;
                                          if (effectiveSaleId) {
                                            setTableSaleIdByTable((prev) => ({ ...prev, [t._id]: effectiveSaleId! }));
                                          }
                                        }
                                      } catch {
                                        // ignore
                                      }
                                    }

                                    if (effectiveSaleId) {
                                      try {
                                        const sale = await getSaleById(effectiveSaleId);
                                        items = (sale?.items || []).map((si: any) => ({
                                          name: typeof si.product === 'object' && si.product
                                            ? (si.product.name || si.product.sku || 'Item')
                                            : (si.productName || si.name || 'Item'),
                                          quantity: si.quantity,
                                          price: si.price,
                                          status: sale.status,
                                        }));
                                        total = sale?.grandTotal ?? 0;
                                      } catch (apiErr: any) {
                                        const localOrder = tableOrders.find(o => o.tableId === t._id);
                                        if (localOrder && localOrder.items.length > 0) {
                                          items = localOrder.items.map(i => ({
                                            name: i.name,
                                            quantity: i.quantity,
                                            price: i.price,
                                            status: 'OPEN',
                                          }));
                                          total = localOrder.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
                                        } else {
                                          notify.error('Order record not found.');
                                          return;
                                        }
                                      }
                                    } else {
                                      const localOrder = tableOrders.find(o => o.tableId === t._id);
                                      if (localOrder && localOrder.items.length > 0) {
                                        items = localOrder.items.map(i => ({
                                          name: i.name,
                                          quantity: i.quantity,
                                          price: i.price,
                                          status: 'OPEN',
                                        }));
                                        total = localOrder.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
                                      } else {
                                        notify.error('No items on this table yet');
                                        return;
                                      }
                                    }
                                    setViewOrderTable({ table: t, items, total });
                                  } catch (err) {
                                    notify.error('Could not load order');
                                  } finally {
                                    setLoadingViewOrder(false);
                                  }
                                }}
                                disabled={loadingViewOrder}
                                className="touch-manipulation flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 py-3 text-xs font-bold text-slate-700 hover:bg-white hover:border-slate-300 transition-all hover-lift active:scale-95 disabled:opacity-40"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                View Order
                              </button>

                              {/* ADD ITEMS */}
                              <button
                                onClick={() => {
                                  setOrderType('DINE_IN');
                                  setSelectedTable(t._id);
                                  setShowTablesModal(false);
                                }}
                                className="touch-manipulation flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition-all hover-lift active:scale-95"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Add More
                              </button>
                            </div>

                            {/* PAY BILL */}
                            <button
                              onClick={() => {
                                setShowTablesModal(false);
                                handleOpenTableBill(t);
                              }}
                              className="touch-manipulation flex items-center justify-center gap-2 rounded-[1.25rem] bg-emerald-600 py-4 text-sm font-black text-white hover:bg-emerald-700 transition-all hover-lift active:scale-95 shadow-lg shadow-emerald-100 button-glow-emerald"
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              Settle Bill
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* ── TAB 3: Cleaning ── */}
              {tablesTab === 'cleaning' && (
                cleaningTables.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 glass-panel rounded-4xl">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-3xl">✨</div>
                    <div className="text-center">
                      <p className="text-base font-bold text-slate-900">All set!</p>
                      <p className="text-xs text-slate-400 mt-1">No tables requiring immediate cleaning.</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-6 rounded-3xl border border-indigo-100 bg-indigo-50/50 px-6 py-4 flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">🧹</div>
                      <div>
                        <p className="text-sm font-bold text-indigo-900">Physical Clearing Required</p>
                        <p className="text-[11px] font-medium text-indigo-600 mt-0.5 leading-relaxed italic">The guest has paid. Once the table is physically sanitized, mark it as available to allow new guests.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {cleaningTables.map((t) => (
                        <div
                          key={t._id}
                          className="flex flex-col items-center rounded-4xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-200/50 transition-all border-b-4 border-b-indigo-400"
                        >
                          <div className="text-center mb-6">
                            <div className="text-xl font-black text-slate-900">Table {t.tableNumber}</div>
                            {t.section && <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{t.section}</div>}
                            <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-50 text-[10px] font-bold text-slate-400 border border-slate-100">
                              {t.capacity} SEATS
                            </div>
                          </div>
                          
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Release Table ${t.tableNumber}?\nConfirm physical cleaning is complete.`)) return;
                              try {
                                await tablesApi.updateStatus(t._id, 'AVAILABLE');

                                setTableSaleIdByTable((prev) => {
                                  const copy = { ...prev };
                                  delete copy[t._id];
                                  return copy;
                                });

                                const refreshed = await tablesApi.getAll();
                                setTables(refreshed);
                                notify.success(`Table ${t.tableNumber} is ready`);
                              } catch {
                                notify.error('Error updating status');
                              }
                            }}
                            className="w-full touch-manipulation flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-xs font-bold text-white hover:bg-indigo-700 transition-all hover-lift active:scale-95 shadow-lg shadow-indigo-100"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Ready to Open
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}

            </div>

            {/* ── Footer ── */}
            <div className="shrink-0 border-t border-slate-100 px-8 py-5 flex items-center justify-between bg-slate-50/50 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[10px]">ℹ️</div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {tablesTab === 'available' ? 'Tap a table to seat guests' :
                   tablesTab === 'active' ? 'Active Table Controls — Status locked during order' :
                   'Physical validation required for cleaning status'}
                </p>
              </div>
              <button
                onClick={() => setShowTablesModal(false)}
                className="rounded-2xl border border-slate-200 bg-white px-8 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all hover-lift active:scale-95 shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Order Modal ── */}
      {viewOrderTable && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-60 p-4 transition-all duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col max-h-[85vh] overflow-hidden premium-shadow-xl border border-white/20">
            
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Table {viewOrderTable.table.tableNumber}</h3>
                </div>
                {viewOrderTable.table.section && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{viewOrderTable.table.section} SECTION</p>
                )}
              </div>
              <button
                onClick={() => setViewOrderTable(null)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-900 transition-all hover-lift"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Items List */}
            <div className="overflow-y-auto flex-1 px-8 py-6 bg-white">
              {viewOrderTable.items.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="text-4xl mb-4">📝</div>
                  <p className="text-sm font-bold text-slate-400">Order is empty</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">
                    <span>Menu Item</span>
                    <div className="flex gap-8">
                      <span className="w-8 text-center">QTY</span>
                      <span className="w-20 text-right">TOTAL</span>
                    </div>
                  </div>

                  {viewOrderTable.items.map((item, i) => (
                    <div key={i} className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black tracking-tight ${
                            item.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                            item.status === 'OPEN' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {item.status}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">@{formatMoney(item.price)}</span>
                        </div>
                      </div>
                      <div className="flex gap-8 shrink-0 ml-4">
                        <span className="w-8 text-center text-sm font-black text-slate-900">{item.quantity}</span>
                        <span className="w-20 text-right text-sm font-black text-slate-900 font-mono tracking-tighter">
                          {formatMoney(item.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Receipt Style Divider */}
                  <div className="border-t-2 border-dashed border-slate-100 pt-6 mt-6"></div>
                </div>
              )}
            </div>

            {/* Footer / Total */}
            <div className="shrink-0 border-t border-slate-100 px-8 py-6 flex items-center justify-between bg-slate-50/50 backdrop-blur-md">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Grand Total</p>
                <p className="text-sm text-slate-400 italic">Incl. all taxes</p>
              </div>
              <div className="text-3xl font-black text-slate-900 font-mono tracking-tighter">
                {formatMoney(viewOrderTable.total)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Kitchen Orders Viewer (read-only) ── */}
      {showKitchenViewer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">👨‍🍳</span>
                <h3 className="text-lg font-bold text-slate-900">Kitchen Orders</h3>
                <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">View only</span>
              </div>
              <button
                onClick={() => setShowKitchenViewer(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 text-lg transition"
              >✕</button>
            </div>

            <div className="shrink-0 px-6 py-3 border-b border-slate-100 bg-white">
              <div className="flex flex-wrap items-center gap-2">
                {(['ALL', 'PENDING', 'PREPARING', 'READY'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setKitchenStatusFilter(st)}
                    className={`touch-manipulation rounded-xl px-4 py-2 text-sm font-bold border transition active:scale-[0.99] ${
                      kitchenStatusFilter === st
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st}
                  </button>
                ))}

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setKitchenViewMode('QUEUE')}
                    className={`touch-manipulation rounded-xl px-4 py-2 text-sm font-bold border transition active:scale-[0.99] ${
                      kitchenViewMode === 'QUEUE'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Queue
                  </button>
                  <button
                    type="button"
                    onClick={() => setKitchenViewMode('TABLES')}
                    className={`touch-manipulation rounded-xl px-4 py-2 text-sm font-bold border transition active:scale-[0.99] ${
                      kitchenViewMode === 'TABLES'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Tables
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5">
              {loadingKitchen ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600 mr-3"></div>
                  Loading kitchen orders…
                </div>
              ) : kitchenOrders.filter((o) => o.status !== 'SERVED').length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">No active kitchen orders</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[...kitchenOrders]
                    .filter((o) => o.status !== 'SERVED')
                    .filter((o) => (kitchenStatusFilter === 'ALL' ? true : o.status === kitchenStatusFilter))
                    .filter((o) => (kitchenViewMode === 'TABLES' ? isDineInKitchenOrder(o) : !isDineInKitchenOrder(o)))
                    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                    .map((order) => {
                    const statusStyles: Record<string, string> = {
                      PENDING:   'bg-amber-100 text-amber-800 border-amber-200',
                      PREPARING: 'bg-blue-100 text-blue-800 border-blue-200',
                      READY:     'bg-emerald-100 text-emerald-800 border-emerald-200',
                    };
                    const statusIcons: Record<string, string> = {
                      PENDING: '⏳', PREPARING: '🔥', READY: '✅',
                    };
                    const waitMins = order.waitingMinutes ?? Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60000);

                    const saleInvoiceNumber = typeof order.sale === 'object' && order.sale ? (order.sale as any).invoiceNumber : '';
                    const dailySeq = kitchenDailySequenceMap[order._id];
                    const orderNo = (order as any).orderNumber || (dailySeq ? String(dailySeq) : '') || saleInvoiceNumber || '';

                    return (
                      <div key={order._id} className={`rounded-2xl border-2 p-4 ${
                        order.status === 'PENDING'   ? 'border-amber-200 bg-amber-50' :
                        order.status === 'PREPARING' ? 'border-blue-200 bg-blue-50' :
                        order.status === 'READY'     ? 'border-emerald-200 bg-emerald-50' :
                        'border-slate-200 bg-slate-50'
                      }`}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            {orderNo && (
                              <div className="text-base font-black text-slate-900 font-mono tracking-tight">#{orderNo}</div>
                            )}
                            {order.tableNumber && (
                              <div className="text-sm font-bold text-slate-900">Table {order.tableNumber}</div>
                            )}
                            <div className="text-xs text-slate-500 mt-0.5">{waitMins}m waiting</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {kitchenBillPrintingEnabled && (
                              <button
                                type="button"
                                onClick={() => handlePrintKitchenOrder(order)}
                                className="touch-manipulation rounded-xl bg-white/70 px-3 py-2 text-xs font-extrabold text-slate-800 border border-white/40 hover:bg-white active:scale-[0.99]"
                              >
                                Print
                              </button>
                            )}
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[order.status] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                              {statusIcons[order.status]} {order.status}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between py-1 border-t border-white/60">
                              <span className="text-sm font-medium text-slate-800">{item.name}</span>
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-800 shadow-sm">
                                {item.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-100 px-6 py-3 flex items-center justify-between bg-slate-50 rounded-b-2xl">
              <p className="text-xs text-slate-400">Read-only view · Status updates are managed from the Kitchen screen</p>
              <button
                onClick={() => setShowKitchenViewer(false)}
                className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-white transition"
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Open Shift Modal */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Open New Shift</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Opening Cash Amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                placeholder="Enter opening cash..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowShiftModal(false)}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleOpenShift}
                disabled={processingShift}
                className="flex-1 rounded-xl bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {processingShift ? 'Opening...' : 'Open Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {showCloseShiftModal && currentShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Close Shift</h3>
            <p className="mb-4 text-xs text-slate-500">Auto closes at 12:00 AM if still open.</p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Closing Cash Amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                placeholder="Enter closing cash..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseShiftModal(false)}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseShift}
                disabled={processingCloseShift}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {processingCloseShift ? 'Closing...' : 'Close Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedTableForPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                💳 Pay Bill - Table {selectedTableForPayment.tableNumber}
              </h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedTableForPayment(null);
                  clearCart();
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Bill Items */}
            <div className="mb-4 bg-slate-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-slate-600 mb-2">Order Items</h4>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>
                      {item.name} × {item.quantity}
                    </span>
                    <span className="font-medium">{formatMoney(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bill Summary */}
            <div className="mb-4 space-y-2 border-t border-slate-200 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal</span>
                <span>{formatMoney(subtotal())}</span>
              </div>
              {getServiceCharge() > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Service Charge</span>
                  <span>{formatMoney(getServiceCharge())}</span>
                </div>
              )}
              {getPackagingCharge() > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Packaging Charge</span>
                  <span>{formatMoney(getPackagingCharge())}</span>
                </div>
              )}
              {calculateDiscount() > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span>- {formatMoney(calculateDiscount())}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-lg text-green-600 pt-2 border-t">
                <span>Total Amount</span>
                <span>{formatMoney(finalTotal())}</span>
              </div>
            </div>

            {/* Payment Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'CASH', label: 'CASH', icon: '💵' },
                    { value: 'CARD', label: 'CARD', icon: '💳' },
                    { value: 'BANK', label: 'BANK', icon: '🏦' },
                  ] as const).map((opt) => {
                    const selected = paymentMethod === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPaymentMethod(opt.value)}
                        className={
                          "rounded-xl border px-4 py-3 text-center text-sm font-extrabold transition active:scale-[0.99] " +
                          (selected
                            ? "border-indigo-600 bg-white text-indigo-700"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100")
                        }
                      >
                        <div className="text-lg leading-none">{opt.icon}</div>
                        <div className="mt-1 text-[11px] tracking-widest">{opt.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSelectedTableForPayment(null);
                    clearCart();
                  }}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTablePayment}
                  disabled={processingPayment}
                  className="flex-1 rounded-xl bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {processingPayment ? 'Processing...' : `Pay ${formatMoney(finalTotal())}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">➕ Add New Customer</h3>
              <button
                onClick={() => {
                  setShowNewCustomerModal(false);
                  setNewCustomerData({ name: "", phone: "", email: "" });
                }}
                className="touch-manipulation text-2xl text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-base font-semibold text-slate-700 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={newCustomerData.name}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-5 py-4 text-base"
                  placeholder="Enter customer name"
                />
              </div>
              
              <div>
                <label className="block text-base font-semibold text-slate-700 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={newCustomerData.phone}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-5 py-4 text-base"
                  placeholder="Enter phone number"
                />
              </div>
              
              <div>
                <label className="block text-base font-semibold text-slate-700 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={newCustomerData.email}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-5 py-4 text-base"
                  placeholder="Enter email address"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewCustomerModal(false);
                  setNewCustomerData({ name: "", phone: "", email: "" });
                }}
                className="flex-1 rounded-xl border border-slate-300 px-5 py-4 text-base font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomer}
                className="flex-1 rounded-xl bg-green-600 px-5 py-4 text-base font-semibold text-white hover:bg-green-700"
              >
                Create Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Details Modal */}
      {showCustomerDetailsModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">👤 Customer Details</h3>
              <button
                onClick={() => setShowCustomerDetailsModal(false)}
                className="touch-manipulation text-2xl text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 px-5 py-4">
                <div className="text-sm text-slate-500">Name</div>
                <div className="text-lg font-semibold text-slate-900">{selectedCustomer.name}</div>
              </div>
              <div className="rounded-xl border border-slate-200 px-5 py-4">
                <div className="text-sm text-slate-500">Phone</div>
                <div className="text-lg font-semibold text-slate-900">{selectedCustomer.phone}</div>
              </div>
              <div className="rounded-xl border border-slate-200 px-5 py-4">
                <div className="text-sm text-slate-500">Tier</div>
                <div className="text-lg font-semibold text-slate-900">{selectedCustomer.tier || 'Regular'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 px-5 py-4">
                <div className="text-sm text-slate-500">Loyalty Points</div>
                <div className="text-lg font-semibold text-slate-900">
                  {selectedCustomerLoyalty ?? 0} pts
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setShowCustomerDetailsModal(false)}
                className="w-full rounded-xl border border-slate-300 px-5 py-4 text-base font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-7 w-full max-w-sm shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Log out?</h3>
              <p className="text-sm text-slate-500 mb-6">Are you sure you want to log out?</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); logout(); }}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-base font-semibold text-white hover:bg-red-700 transition"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Bill Modal (shown after payment) ── */}
      {showPrintModal && postPaymentSale && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 text-center">
              <div className="text-3xl mb-2">🧾</div>
              <h2 className="text-lg font-extrabold text-white tracking-tight">Print Bill</h2>
              <p className="text-xs text-slate-400 mt-1">Invoice #{postPaymentSale.invoiceNumber}</p>
            </div>

            {/* Print Options */}
            <div className="p-6 space-y-3">
              {/* Customer Bill */}
              <button
                type="button"
                disabled={printingReceipt}
                onClick={handlePrintReceipt}
                className="touch-manipulation w-full flex items-center gap-4 rounded-2xl border-2 border-slate-200 bg-slate-50 px-5 py-4 text-left hover:border-slate-900 hover:bg-slate-100 transition-all active:scale-[0.99] disabled:opacity-60"
              >
                <span className="text-3xl shrink-0">🧾</span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900">
                    {printingReceipt ? 'Printing…' : 'Customer Bill'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">Thermal receipt for customer</div>
                </div>
                <svg className="ml-auto h-5 w-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>

              {/* Kitchen Bill */}
              <button
                type="button"
                disabled={printingKitchen}
                onClick={async () => {
                  if (!postPaymentSale) return;
                  setPrintingKitchen(true);
                  try {
                    const kitchenOrder: any = {
                      _id: postPaymentSale._id,
                      // Use invoice-derived short number so kitchen ticket always has the right #
                      orderNumber: deriveOrderNumber(postPaymentSale.invoiceNumber),
                      sale: postPaymentSale,
                      status: 'READY',
                      createdAt: postPaymentSale.createdAt,
                      tableNumber: typeof postPaymentSale.table === 'object'
                        ? (postPaymentSale.table as any)?.tableNumber
                        : undefined,
                      section: typeof postPaymentSale.table === 'object'
                        ? (postPaymentSale.table as any)?.section
                        : undefined,
                      items: (postPaymentSale.items || []).map((it: any) => ({
                        name: typeof it.product === 'object' ? it.product?.name : 'Item',
                        quantity: it.quantity,
                      })),
                    };
                    await handlePrintKitchenOrder(kitchenOrder);
                  } finally {
                    setPrintingKitchen(false);
                  }
                }}
                className="touch-manipulation w-full flex items-center gap-4 rounded-2xl border-2 border-slate-200 bg-slate-50 px-5 py-4 text-left hover:border-orange-500 hover:bg-orange-50 transition-all active:scale-[0.99] disabled:opacity-60"
              >
                <span className="text-3xl shrink-0">👨‍🍳</span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900">
                    {printingKitchen ? 'Printing…' : 'Kitchen Bill'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">Kitchen copy for preparation</div>
                </div>
                <svg className="ml-auto h-5 w-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>

            {/* Done */}
            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={() => { setShowPrintModal(false); setPostPaymentSale(null); }}
                className="touch-manipulation w-full rounded-2xl bg-slate-900 px-6 py-4 text-sm font-extrabold text-white hover:bg-slate-800 active:scale-[0.99] transition-all"
              >
                ✓ Done — Next Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Cash Modal (for immediate cash payments) */}
      {showCollectCashModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Collect Cash</h3>
              <button onClick={() => setShowCollectCashModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="text-slate-600 text-sm">Total due</div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{formatMoney(finalTotal())}</div>

            <label className="block text-sm text-slate-600 mt-4">Amount given</label>
            <input
              type="number"
              value={collectAmountGiven}
              onChange={(e) => setCollectAmountGiven(Number(e.target.value))}
              className="mt-2 w-full rounded border px-3 py-2"
            />

            <div className="flex items-center justify-between text-sm text-slate-600 mt-4">
              <div>Change</div>
              <div className="font-medium">{formatMoney(Math.max(0, collectAmountGiven - finalTotal()))}</div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCollectCashModal(false)}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowCollectCashModal(false);
                  await handleCreateSale(collectAmountGiven);
                }}
                className="flex-1 rounded-xl bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
