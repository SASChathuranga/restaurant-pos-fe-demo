import { useEffect, useRef, useState } from 'react';
import { Layout, PageHeader, PageContent } from '../components/Layout';
import { Button, Input, Card, Table, Badge, Modal } from '../components';
import { shiftsApi } from '../api';
import type { Shift } from '../types';
import { formatMoney } from '../money';
import notify from '../utils/notify';

export default function ShiftsPage() {
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [shiftHistory, setShiftHistory] = useState<Shift[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'' | 'OPEN' | 'CLOSED'>('');

  const [viewShiftOpen, setViewShiftOpen] = useState(false);
  const [viewShift, setViewShift] = useState<Shift | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load current shift on page mount
  useEffect(() => {
    loadCurrentShift();
  }, []);

  const loadShiftHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await shiftsApi.list({
        page: historyPage,
        limit: 20,
        status: statusFilter || undefined,
      });
      setShiftHistory(res.shifts || []);
      setHistoryTotal(res.total || 0);
    } catch (err: any) {
      console.error('Failed to load shift history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadShiftHistory();
  }, [historyPage, statusFilter]);

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
        loadShiftHistory();
        notify.success('Shift auto-closed at 12:00 AM');
      } catch (err: any) {
        console.error('Failed to auto-close shift:', err);
        notify.error(err?.response?.data?.message || 'Failed to auto-close shift');
      }
    }, delay);

    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [currentShift]);

  const loadCurrentShift = async () => {
    try {
      setInitialLoading(true);
      const shift = await shiftsApi.getCurrent();
      setCurrentShift(shift);
    } catch (err: any) {
      console.error('Failed to load current shift:', err);
      // Don't show error if no shift found - that's expected
      if (err?.response?.status !== 404) {
        setError(err?.response?.data?.message || 'Failed to load shift');
      }
    } finally {
      setInitialLoading(false);
    }
  };

  const handleOpenShift = async () => {
    const amount = parseFloat(openingCash);
    if (isNaN(amount) || amount < 0) {
      setError('Please enter a valid opening cash amount');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const shift = await shiftsApi.open(amount);
      setCurrentShift(shift);
      setOpeningCash('');
      loadShiftHistory();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to open shift');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    const amount = parseFloat(closingCash);
    if (isNaN(amount) || amount < 0) {
      setError('Please enter a valid closing cash amount');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const shift = await shiftsApi.close(amount);
      setCurrentShift(shift);
      setClosingCash('');
      loadShiftHistory();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to close shift');
    } finally {
      setLoading(false);
    }
  };


  const resetShift = () => {
    setCurrentShift(null);
    setError(null);
  };

  const getCashierLabel = (cashier: Shift['cashier']) => {
    if (!cashier) return '-';
    if (typeof cashier === 'string') return cashier;
    return cashier.name || cashier.email || cashier._id;
  };

  const handleViewShift = async (shiftId: string) => {
    const toastId = notify.loading('Loading shift details...');
    try {
      const shift = await shiftsApi.getById(shiftId);
      setViewShift(shift);
      setViewShiftOpen(true);
      notify.success('Shift details opened', { id: toastId });
    } catch (err: any) {
      console.error('Failed to load shift details:', err);
      setError(err?.response?.data?.message || 'Failed to load shift details');
      notify.error(err?.response?.data?.message || 'Failed to load shift details', { id: toastId });
    }
  };

  const historyColumns = [
    {
      key: 'status',
      header: 'Status',
      render: (shift: Shift) => (
        <Badge variant={shift.status === 'OPEN' ? 'warning' : 'default'}>
          {shift.status}
        </Badge>
      ),
    },
    {
      key: 'openedAt',
      header: 'Opened At',
      render: (shift: Shift) => new Date(shift.openedAt).toLocaleString(),
    },
    {
      key: 'closedAt',
      header: 'Closed At',
      render: (shift: Shift) =>
        shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '-',
    },
    {
      key: 'cashier',
      header: 'Cashier',
      render: (shift: Shift) => getCashierLabel(shift.cashier),
    },
    {
      key: 'openingCash',
      header: 'Opening',
      className: 'text-right',
      render: (shift: Shift) => formatMoney(shift.openingCash),
    },
    {
      key: 'closingCash',
      header: 'Closing',
      className: 'text-right',
      render: (shift: Shift) =>
        shift.closingCash === undefined ? '-' : formatMoney(shift.closingCash),
    },
    {
      key: 'cashDifference',
      header: 'Difference',
      className: 'text-right',
      render: (shift: Shift) => {
        if (shift.closingCash === undefined || shift.status !== 'CLOSED') return '-';
        // Net cash collected = closingCash - openingCash
        const diff = (shift.closingCash ?? 0) - (shift.openingCash ?? 0);
        const isPositive = diff >= 0;
        return (
          <span className={`inline-flex items-center gap-1 font-semibold ${
            isPositive ? 'text-green-700' : 'text-red-700'
          }`}>
            {isPositive ? '+' : '−'}
            {formatMoney(Math.abs(diff))}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (shift: Shift) => (
        <Button size="sm" variant="outline" onClick={() => handleViewShift(shift._id)}>
          View
        </Button>
      ),
    },
  ];

  const historyLimit = 20;
  const totalPages = Math.max(1, Math.ceil(historyTotal / historyLimit));

  return (
    <Layout>
      <PageHeader title="Shift Management" />

      <PageContent>
        <div className="mx-auto max-w-6xl space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Loading State */}
          {initialLoading && (
            <div className="rounded-lg bg-slate-50 p-8 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"></div>
              <p className="mt-4 text-slate-600">Loading shift information...</p>
            </div>
          )}

          {/* Current Shift Status */}
          {!initialLoading && currentShift && currentShift.status === 'OPEN' && (
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                Current Shift
              </h2>
              <div className="mb-6 space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">Status</span>
                  <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                    OPEN
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Opened At</span>
                  <span className="font-medium">
                    {new Date(currentShift.openedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Opening Cash</span>
                  <span className="font-medium">
                    {formatMoney(currentShift.openingCash)}
                  </span>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="mb-3 font-medium text-slate-900">Close Shift</h3>
                  <p className="mb-3 text-xs text-slate-500">Auto closes at 12:00 AM if still open.</p>
                <div className="space-y-4">
                  <Input
                    label="Closing Cash Amount"
                    type="number"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    placeholder="Enter closing cash"
                    step="0.01"
                    min="0"
                  />
                  <Button
                    onClick={handleCloseShift}
                    disabled={loading || !closingCash}
                    className="w-full"
                  >
                    {loading ? 'Closing...' : 'Close Shift'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Closed Shift Summary */}
          {currentShift && currentShift.status === 'CLOSED' && (
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                Shift Summary
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">Status</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                    CLOSED
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Opened At</span>
                  <span className="font-medium">
                    {new Date(currentShift.openedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Closed At</span>
                  <span className="font-medium">
                    {currentShift.closedAt
                      ? new Date(currentShift.closedAt).toLocaleString()
                      : '-'}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Opening Cash</span>
                    <span className="font-medium">
                      {formatMoney(currentShift.openingCash)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Closing Cash</span>
                  <span className="font-medium">
                    {formatMoney(currentShift.closingCash || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Expected Cash</span>
                  <span className="font-medium">
                    {formatMoney(currentShift.expectedCash || 0)}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between text-lg">
                    <span className="font-medium text-slate-900">Difference</span>
                    <span
                      className={`font-bold ${
                        (currentShift.cashDifference || 0) >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {(currentShift.cashDifference || 0) >= 0 ? '+' : ''}
                      {formatMoney(currentShift.cashDifference || 0)}
                    </span>
                  </div>
                  {(currentShift.cashDifference || 0) !== 0 && (
                    <p className="mt-2 text-sm text-slate-500">
                      {(currentShift.cashDifference || 0) > 0
                        ? 'Cash overage detected'
                        : 'Cash shortage detected'}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-6">
                <Button
                  variant="secondary"
                  onClick={resetShift}
                  className="w-full"
                >
                  Start New Shift
                </Button>
              </div>
            </Card>
          )}

          {/* Open New Shift */}
          {!initialLoading && !currentShift && (
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                Open New Shift
              </h2>
              <p className="mb-6 text-sm text-slate-600">
                Start your shift by entering the opening cash amount in the drawer.
              </p>
              <div className="space-y-4">
                <Input
                  label="Opening Cash Amount"
                  type="number"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="Enter opening cash"
                  step="0.01"
                  min="0"
                />
                <Button
                  onClick={handleOpenShift}
                  disabled={loading || !openingCash}
                  className="w-full"
                >
                  {loading ? 'Opening...' : 'Open Shift'}
                </Button>
              </div>
            </Card>
          )}

          {/* Shift History */}
          <Card className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Shift History</h2>

              <div className="flex items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setHistoryPage(1);
                    setStatusFilter(e.target.value as any);
                  }}
                  className="border rounded px-3 py-2"
                >
                  <option value="">All Status</option>
                  <option value="OPEN">Open</option>
                  <option value="CLOSED">Closed</option>
                </select>

                <Button
                  variant="ghost"
                  onClick={() => {
                    setHistoryPage(1);
                    setStatusFilter('');
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            <Table
              columns={historyColumns}
              data={shiftHistory}
              keyExtractor={(s) => s._id}
              loading={historyLoading}
              emptyMessage="No shifts found"
            />

            {historyTotal > historyLimit && (
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  size="sm"
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage(historyPage - 1)}
                >
                  Previous
                </Button>
                <span className="px-4 py-2">
                  Page {historyPage} of {totalPages}
                </span>
                <Button
                  size="sm"
                  disabled={historyPage >= totalPages}
                  onClick={() => setHistoryPage(historyPage + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </Card>

          {/* View Shift Modal */}
          <Modal
            isOpen={viewShiftOpen}
            onClose={() => {
              setViewShiftOpen(false);
              setViewShift(null);
            }}
            title="Shift Details"
            size="lg"
          >
            {!viewShift ? (
              <div className="text-sm text-slate-600">No shift selected.</div>
            ) : (
              <div className="space-y-5">
                {/* Status + ID header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge variant={viewShift.status === 'OPEN' ? 'warning' : 'default'}>
                    {viewShift.status}
                  </Badge>
                  <div className="text-xs text-slate-400 font-mono">ID: {viewShift._id}</div>
                </div>

                {/* Key info grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cashier</div>
                    <div className="mt-1.5 font-semibold text-slate-900">
                      {getCashierLabel(viewShift.cashier)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Duration</div>
                    <div className="mt-1.5 font-semibold text-slate-900">
                      {(() => {
                        const start = new Date(viewShift.openedAt);
                        const end = viewShift.closedAt ? new Date(viewShift.closedAt) : new Date();
                        const mins = Math.round((end.getTime() - start.getTime()) / 60000);
                        const h = Math.floor(mins / 60);
                        const m = mins % 60;
                        return h > 0 ? `${h}h ${m}m` : `${m}m`;
                      })()}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Opened At</div>
                    <div className="mt-1.5 font-semibold text-slate-900">
                      {new Date(viewShift.openedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Closed At</div>
                    <div className="mt-1.5 font-semibold text-slate-900">
                      {viewShift.closedAt ? new Date(viewShift.closedAt).toLocaleString() : <span className="text-green-600">Still open</span>}
                    </div>
                  </div>
                </div>

                {/* Cash reconciliation */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    Cash Reconciliation
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-slate-600">Opening Balance</span>
                      <span className="font-semibold text-slate-900">{formatMoney(viewShift.openingCash)}</span>
                    </div>
                    {viewShift.expectedCash !== undefined && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-slate-600">Expected Closing</span>
                        <span className="font-semibold text-slate-900">{formatMoney(viewShift.expectedCash)}</span>
                      </div>
                    )}
                    {viewShift.closingCash !== undefined && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-slate-600">Actual Closing</span>
                        <span className="font-semibold text-slate-900">{formatMoney(viewShift.closingCash)}</span>
                      </div>
                    )}
                    {viewShift.cashDifference !== undefined && (
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        viewShift.cashDifference >= 0 ? 'bg-green-50' : 'bg-red-50'
                      }`}>
                        <span className={`text-sm font-semibold ${
                          viewShift.cashDifference >= 0 ? 'text-green-800' : 'text-red-800'
                        }`}>
                          {viewShift.cashDifference >= 0 ? '✅ Overage' : '⚠️ Shortage'}
                        </span>
                        <span className={`text-lg font-bold ${
                          viewShift.cashDifference >= 0 ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {viewShift.cashDifference >= 0 ? '+' : '−'}
                          {formatMoney(Math.abs(viewShift.cashDifference))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes if any */}
                {(viewShift as any).notes && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <span className="font-semibold">Notes:</span> {(viewShift as any).notes}
                  </div>
                )}
              </div>
            )}
          </Modal>

          {/* Instructions */}
          <Card className="bg-slate-50 p-6">
            <h3 className="mb-3 font-medium text-slate-900">How Shifts Work</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                <span>Open a shift at the start of your work period by recording the cash in the drawer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                <span>All cash sales during your shift will be tracked automatically</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                <span>Close the shift by counting and entering the final cash amount</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                <span>The system will calculate any cash variance (overage or shortage)</span>
              </li>
            </ul>
          </Card>
        </div>
      </PageContent>
    </Layout>
  );
}
