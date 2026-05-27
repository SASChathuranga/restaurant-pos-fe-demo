import { useEffect, useState, useCallback, useMemo } from 'react';
import notify from '../utils/notify';
import { useAuthStore } from '../store/auth.store';
import { Layout, PageHeader, PageContent } from '../components/Layout';
import { Button, Badge, Card } from '../components';
import { kitchenApi } from '../api/kitchen.api';
import { configApi } from '../api';
import type { KitchenOrder, KitchenDashboard, KitchenOrderStatus } from '../types';

const statusFlow: KitchenOrderStatus[] = ['PENDING', 'PREPARING', 'READY', 'SERVED'];

const statusColors: Record<KitchenOrderStatus, 'warning' | 'info' | 'success' | 'default'> = {
  PENDING: 'warning',
  PREPARING: 'info',
  READY: 'success',
  SERVED: 'default',
};

const statusLabels: Record<KitchenOrderStatus, string> = {
  PENDING: '🔴 Pending',
  PREPARING: '🟡 Preparing',
  READY: '🟢 Ready',
  SERVED: '✅ Served',
};

export default function KitchenPage() {
  const user = useAuthStore((s) => s.user);
  const [dashboard, setDashboard] = useState<KitchenDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<KitchenOrderStatus | 'ALL'>('ALL');
  const [viewMode, setViewMode] = useState<'QUEUE' | 'TABLES'>('QUEUE');
  const [kitchenBillPrintingEnabled, setKitchenBillPrintingEnabled] = useState(true);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [updatingOrderIds, setUpdatingOrderIds] = useState<string[]>([]);

  // Debug: Log user info on mount
  useEffect(() => {
    console.log('👤 Current User:', user);
    console.log('🏢 Branch ID:', user?.branch_id);
    console.log('👮 Role:', user?.role?.name);
    console.log('🔑 Permissions:', user?.permissions);
  }, [user]);

  const loadDebug = async () => {
    try {
      const data = await kitchenApi.debug();
      setDebugInfo(data);
      setShowDebug(true);
      console.log('🔍 Debug Info:', data);
    } catch (err) {
      console.error('Debug error:', err);
    }
  };

  const loadDashboard = useCallback(async () => {
    try {
      const data = await kitchenApi.getDashboard();
      console.log('🍳 Kitchen Dashboard Data:', data);
      console.log('📊 Summary:', data.summary);
      console.log('📋 Orders count:', data.orders?.length);
      setDashboard(data);
    } catch (err: any) {
      console.error('❌ Failed to load kitchen dashboard:', err);
      console.error('Error details:', err.response?.data || err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    const loadPrintConfig = async () => {
      try {
        const cfg = await configApi.get();
        setKitchenBillPrintingEnabled(typeof (cfg as any)?.kitchenBillPrintingEnabled === 'boolean' ? (cfg as any).kitchenBillPrintingEnabled : true);
      } catch {
        setKitchenBillPrintingEnabled(true);
      }
    };
    loadPrintConfig();
  }, []);

  const getNextStatus = (currentStatus: KitchenOrderStatus): KitchenOrderStatus | null => {
    const currentIndex = statusFlow.indexOf(currentStatus);
    if (currentIndex < statusFlow.length - 1) {
      return statusFlow[currentIndex + 1];
    }
    return null;
  };

  const getLocalDayKey = (value: string | Date) => {
    const d = value instanceof Date ? value : new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const buildDailySequenceMap = (orders: KitchenOrder[]) => {
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

  const isDineInOrder = (order: KitchenOrder) => {
    if (order.tableNumber) return true;
    if (typeof order.sale === 'object' && order.sale) {
      return (order.sale as any).orderType === 'DINE_IN' || Boolean((order.sale as any).table);
    }
    return false;
  };

  const handlePrintKitchenOrder = async (order: KitchenOrder, orderNo: string) => {
    if (!kitchenBillPrintingEnabled) {
      notify.error('Kitchen printing is disabled in Settings');
      return;
    }

    try {
      const cfg = await configApi.get().catch(() => null);
      const businessName = (cfg as any)?.businessDetails?.name || '';
      const businessPhone = (cfg as any)?.businessDetails?.phone || '';
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
            <script>
              window.onload = () => {
                window.focus();
                window.print();
                window.onafterprint = () => { try { window.close(); } catch {} };
              };
            </script>
          </body>
        </html>
      `;

      const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=480,height=720');
      if (!printWindow) {
        notify.error('Popup blocked. Please allow popups to print.');
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (e) {
      console.error('Kitchen print failed:', e);
      notify.error('Failed to print kitchen order');
    }
  };

  const buildKitchenSummary = (orders: KitchenOrder[]): KitchenDashboard['summary'] => {
    const pendingCount = orders.filter((order) => order.status === 'PENDING').length;
    const preparingCount = orders.filter((order) => order.status === 'PREPARING').length;
    const readyCount = orders.filter((order) => order.status === 'READY').length;
    const totalActive = orders.filter((order) => order.status !== 'SERVED').length;
    return { pendingCount, preparingCount, readyCount, totalActive };
  };

  const handleStatusUpdate = async (order: KitchenOrder, newStatus: KitchenOrderStatus) => {
    try {
      if (updatingOrderIds.includes(order._id)) {
        return;
      }
      setUpdatingOrderIds((prev) => [...prev, order._id]);
      const updatedOrder = await kitchenApi.updateStatus(order._id, newStatus);
      setDashboard((prev) => {
        if (!prev) return prev;
        const orders = prev.orders.map((item) =>
          item._id === order._id
            ? { ...item, ...updatedOrder, status: newStatus }
            : item
        );
        const summary = buildKitchenSummary(orders);
        return { ...prev, orders, summary };
      });
      loadDashboard();
    } catch (err) {
      console.error('Failed to update order status:', err);
    } finally {
      setUpdatingOrderIds((prev) => prev.filter((id) => id !== order._id));
    }
  };

  const allOrders = dashboard?.orders || [];
  const dailySequenceMap = useMemo(() => buildDailySequenceMap(allOrders), [allOrders]);

  const filteredOrders = (dashboard?.orders
    .filter((order) => (filter === 'ALL' ? order.status !== 'SERVED' : order.status === filter))
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) || [];

  const dineInOrders = useMemo(() => filteredOrders.filter(isDineInOrder), [filteredOrders]);
  const queueOrders = useMemo(() => filteredOrders.filter((o) => !isDineInOrder(o)), [filteredOrders]);

  useEffect(() => {
    // Automatic routing: if only Dine-in orders exist, go to Table View.
    if (viewMode === 'QUEUE' && queueOrders.length === 0 && dineInOrders.length > 0) {
      setViewMode('TABLES');
    }
  }, [viewMode, queueOrders.length, dineInOrders.length]);

  return (
    <Layout>
      <PageHeader
        title="Kitchen Display"
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={loadDebug}>
              🔍 Debug
            </Button>
            <Button variant="secondary" onClick={loadDashboard}>
              Refresh
            </Button>
          </div>
        }
      />

      <PageContent>
        {/* Debug Info Panel */}
        {showDebug && debugInfo && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-yellow-800">🔍 Debug Info</h3>
              <button onClick={() => setShowDebug(false)} className="text-yellow-600 hover:text-yellow-800">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p><strong>User:</strong> {debugInfo.currentUser?.name} ({debugInfo.currentUser?.email})</p>
                <p><strong>Role:</strong> {debugInfo.currentUser?.role}</p>
                <p><strong>User Branch ID:</strong> <code className="bg-yellow-100 px-1">{debugInfo.currentUser?.branch_id}</code></p>
              </div>
              <div>
                <p><strong>Total Active Orders:</strong> {debugInfo.kitchenData?.totalActiveOrders}</p>
                <p><strong>Orders for Your Branch:</strong> {debugInfo.kitchenData?.ordersForUserBranch}</p>
                <p><strong>Branch IDs in Orders:</strong> {debugInfo.kitchenData?.allBranchIdsInOrders?.join(', ') || 'None'}</p>
                <p><strong>Branch Match:</strong> {debugInfo.kitchenData?.branchMatch ? '✅ Yes' : '❌ No - This is the problem!'}</p>
              </div>
            </div>
            {!debugInfo.kitchenData?.branchMatch && debugInfo.kitchenData?.totalActiveOrders > 0 && (
              <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
                <strong>⚠️ Issue Found:</strong> Your user branch_id (<code>{debugInfo.currentUser?.branch_id}</code>) doesn't match any kitchen orders.
                <br />Orders exist with branch_id: <code>{debugInfo.kitchenData?.allBranchIdsInOrders?.join(', ')}</code>
                <br /><strong>Fix:</strong> Admin needs to update this user's branch_id to match.
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            {dashboard && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-red-600">
                    {dashboard.summary.pendingCount}
                  </div>
                  <div className="text-sm text-slate-500">Pending</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-yellow-600">
                    {dashboard.summary.preparingCount}
                  </div>
                  <div className="text-sm text-slate-500">Preparing</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {dashboard.summary.readyCount}
                  </div>
                  <div className="text-sm text-slate-500">Ready</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-slate-600">
                    {dashboard.summary.totalActive}
                  </div>
                  <div className="text-sm text-slate-500">Total Active</div>
                </Card>
              </div>
            )}

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2">
              {(['ALL', 'PENDING', 'PREPARING', 'READY'] as const).map((status) => (
                <Button
                  key={status}
                  variant={filter === status ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setFilter(status)}
                >
                  {status === 'ALL' ? 'All Active' : status}
                </Button>
              ))}

              <div className="ml-auto flex gap-2">
                <Button
                  variant={viewMode === 'QUEUE' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('QUEUE')}
                >
                  Queue View
                </Button>
                <Button
                  variant={viewMode === 'TABLES' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('TABLES')}
                >
                  Table View
                </Button>
              </div>
            </div>

            {/* Orders Grid */}
            {viewMode === 'QUEUE' ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {queueOrders.map((order) => {
                const nextStatus = getNextStatus(order.status);
                const isUpdating = updatingOrderIds.includes(order._id);
                const dailySeq = dailySequenceMap[order._id];
                const displayOrderNo = (order as any).orderNumber ?? (dailySeq ? String(dailySeq) : '');
                return (
                  <Card
                    key={order._id}
                    className={`p-4 ${
                      order.status === 'PENDING'
                        ? 'border-l-4 border-l-red-500'
                        : order.status === 'PREPARING'
                        ? 'border-l-4 border-l-yellow-500'
                        : 'border-l-4 border-l-green-500'
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className="min-w-0">
                        {displayOrderNo && (
                          <div className="text-xl font-black text-slate-900 font-mono tracking-tight">#{displayOrderNo}</div>
                        )}
                        {order.tableNumber && (
                          <div className="text-lg font-bold text-slate-900">
                            Table {order.tableNumber}
                          </div>
                        )}
                        {order.section && (
                          <div className="text-xs text-slate-500">{order.section}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {kitchenBillPrintingEnabled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePrintKitchenOrder(order, displayOrderNo)}
                          >
                            Print
                          </Button>
                        )}
                        <Badge variant={statusColors[order.status]}>
                          {statusLabels[order.status]}
                        </Badge>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="mb-3 space-y-1">
                      {order.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between text-sm"
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="text-slate-500">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    {/* Time Info */}
                    <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {new Date(order.createdAt).toLocaleTimeString()}
                      </span>
                      {order.waitingMinutes !== undefined && (
                        <span
                          className={`font-medium ${
                            order.waitingMinutes > 15
                              ? 'text-red-600'
                              : order.waitingMinutes > 10
                              ? 'text-yellow-600'
                              : 'text-slate-600'
                          }`}
                        >
                          {order.waitingMinutes} min wait
                        </span>
                      )}
                    </div>

                    {/* Action Button */}
                    {nextStatus && (
                      <Button
                        className="w-full"
                        variant={order.status === 'PENDING' ? 'primary' : 'secondary'}
                        disabled={isUpdating}
                        onClick={() => handleStatusUpdate(order, nextStatus)}
                      >
                        {isUpdating
                          ? 'Updating...'
                          : order.status === 'PENDING'
                          ? 'Start Preparing'
                          : order.status === 'PREPARING'
                          ? 'Mark Ready'
                          : 'Mark Served'}
                      </Button>
                    )}
                  </Card>
                );
                })}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {dineInOrders.map((order) => {
                  const nextStatus = getNextStatus(order.status);
                  const isUpdating = updatingOrderIds.includes(order._id);
                  const dailySeq = dailySequenceMap[order._id];
                  const displayOrderNo = (order as any).orderNumber ?? (dailySeq ? String(dailySeq) : '');
                  return (
                    <Card
                      key={order._id}
                      className={`p-4 ${
                        order.status === 'PENDING'
                          ? 'border-l-4 border-l-red-500'
                          : order.status === 'PREPARING'
                          ? 'border-l-4 border-l-yellow-500'
                          : 'border-l-4 border-l-green-500'
                      }`}
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <div className="min-w-0">
                          {order.tableNumber && (
                            <div className="text-xl font-black text-slate-900">Table {order.tableNumber}</div>
                          )}
                          {displayOrderNo && (
                            <div className="text-sm font-extrabold text-slate-900 font-mono tracking-tight">#{displayOrderNo}</div>
                          )}
                          {order.section && (
                            <div className="text-xs text-slate-500">{order.section}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {kitchenBillPrintingEnabled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePrintKitchenOrder(order, displayOrderNo)}
                            >
                              Print
                            </Button>
                          )}
                          <Badge variant={statusColors[order.status]}>
                            {statusLabels[order.status]}
                          </Badge>
                        </div>
                      </div>

                      {/* Order Items */}
                      <div className="mb-3 space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="font-medium">{item.name}</span>
                            <span className="text-slate-500">x{item.quantity}</span>
                          </div>
                        ))}
                      </div>

                      {/* Time Info */}
                      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                        <span>{new Date(order.createdAt).toLocaleTimeString()}</span>
                        {order.waitingMinutes !== undefined && (
                          <span
                            className={`font-medium ${
                              order.waitingMinutes > 15
                                ? 'text-red-600'
                                : order.waitingMinutes > 10
                                ? 'text-yellow-600'
                                : 'text-slate-600'
                            }`}
                          >
                            {order.waitingMinutes} min wait
                          </span>
                        )}
                      </div>

                      {/* Action Button */}
                      {nextStatus && (
                        <Button
                          className="w-full"
                          variant={order.status === 'PENDING' ? 'primary' : 'secondary'}
                          disabled={isUpdating}
                          onClick={() => handleStatusUpdate(order, nextStatus)}
                        >
                          {isUpdating
                            ? 'Updating...'
                            : order.status === 'PENDING'
                            ? 'Start Preparing'
                            : order.status === 'PREPARING'
                            ? 'Mark Ready'
                            : 'Mark Served'}
                        </Button>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {filteredOrders.length === 0 && (
              <div className="rounded-lg bg-slate-50 p-12 text-center">
                <p className="text-slate-500">
                  {filter === 'ALL'
                    ? 'No active orders in the kitchen'
                    : `No ${filter.toLowerCase()} orders`}
                </p>
              </div>
            )}
          </div>
        )}
      </PageContent>
    </Layout>
  );
}
