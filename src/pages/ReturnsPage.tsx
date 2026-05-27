import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout, PageHeader, PageContent, Button, Table, Badge, getStatusBadgeVariant, Modal } from '../components';
import { orderReturnsApi, type OrderReturn } from '../api/orderReturns.api';
import { returnsApi } from '../api/returns.api';
import { suppliersApi } from '../api/suppliers.api';
import { grnApi } from '../api/grn.api';
import { formatMoney } from '../money';
import notify from '../utils/notify';
import { useAuthStore } from '../store/auth.store';
import { PERMISSIONS } from '../types';
import type { Supplier, GRN, SupplierReturn, SupplierReturnItem, ReturnStatus } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────
type ReturnType = 'INTERNAL' | 'CUSTOMER';

interface ReturnLineItem {
  product: string;
  productName: string;
  purchasedQty: number;
  price: number;
  costPrice: number; // COGS per unit
  returnQty: number;
  reason: string;
  returnType: ReturnType;
  selected: boolean;
}

type SupplierReturnTab = 'create' | 'view';

interface SupplierReturnLineItem {
  product_id: string;
  productName: string;
  maxQty: number;
  unitPrice: number;
  returnQty: number;
  reason: string;
  selected: boolean;
}

// ─── Detail Modal (Customer/Internal Order Returns) ─────────────────────────
function ReturnDetailModal({ ret, onClose }: { ret: OrderReturn; onClose: () => void }) {
  const saleRef = typeof ret.sale_id === 'object' ? ret.sale_id : null;
  const cashierRef = typeof ret.processedBy === 'object' ? ret.processedBy : null;
  const totalCost = ret.totalCostAmount ?? 0;
  const pnlImpact = ret.netPnlImpact ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{ret.returnNumber}</h3>
            <p className="text-sm text-slate-500 mt-0.5">Order: {saleRef?.invoiceNumber ?? ret.invoiceNumber}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            ✕
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Type badge */}
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                ret.returnType === 'INTERNAL' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {ret.returnType === 'INTERNAL' ? '🔴 Internal Return (Wastage)' : '🟢 Customer Return (Refund)'}
            </span>
            <span className="text-xs text-slate-400">{new Date(ret.createdAt).toLocaleString()}</span>
          </div>

          {/* Items table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">Product</th>
                  <th className="text-center px-3 py-2 font-medium text-slate-600">Qty</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Refund</th>
                  <th className="text-right px-4 py-2 font-medium text-slate-600">COGS</th>
                </tr>
              </thead>
              <tbody>
                {ret.items.map((item, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{item.productName}</div>
                      <div className="text-xs text-slate-400">{item.reason}</div>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-700">{item.quantity}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatMoney(item.refundAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">{formatMoney(item.costAmount ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 font-semibold text-slate-700 text-xs uppercase">
                    Totals
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-green-600">{formatMoney(ret.refundAmount)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">{formatMoney(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* P&L Breakdown */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
              Profit & Loss Impact
            </div>
            <div className="divide-y divide-slate-100">
              {ret.returnType === 'CUSTOMER' ? (
                <>
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate-600">Revenue lost (refund)</span>
                    <span className="font-medium text-red-600">− {formatMoney(ret.refundAmount)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate-600">COGS recovered (restocked)</span>
                    <span className="font-medium text-green-600">+ {formatMoney(totalCost)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm bg-red-50">
                    <span className="font-semibold text-slate-800">Net P&L Impact (Gross Profit Lost)</span>
                    <span className="font-bold text-red-700">{formatMoney(pnlImpact)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate-600">Refund issued</span>
                    <span className="font-medium text-slate-500">None</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate-600">COGS written off (wastage)</span>
                    <span className="font-medium text-red-600">− {formatMoney(totalCost)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm bg-red-50">
                    <span className="font-semibold text-slate-800">Net P&L Impact (Wastage Loss)</span>
                    <span className="font-bold text-red-700">{formatMoney(pnlImpact)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          {ret.notes && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <span className="font-medium">Notes:</span> {ret.notes}
            </div>
          )}

          {/* Cashier */}
          {cashierRef && (
            <p className="text-xs text-slate-400">
              Processed by: <span className="font-medium text-slate-600">{cashierRef.name}</span>
            </p>
          )}

          {/* Stock note */}
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              ret.returnType === 'CUSTOMER' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {ret.returnType === 'CUSTOMER'
              ? '✅ Stock has been restored to inventory.'
              : '⚠️ Stock was NOT restored (recorded as wastage/loss).'}
          </div>
        </div>
        <div className="p-6 pt-0">
          <Button variant="outline" onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal (Supplier Returns) ───────────────────────────────────────
function SupplierReturnDetailModal({ ret, onClose }: { ret: SupplierReturn; onClose: () => void }) {
  const supplierName = ret.supplier_id && typeof ret.supplier_id === 'object' ? ret.supplier_id.name : ret.supplier_id;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Supplier Return - ${ret.returnNumber}`}
      size="lg"
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Supplier:</span>
            <span className="ml-2 font-medium text-slate-800">{supplierName || '-'}</span>
          </div>
          <div>
            <span className="text-slate-500">Status:</span>
            <span className="ml-2">
              <Badge variant={getStatusBadgeVariant(ret.status)}>{ret.status}</Badge>
            </span>
          </div>
          <div>
            <span className="text-slate-500">Date:</span>
            <span className="ml-2">{new Date(ret.returnDate || ret.createdAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-500">Total:</span>
            <span className="ml-2 font-bold text-slate-900">{formatMoney(ret.totalAmount)}</span>
          </div>
          {ret.grn_id && (
            <div className="col-span-2">
              <span className="text-slate-500">GRN:</span>
              <span className="ml-2 font-mono text-xs text-slate-700">{ret.grn_id}</span>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Product</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Qty</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Unit</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {ret.items.map((item, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{item.productName}</div>
                    <div className="text-xs text-slate-400">{item.reason}</div>
                  </td>
                  <td className="px-3 py-3 text-center text-slate-700">{item.quantity}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{formatMoney(item.unitPrice)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {ret.notes && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <span className="font-medium">Notes:</span> {ret.notes}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CustomerReturnsPanel() {
  const [activeTab, setActiveTab] = useState<'create' | 'view'>('create');

  // ── Create Return State ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [lineItems, setLineItems] = useState<ReturnLineItem[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // ── View Returns State ──
  const [returns, setReturns] = useState<OrderReturn[]>([]);
  const [pnlSummary, setPnlSummary] = useState<{ totalRefunds: number; totalCostImpact: number; totalPnlImpact: number } | null>(
    null
  );
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [detailReturn, setDetailReturn] = useState<OrderReturn | null>(null);

  // ── Load returns when tab switches to view ──
  const loadReturns = useCallback(async () => {
    setLoadingReturns(true);
    try {
      const res = await orderReturnsApi.getAll({ returnType: typeFilter || undefined });
      setReturns(res.orderReturns);
      setPnlSummary(res.pnlSummary ?? null);
    } catch {
      notify.error('Failed to load returns');
    } finally {
      setLoadingReturns(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    if (activeTab === 'view') loadReturns();
  }, [activeTab, loadReturns]);

  // ── Search sales ──
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await orderReturnsApi.searchSales(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) notify.error('No completed orders found for that ID.');
      // If only one result, auto-select it
      if (results.length === 1) {
        handleSelectSale(results[0]);
      }
    } catch {
      notify.error('Search failed. Check backend connection.');
    } finally {
      setSearching(false);
    }
  };

  // ── Suggestions while typing (enter ID → suggestion dropdown) ──
  useEffect(() => {
    if (activeTab !== 'create') return;
    if (selectedSale) return;

    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    // Avoid spamming the backend on very short queries
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const results = await orderReturnsApi.searchSales(q);
        const list = Array.isArray(results) ? results : [];
        const needle = q.toLowerCase();
        const filtered = list
          .filter((s) => {
            const inv = String(s?.invoiceNumber || '').toLowerCase();
            const id = String(s?._id || '').toLowerCase();
            return inv.includes(needle) || id.includes(needle);
          })
          .slice(0, 12);
        if (!cancelled) setSearchResults(filtered);
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeTab, searchQuery, selectedSale]);

  // ── Select a sale from search results ──
  const handleSelectSale = (sale: any) => {
    setSelectedSale(sale);
    const lines: ReturnLineItem[] = sale.items.map((si: any) => {
      const productDoc = typeof si.product === 'object' ? si.product : null;
      return {
        product: productDoc?._id ?? si.product,
        productName: productDoc?.name ?? si.productName ?? 'Item',
        purchasedQty: si.quantity,
        price: si.price,
        costPrice: productDoc?.cost ?? 0,
        returnQty: 0,
        reason: '',
        returnType: 'CUSTOMER',
        selected: false,
      };
    });
    setLineItems(lines);
    setSearchResults([]);
    setNotes('');
  };

  // ── Line item controls ──
  const toggleItem = (idx: number) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, selected: !li.selected, returnQty: li.selected ? 0 : 1 } : li)));
  };

  const setQty = (idx: number, qty: number) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, returnQty: Math.min(Math.max(1, qty), li.purchasedQty) } : li)));
  };

  const setReason = (idx: number, reason: string) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, reason } : li)));
  };

  const setLineReturnType = (idx: number, type: ReturnType) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, returnType: type } : li)));
  };

  const selectAll = () => {
    setLineItems((prev) => prev.map((li) => ({ ...li, selected: true, returnQty: li.returnQty || 1 })));
  };

  const deselectAll = () => {
    setLineItems((prev) => prev.map((li) => ({ ...li, selected: false, returnQty: 0 })));
  };

  const selectedItems = lineItems.filter((li) => li.selected);
  const selectedCustomerItems = selectedItems.filter((li) => li.returnType === 'CUSTOMER');
  const selectedInternalItems = selectedItems.filter((li) => li.returnType === 'INTERNAL');

  const totalRefund = selectedCustomerItems.reduce((s, li) => s + li.price * li.returnQty, 0);
  const totalCustomerCost = selectedCustomerItems.reduce((s, li) => s + li.costPrice * li.returnQty, 0);
  const totalInternalCost = selectedInternalItems.reduce((s, li) => s + li.costPrice * li.returnQty, 0);
  const totalCost = totalCustomerCost + totalInternalCost;

  // Estimated P&L impact preview (mirrors backend logic)
  // CUSTOMER: -(refund - costRecovered)
  // INTERNAL: -costWrittenOff
  const estimatedPnl = -Math.max(0, totalRefund - totalCustomerCost) - totalInternalCost;

  // ── Validate form ──
  const canSubmit = () => {
    if (!selectedSale) return false;
    if (selectedItems.length === 0) return false;
    return selectedItems.every((li) => li.returnQty > 0 && li.reason.trim());
  };

  // ── Save return ──
  const handleSave = async () => {
    if (!selectedSale || selectedItems.length === 0) return;
    setSaving(true);
    try {
      const common = {
        sale_id: selectedSale._id,
        notes: notes.trim() || undefined,
      };

      const tasks: Promise<any>[] = [];
      if (selectedCustomerItems.length > 0) {
        tasks.push(
          orderReturnsApi.create({
            ...common,
            returnType: 'CUSTOMER',
            items: selectedCustomerItems.map((li) => ({
              product: li.product,
              productName: li.productName,
              quantity: li.returnQty,
              reason: li.reason,
            })),
          })
        );
      }
      if (selectedInternalItems.length > 0) {
        tasks.push(
          orderReturnsApi.create({
            ...common,
            returnType: 'INTERNAL',
            items: selectedInternalItems.map((li) => ({
              product: li.product,
              productName: li.productName,
              quantity: li.returnQty,
              reason: li.reason,
            })),
          })
        );
      }

      await Promise.all(tasks);
      if (selectedCustomerItems.length > 0 && selectedInternalItems.length > 0) {
        notify.success(`Returns created! Refund: ${formatMoney(totalRefund)} (plus internal wastage)`);
      } else if (selectedCustomerItems.length > 0) {
        notify.success(`Customer return created! Refund: ${formatMoney(totalRefund)}`);
      } else {
        notify.success('Internal return created!');
      }
      // Reset form
      resetForm();
      setActiveTab('view');
    } catch (err: any) {
      notify.error(err?.response?.data?.message || 'Failed to create return');
    } finally {
      setSaving(false);
    }
  };

  // ── Reset form ──
  const resetForm = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedSale(null);
    setLineItems([]);
    setNotes('');
  };

  return (
    <>
      {/* Tab Navigation */}
      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        <button
          onClick={() => {
            setActiveTab('create');
            resetForm();
          }}
          className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition ${
            activeTab === 'create' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ↩ Create Return
        </button>
        <button
          onClick={() => setActiveTab('view')}
          className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition ${
            activeTab === 'view' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          📋 View Returns
        </button>
      </div>

      {/* ── TAB 1: CREATE RETURN (Single Form) ── */}
      {activeTab === 'create' && (
        <div className="max-w-4xl space-y-5">
          {/* ── SEARCH BAR ── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Search Order</h2>
            <p className="text-sm text-slate-500 mb-4">Enter an Invoice ID or Order ID. The order details will load automatically.</p>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g. INV-1713273600000"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                />

                {/* Suggestions dropdown */}
                {searchResults.length > 0 && !selectedSale && searchQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-20 rounded-xl border border-slate-200 bg-white shadow-sm max-h-80 overflow-auto">
                    {searchResults.map((sale) => (
                      <button
                        key={sale._id}
                        onClick={() => handleSelectSale(sale)}
                        className="w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{sale.invoiceNumber}</div>
                            <div className="text-sm text-slate-500 mt-0.5 truncate">
                              {sale.items?.length ?? 0} items · {formatMoney(sale.grandTotal)} ·{' '}
                              <span className="capitalize">{sale.orderType?.toLowerCase()}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-sm text-slate-400">{sale.createdAt && new Date(sale.createdAt).toLocaleDateString()}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={handleSearch} loading={searching} disabled={!searchQuery.trim()}>
                Search
              </Button>
              {selectedSale && (
                <Button variant="outline" onClick={resetForm}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* ── FULL RETURN FORM (appears after order is selected) ── */}
          {selectedSale && (
            <>
              {/* Order Info Card */}
              <div className="bg-linear-to-r from-slate-50 to-slate-100 rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Selected Order</div>
                    <div className="text-xl font-bold text-slate-900 mt-1">{selectedSale.invoiceNumber}</div>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-slate-500">Date: </span>
                      <span className="font-medium text-slate-800">{selectedSale.createdAt && new Date(selectedSale.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Items: </span>
                      <span className="font-medium text-slate-800">{selectedSale.items?.length ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Total: </span>
                      <span className="font-bold text-slate-900">{formatMoney(selectedSale.grandTotal)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Type: </span>
                      <span className="font-medium text-slate-800 capitalize">{selectedSale.orderType?.toLowerCase()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Selection + Return Type side-by-side on large screens */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Items Selection (2/3 width) */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Select Items to Return</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Check items, set return qty and reason for each.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAll}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                      >
                        Select All
                      </button>
                      <button
                        onClick={deselectAll}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-50"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {lineItems.map((li, i) => (
                      <div
                        key={i}
                        className={`rounded-xl border p-4 transition ${
                          li.selected ? 'border-slate-900 bg-slate-50 shadow-sm' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={li.selected}
                            onChange={() => toggleItem(i)}
                            className="h-4 w-4 rounded border-slate-400 accent-slate-900 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-slate-800 truncate">{li.productName}</div>
                              <div className="text-sm font-bold text-slate-700 shrink-0 ml-2">
                                {li.selected ? formatMoney(li.price * li.returnQty) : formatMoney(li.price * li.purchasedQty)}
                              </div>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">Purchased: {li.purchasedQty} × {formatMoney(li.price)}</div>
                          </div>
                        </div>

                        {li.selected && (
                          <div className="mt-3 flex flex-wrap items-end gap-3 pl-7">
                            <div className="w-full">
                              <label className="text-xs font-medium text-slate-600 mb-2 block">Return Type</label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setLineReturnType(i, 'CUSTOMER')}
                                  className={`rounded-xl border px-4 py-2 text-xs font-extrabold transition active:scale-[0.99] ${
                                    li.returnType === 'CUSTOMER'
                                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  🟢 Customer (Refund)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLineReturnType(i, 'INTERNAL')}
                                  className={`rounded-xl border px-4 py-2 text-xs font-extrabold transition active:scale-[0.99] ${
                                    li.returnType === 'INTERNAL'
                                      ? 'border-rose-500 bg-rose-50 text-rose-700'
                                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  🔴 Internal (Wastage)
                                </button>
                              </div>
                            </div>
                            <div className="w-36">
                              <label className="text-xs font-medium text-slate-600 mb-1 block">Return Qty (max {li.purchasedQty})</label>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setQty(i, li.returnQty - 1)}
                                  disabled={li.returnQty <= 1}
                                  className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 disabled:opacity-40 text-lg"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  max={li.purchasedQty}
                                  value={li.returnQty}
                                  onChange={(e) => setQty(i, parseInt(e.target.value) || 1)}
                                  className="w-12 text-center border border-slate-300 rounded-lg px-1 py-1.5 text-sm font-semibold"
                                />
                                <button
                                  onClick={() => setQty(i, li.returnQty + 1)}
                                  disabled={li.returnQty >= li.purchasedQty}
                                  className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 disabled:opacity-40 text-lg"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <div className="flex-1 min-w-40">
                              <label className="text-xs font-medium text-slate-600 mb-1 block">Reason *</label>
                              <input
                                type="text"
                                placeholder="e.g. Wrong item, Damaged"
                                value={li.reason}
                                onChange={(e) => setReason(i, e.target.value)}
                                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes (1/3 width) */}
                <div className="space-y-5">
                  {/* Notes */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-3">Notes (optional)</h3>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional notes about this return..."
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                    />
                  </div>

                  {/* Stock Impact Info */}
                  <div className="rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 border border-slate-200 text-slate-700">
                    🟢 Customer items: Refund + restore stock · 🔴 Internal items: No refund + no stock restore
                  </div>
                </div>
              </div>

              {/* ── SUMMARY BAR (sticky at bottom) ── */}
              <div className="sticky bottom-0 z-10 bg-white rounded-2xl border border-slate-200 shadow-lg px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-slate-500">
                      {selectedItems.length} item(s) selected for return
                      {selectedItems.length > 0 && !canSubmit() && (
                        <span className="text-amber-600 ml-2">— fill in qty &amp; reason for all items</span>
                      )}
                    </div>
                    {/* Refund + P&L row */}
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      <div>
                        <span className="text-xs text-slate-400">Refund</span>
                        <div className="text-2xl font-bold text-green-600">{formatMoney(totalRefund)}</div>
                      </div>
                      {selectedItems.length > 0 && (
                        <>
                          <div className="text-slate-200 text-xl">|</div>
                          <div>
                            <span className="text-xs text-slate-400">COGS impact</span>
                            <div className="text-base font-semibold text-slate-600">{formatMoney(totalCost)}</div>
                          </div>
                          <div className="text-slate-200 text-xl">|</div>
                          <div>
                            <span className="text-xs text-slate-400">Est. P&L impact</span>
                            <div className={`text-base font-bold ${estimatedPnl < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                              {estimatedPnl <= 0 ? '− ' : '+ '}
                              {formatMoney(Math.abs(estimatedPnl))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      loading={saving}
                      disabled={!canSubmit()}
                      className={`${
                        selectedCustomerItems.length > 0 && selectedInternalItems.length === 0
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : selectedInternalItems.length > 0 && selectedCustomerItems.length === 0
                            ? 'bg-rose-600 hover:bg-rose-700'
                            : 'bg-slate-900 hover:bg-slate-800'
                      } text-white px-8`}
                    >
                      {saving
                        ? 'Processing…'
                        : selectedCustomerItems.length > 0 && selectedInternalItems.length > 0
                          ? 'Submit Returns'
                          : selectedInternalItems.length > 0
                            ? 'Submit Internal Return'
                            : 'Submit Customer Return'}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB 2: VIEW RETURNS ── */}
      {activeTab === 'view' && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm bg-white">
              <option value="">All Types</option>
              <option value="INTERNAL">🔴 Internal Returns</option>
              <option value="CUSTOMER">🟢 Customer Returns</option>
            </select>
            <Button variant="outline" onClick={loadReturns}>
              🔄 Refresh
            </Button>
          </div>

          {/* P&L Summary Card */}
          {pnlSummary && returns.length > 0 && (
            <div className="mb-5 grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Total Refunds</div>
                <div className="text-xl font-bold text-green-600">{formatMoney(pnlSummary.totalRefunds)}</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">COGS Impact</div>
                <div className="text-xl font-bold text-slate-700">{formatMoney(pnlSummary.totalCostImpact)}</div>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-1">Net P&L Loss</div>
                <div className="text-xl font-bold text-red-600">− {formatMoney(Math.abs(pnlSummary.totalPnlImpact))}</div>
              </div>
            </div>
          )}

          {loadingReturns ? (
            <div className="text-center py-16 text-slate-400">Loading returns…</div>
          ) : returns.length === 0 ? (
            <div className="text-center py-16 text-slate-400">No returns found</div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Return #</th>
                    <th className="text-left px-3 py-3.5 font-semibold text-slate-600">Order ID</th>
                    <th className="text-left px-3 py-3.5 font-semibold text-slate-600">Type</th>
                    <th className="text-center px-3 py-3.5 font-semibold text-slate-600">Items</th>
                    <th className="text-right px-3 py-3.5 font-semibold text-slate-600">Refund</th>
                    <th className="text-right px-3 py-3.5 font-semibold text-slate-600">Net P&L</th>
                    <th className="text-left px-3 py-3.5 font-semibold text-slate-600">Date</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((ret) => {
                    const saleRef = typeof ret.sale_id === 'object' ? ret.sale_id : null;
                    const pnl = ret.netPnlImpact ?? 0;
                    return (
                      <tr key={ret._id} className="border-t border-slate-100 hover:bg-slate-50 transition">
                        <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-800">{ret.returnNumber}</td>
                        <td className="px-3 py-3.5 text-slate-600 text-xs">{saleRef?.invoiceNumber ?? ret.invoiceNumber}</td>
                        <td className="px-3 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              ret.returnType === 'INTERNAL' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {ret.returnType === 'INTERNAL' ? '🔴 Internal' : '🟢 Customer'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-center text-slate-700">{ret.items.length}</td>
                        <td className="px-3 py-3.5 text-right font-bold text-green-600">{formatMoney(ret.refundAmount)}</td>
                        <td className="px-3 py-3.5 text-right">
                          <span className="font-semibold text-red-600 text-xs">− {formatMoney(Math.abs(pnl))}</span>
                        </td>
                        <td className="px-3 py-3.5 text-slate-500 text-xs">{new Date(ret.createdAt).toLocaleDateString()}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => setDetailReturn(ret)}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {detailReturn && <ReturnDetailModal ret={detailReturn} onClose={() => setDetailReturn(null)} />}
    </>
  );
}

function SupplierReturnsPanel() {
  const [activeTab, setActiveTab] = useState<SupplierReturnTab>('create');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  const [grnSearchQuery, setGrnSearchQuery] = useState('');
  const [grnSearching, setGrnSearching] = useState(false);
  const [grnSearchResults, setGrnSearchResults] = useState<GRN[]>([]);

  const [grns, setGrns] = useState<GRN[]>([]);
  const [loadingGrns, setLoadingGrns] = useState(false);
  const [selectedGrnId, setSelectedGrnId] = useState('');
  const [selectedGrn, setSelectedGrn] = useState<GRN | null>(null);

  const [lineItems, setLineItems] = useState<SupplierReturnLineItem[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [returns, setReturns] = useState<SupplierReturn[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | ''>('');
  const [detailReturn, setDetailReturn] = useState<SupplierReturn | null>(null);

  const loadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      const res = await suppliersApi.getAll();
      setSuppliers(res.suppliers || []);
    } catch {
      notify.error('Failed to load suppliers');
    } finally {
      setLoadingSuppliers(false);
    }
  }, []);

  const loadGrns = useCallback(async (supplierId: string) => {
    if (!supplierId) {
      setGrns([]);
      setSelectedGrnId('');
      setSelectedGrn(null);
      setLineItems([]);
      return;
    }

    setLoadingGrns(true);
    try {
      const res = await grnApi.getAll({ status: 'APPROVED', supplierId });
      setGrns(res.grns || []);
    } catch {
      notify.error('Failed to load approved GRNs');
      setGrns([]);
    } finally {
      setLoadingGrns(false);
    }
  }, []);

  const loadSupplierReturns = useCallback(async () => {
    setLoadingReturns(true);
    try {
      const res = await returnsApi.getAll({
        status: statusFilter || undefined,
        supplier_id: selectedSupplierId || undefined,
        page: 1,
        limit: 50,
      } as any);

      const list = (res?.returns ?? (res as any)?.supplierReturns ?? []) as SupplierReturn[];
      setReturns(Array.isArray(list) ? list : []);
    } catch {
      notify.error('Failed to load supplier returns');
      setReturns([]);
    } finally {
      setLoadingReturns(false);
    }
  }, [statusFilter, selectedSupplierId]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    loadGrns(selectedSupplierId);
  }, [selectedSupplierId, loadGrns]);

  useEffect(() => {
    if (activeTab === 'view') loadSupplierReturns();
  }, [activeTab, loadSupplierReturns]);

  // Ensure the selected GRN always appears in the dropdown options
  useEffect(() => {
    if (!selectedGrnId) return;
    if (grns.some((g) => String((g as any)?._id || (g as any)?.id) === String(selectedGrnId))) return;

    const fromSearch = grnSearchResults.find((g) => String((g as any)?._id || (g as any)?.id) === String(selectedGrnId));
    const candidate = fromSearch || (selectedGrn && String((selectedGrn as any)?._id || (selectedGrn as any)?.id) === String(selectedGrnId) ? selectedGrn : null);
    if (!candidate) return;

    setGrns((prev) => {
      if (prev.some((g) => String((g as any)?._id || (g as any)?.id) === String(selectedGrnId))) return prev;
      return [candidate, ...prev];
    });
  }, [grns, grnSearchResults, selectedGrn, selectedGrnId]);

  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    suppliers.forEach((s) => map.set(s._id, s.name));
    return map;
  }, [suppliers]);

  const isLikelyObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value.trim());

  const grnSuggestions = useMemo(() => {
    if (selectedGrnId) return [] as GRN[];
    const q = grnSearchQuery.trim();
    if (!q || isLikelyObjectId(q)) return [] as GRN[];
    const needle = q.toLowerCase();
    return (grns || []).filter((g) => (g.grnNumber || '').toLowerCase().includes(needle));
  }, [grnSearchQuery, grns, selectedGrnId]);

  const visibleGrnResults = grnSearchResults.length > 0 ? grnSearchResults : grnSuggestions;

  // ── Auto-suggest GRNs while typing (debounced) ──
  useEffect(() => {
    if (activeTab !== 'create') return;
    if (selectedGrnId) return;

    const q = grnSearchQuery.trim();
    if (!q) {
      setGrnSearchResults([]);
      return;
    }

    // Avoid spamming backend for very short queries
    if (q.length < 2) {
      setGrnSearchResults([]);
      return;
    }

    // If supplier is selected, local list-based suggestions are enough
    if (selectedSupplierId && grns.length > 0) return;

    // Don't auto-fetch for ObjectId-looking inputs (handled by Enter/Search)
    if (isLikelyObjectId(q)) {
      setGrnSearchResults([]);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await grnApi.getAll({
          status: 'APPROVED',
          supplierId: selectedSupplierId || undefined,
          search: q,
          page: 1,
          limit: 30,
        } as any);

        const all = (res?.grns ?? []) as GRN[];
        const needle = q.toLowerCase();
        const matches = all
          .filter((g) => (g.grnNumber || '').toLowerCase().includes(needle))
          .slice(0, 12);

        if (!cancelled) setGrnSearchResults(matches);
      } catch {
        if (!cancelled) setGrnSearchResults([]);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeTab, grnSearchQuery, selectedGrnId, selectedSupplierId, grns.length]);

  const resetCreateForm = () => {
    setSelectedSupplierId('');
    setGrns([]);
    setSelectedGrnId('');
    setSelectedGrn(null);
    setLineItems([]);
    setNotes('');
    setGrnSearchQuery('');
    setGrnSearchResults([]);
  };

  const buildLineItemsFromGrn = (grn: GRN): SupplierReturnLineItem[] => {
    return (grn.items || []).map((it) => {
      const maxQty = (it.receivedQuantity ?? it.orderedQuantity ?? 0) as number;
      return {
        product_id: it.product_id,
        productName: it.productName,
        maxQty,
        unitPrice: it.unitPrice,
        returnQty: 0,
        reason: '',
        selected: false,
      };
    });
  };

  const applySelectedGrn = (grn: GRN) => {
    setSelectedGrn(grn);
    setLineItems(buildLineItemsFromGrn(grn));
  };

  const selectGrnFromResult = async (grn: GRN) => {
    const supplierId = grn.supplier_id && typeof grn.supplier_id === 'object' ? grn.supplier_id._id : String(grn.supplier_id || '');
    if (supplierId) setSelectedSupplierId(supplierId);
    setGrnSearchResults([]);
    setGrnSearchQuery(grn.grnNumber);

    const id = (grn as any)?._id || (grn as any)?.id;
    if (id) setSelectedGrnId(String(id));

    // If list/search already includes items, load immediately (Customer Return behavior)
    if (grn.items && grn.items.length > 0) {
      applySelectedGrn(grn);
      return;
    }

    // Fallback to fetch by id
    if (id) await handleSelectGrn(String(id));
  };

  const handleSearchGrn = async () => {
    const q = grnSearchQuery.trim();
    if (!q) return;
    setGrnSearching(true);
    try {
      // If user pasted GRN _id
        if (isLikelyObjectId(q)) {
        const full = await grnApi.getById(q);
        if (full.status !== 'APPROVED') {
          notify.error('GRN is not Approved');
          setGrnSearchResults([]);
          return;
        }
        await selectGrnFromResult(full);
        return;
      }

      // Otherwise, search by GRN number among Approved GRNs
      const res = await grnApi.getAll({ status: 'APPROVED', page: 1, limit: 200 } as any);
      const all = (res?.grns ?? []) as GRN[];

      const needle = q.toLowerCase();
      const matches = all.filter((g) => (g.grnNumber || '').toLowerCase().includes(needle));

      if (matches.length === 0) {
        notify.error('No Approved GRN found');
        setGrnSearchResults([]);
        return;
      }

      setGrnSearchResults(matches);
      if (matches.length === 1) {
        await selectGrnFromResult(matches[0]);
      }
    } catch {
      notify.error('GRN search failed');
      setGrnSearchResults([]);
    } finally {
      setGrnSearching(false);
    }
  };

  const handleSelectGrn = async (grnId: string) => {
    setSelectedGrnId(grnId);
    setSelectedGrn(null);
    setLineItems([]);

    if (!grnId) return;

    try {
      // Use already-fetched GRN first (faster + avoids extra request)
      const fromLists = [...grns, ...grnSearchResults].find((g) => (g as any)?._id === grnId || (g as any)?.id === grnId);
      if (fromLists?.items?.length) {
        applySelectedGrn(fromLists);
        return;
      }

      // Fallback: fetch full GRN details
      const full = await grnApi.getById(grnId);
      applySelectedGrn(full);
    } catch (err: any) {
      notify.error(err?.response?.data?.message || 'Failed to load GRN details');
    }
  };

  const toggleItem = (idx: number) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, selected: !li.selected, returnQty: li.selected ? 0 : 1 } : li)));
  };

  const setQty = (idx: number, qty: number) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, returnQty: Math.min(Math.max(1, qty), li.maxQty) } : li)));
  };

  const setReason = (idx: number, reason: string) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, reason } : li)));
  };

  const selectedItems = useMemo(() => lineItems.filter((li) => li.selected), [lineItems]);

  const totalAmount = useMemo(() => {
    return selectedItems.reduce((sum, li) => sum + li.unitPrice * li.returnQty, 0);
  }, [selectedItems]);

  const canSubmit = () => {
    if (!selectedSupplierId) return false;
    if (!selectedGrnId) return false;
    if (selectedItems.length === 0) return false;
    return selectedItems.every((li) => li.returnQty > 0 && li.returnQty <= li.maxQty && li.reason.trim());
  };

  const handleCreateReturn = async () => {
    if (!canSubmit()) return;
    setSaving(true);
    try {
      const items: SupplierReturnItem[] = selectedItems.map((li) => ({
        product_id: li.product_id,
        productName: li.productName,
        quantity: li.returnQty,
        reason: li.reason,
        unitPrice: li.unitPrice,
        totalPrice: li.unitPrice * li.returnQty,
      }));

      await returnsApi.create({
        supplier_id: selectedSupplierId,
        grn_id: selectedGrnId,
        items,
        totalAmount,
        notes: notes.trim() || undefined,
      });

      notify.success('Supplier return created');
      resetCreateForm();
      setActiveTab('view');
    } catch (err: any) {
      notify.error(err?.response?.data?.message || 'Failed to create supplier return');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm('Approve supplier return?')) return;
      try {
        await returnsApi.approve(id);
        notify.success('Return approved');
        loadSupplierReturns();
      } catch (err: any) {
        notify.error(err?.response?.data?.message || 'Failed to approve return');
      }
  };

  const columns = [
    { key: 'returnNumber', header: 'Return #' },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (r: SupplierReturn) => {
        if (r.supplier_id && typeof r.supplier_id === 'object') return r.supplier_id.name;
        return supplierNameById.get(String(r.supplier_id)) || String(r.supplier_id || '-');
      },
    },
    { key: 'items', header: 'Items', render: (r: SupplierReturn) => r.items?.length ?? 0, className: 'text-center' },
    { key: 'totalAmount', header: 'Total', render: (r: SupplierReturn) => formatMoney(r.totalAmount), className: 'text-right' },
    {
      key: 'status',
      header: 'Status',
      render: (r: SupplierReturn) => <Badge variant={getStatusBadgeVariant(r.status)}>{r.status}</Badge>,
    },
    { key: 'date', header: 'Date', render: (r: SupplierReturn) => new Date(r.returnDate || r.createdAt).toLocaleDateString() },
    {
      key: 'actions',
      header: 'Actions',
      render: (r: SupplierReturn) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => setDetailReturn(r)}>
            View
          </Button>
          {r.status === 'PENDING' && (
            <Button size="sm" variant="ghost" onClick={() => handleApprove(r._id)}>
              Approve
            </Button>
          )}
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <>
      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        <button
          onClick={() => {
            setActiveTab('create');
            resetCreateForm();
          }}
          className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition ${
            activeTab === 'create' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ↩ Create Supplier Return
        </button>
        <button
          onClick={() => setActiveTab('view')}
          className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition ${
            activeTab === 'view' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          📋 View Supplier Returns
        </button>
      </div>

      {activeTab === 'create' && (
        <div className="max-w-4xl space-y-5">
          {/* ── SEARCH GRN ── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Search GRN</h2>
            <p className="text-sm text-slate-500 mb-4">Enter GRN Number or GRN ID. Only Approved GRNs can be used for supplier returns.</p>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={grnSearchQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setGrnSearchQuery(next);
                    // Clear manual results when typing so local suggestions can show
                    if (grnSearchResults.length) setGrnSearchResults([]);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchGrn()}
                  placeholder="e.g. GRN-000014"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
                />

                {/* Suggestions dropdown */}
                {visibleGrnResults.length > 0 && !selectedGrnId && grnSearchQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-20 rounded-xl border border-slate-200 bg-white shadow-sm max-h-80 overflow-auto">
                    {visibleGrnResults.map((g) => {
                      const supplierName =
                        g.supplier_id && typeof g.supplier_id === 'object'
                          ? g.supplier_id.name
                          : supplierNameById.get(String(g.supplier_id)) || String(g.supplier_id || '-');
                      return (
                        <button
                          key={g._id}
                          onClick={() => selectGrnFromResult(g)}
                          className="w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">{g.grnNumber}</div>
                              <div className="text-sm text-slate-500 mt-0.5 truncate">{supplierName} · {formatMoney(g.totalAmount)}</div>
                            </div>
                            <div className="shrink-0 text-sm text-slate-400">{g.receivedDate && new Date(g.receivedDate).toLocaleDateString()}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <Button onClick={handleSearchGrn} loading={grnSearching} disabled={!grnSearchQuery.trim()}>
                Search
              </Button>
              {(selectedGrnId || grnSearchQuery) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    resetCreateForm();
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier</label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm bg-white"
                  disabled={loadingSuppliers}
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Approved GRN</label>
                <select
                  value={selectedGrnId}
                  onChange={(e) => handleSelectGrn(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm bg-white"
                  disabled={!selectedSupplierId || loadingGrns}
                >
                  <option value="">Select GRN</option>
                  {grns.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.grnNumber}
                    </option>
                  ))}
                </select>
                {!loadingGrns && selectedSupplierId && grns.length === 0 && (
                  <p className="mt-2 text-xs text-slate-500">No Approved GRNs found for this supplier.</p>
                )}
              </div>
            </div>

            {selectedGrn && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <span className="text-slate-500">GRN:</span> <span className="font-semibold">{selectedGrn.grnNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Total:</span> <span className="font-semibold">{formatMoney(selectedGrn.totalAmount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Received:</span>{' '}
                    <span className="font-semibold">{new Date(selectedGrn.receivedDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {selectedGrn && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Select Products to Return</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Only products from this Approved GRN can be returned.</p>
                </div>
              </div>

              <div className="space-y-2">
                {lineItems.map((li, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-4 transition ${
                      li.selected ? 'border-slate-900 bg-slate-50 shadow-sm' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={li.selected}
                        onChange={() => toggleItem(i)}
                        className="h-4 w-4 rounded border-slate-400 accent-slate-900 shrink-0"
                        disabled={li.maxQty <= 0}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-slate-800 truncate">{li.productName}</div>
                          <div className="text-sm font-bold text-slate-700 shrink-0 ml-2">
                            {li.selected ? formatMoney(li.unitPrice * li.returnQty) : formatMoney(li.unitPrice)}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Max return: {li.maxQty} × {formatMoney(li.unitPrice)}
                        </div>
                      </div>
                    </div>

                    {li.selected && (
                      <div className="mt-3 flex flex-wrap items-end gap-3 pl-7">
                        <div className="w-36">
                          <label className="text-xs font-medium text-slate-600 mb-1 block">Return Qty (max {li.maxQty})</label>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setQty(i, li.returnQty - 1)}
                              disabled={li.returnQty <= 1}
                              className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 disabled:opacity-40 text-lg"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={li.maxQty}
                              value={li.returnQty}
                              onChange={(e) => setQty(i, parseInt(e.target.value) || 1)}
                              className="w-12 text-center border border-slate-300 rounded-lg px-1 py-1.5 text-sm font-semibold"
                            />
                            <button
                              onClick={() => setQty(i, li.returnQty + 1)}
                              disabled={li.returnQty >= li.maxQty}
                              className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 disabled:opacity-40 text-lg"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 min-w-40">
                          <label className="text-xs font-medium text-slate-600 mb-1 block">Reason *</label>
                          <input
                            type="text"
                            placeholder="e.g. Damaged, Expired"
                            value={li.reason}
                            onChange={(e) => setReason(i, e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedGrn && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="text-base font-bold text-slate-900 mb-3">Notes (optional)</h3>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes about this supplier return..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
              />
            </div>
          )}

          {selectedGrn && (
            <div className="sticky bottom-0 z-10 bg-white rounded-2xl border border-slate-200 shadow-lg px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-500">{selectedItems.length} item(s) selected</div>
                  <div className="text-2xl font-bold text-slate-900">{formatMoney(totalAmount)}</div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={resetCreateForm}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateReturn}
                    loading={saving}
                    disabled={!canSubmit()}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-8"
                  >
                    {saving ? 'Processing…' : 'Submit Supplier Return'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'view' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All</option>
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>
            <Button variant="outline" onClick={loadSupplierReturns}>
              🔄 Refresh
            </Button>
          </div>

          <Table
            columns={columns as any}
            data={returns}
            loading={loadingReturns}
            emptyMessage="No supplier returns found"
            keyExtractor={(r) => r._id}
          />
        </div>
      )}

      {detailReturn && <SupplierReturnDetailModal ret={detailReturn} onClose={() => setDetailReturn(null)} />}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReturnsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const location = useLocation();
  const posOnly = new URLSearchParams(location.search).get('posOnly') === '1';

  // VIEW_CUSTOMER_RETURNS → Customer Return tab (Cashiers have this)
  const canViewCustomerReturns = hasPermission(PERMISSIONS.VIEW_CUSTOMER_RETURNS);

  // VIEW_SUPPLIER_RETURNS → Supplier Return tab (Admin/Manager only, NOT Cashier)
  const canViewSupplierReturns = hasPermission(PERMISSIONS.VIEW_SUPPLIER_RETURNS);

  const [mainTab, setMainTab] = useState<'customer' | 'supplier'>(
    posOnly ? 'customer' : (canViewCustomerReturns ? 'customer' : 'supplier')
  );

  // Auto-switch away from supplier tab if permission is lost or when opened from POS
  useEffect(() => {
    if (posOnly && mainTab !== 'customer') {
      setMainTab('customer');
      return;
    }
    if (mainTab === 'supplier' && !canViewSupplierReturns) {
      setMainTab('customer');
    }
  }, [canViewSupplierReturns, mainTab, posOnly]);

  return (
    <Layout>
      <PageHeader title="Returns" subtitle="Customer returns and supplier returns" />
      <PageContent>
        {/* Main Tab Navigation */}
        {(canViewCustomerReturns || canViewSupplierReturns) && (
          <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
            {canViewCustomerReturns && (
              <button
                onClick={() => setMainTab('customer')}
                className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition ${
                  mainTab === 'customer' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🧾 Customer Return
              </button>
            )}
            {!posOnly && canViewSupplierReturns && (
              <button
                onClick={() => setMainTab('supplier')}
                className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition ${
                  mainTab === 'supplier' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🚚 Supplier Return
              </button>
            )}
          </div>
        )}

        {!canViewCustomerReturns && !canViewSupplierReturns && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="text-4xl">🔒</div>
            <p className="text-base font-semibold text-slate-700">Access Restricted</p>
            <p className="text-sm text-slate-500">You don't have permission to view returns.</p>
          </div>
        )}

        {mainTab === 'customer' && canViewCustomerReturns && <CustomerReturnsPanel />}
        {mainTab === 'supplier' && canViewSupplierReturns && <SupplierReturnsPanel />}
      </PageContent>
    </Layout>
  );
}
