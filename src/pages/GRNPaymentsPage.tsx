import { useEffect, useMemo, useState } from 'react';
import notify from '../utils/notify';
import {
  Layout,
  PageHeader,
  PageContent,
  Table,
  Pagination,
  Input,
  Card,
  Badge,
  Button,
  Modal,
  getStatusBadgeVariant,
} from '../components';
import { DollarIcon } from '../components/ActionIcons';
import { grnApi, suppliersApi } from '../api';
import type { GRN, GRNPayment, GRNPaymentMethod, Supplier } from '../types';
import { formatMoney } from '../money';

type Numberish = number | '';

const toNumber = (value: Numberish, fallback = 0) => {
  if (value === '') return fallback;
  return Number.isFinite(value) ? value : fallback;
};

export default function GRNPaymentsPage() {
  const [grns, setGrns] = useState<GRN[]>([]);
  const [payments, setPayments] = useState<GRNPayment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [grnIdFilter, setGrnIdFilter] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSupplierId, setPaymentSupplierId] = useState('');
  const [paymentGrnId, setPaymentGrnId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState<Numberish>('');
  const [paymentMethod, setPaymentMethod] = useState<GRNPaymentMethod>('CASH');
  const [paying, setPaying] = useState(false);

  const getSupplierName = (supplier: string | Supplier | undefined) => {
    if (!supplier) return '-';
    if (typeof supplier === 'object') return supplier.name || '-';
    return suppliers.find((item) => item._id === supplier)?.name || String(supplier);
  };

  const getGrnName = (grn: string | GRN | undefined) => {
    if (!grn) return '-';
    if (typeof grn === 'object') return grn.grnNumber || grn._id || '-';
    return grns.find((item) => item._id === grn)?.grnNumber || String(grn);
  };

  const getPaymentStatus = (grn: GRN) => {
    const paid = Math.max(Number(grn.paidAmount ?? 0) || 0, 0);
    const remaining = Math.max((Number(grn.totalAmount || 0) || 0) - paid, 0);
    if (grn.paymentStatus) return grn.paymentStatus;
    if (paid <= 0) return 'PENDING';
    if (remaining <= 0) return 'FULLY_PAID';
    return 'PARTIALLY_PAID';
  };

  const getRemainingAmount = (grn: GRN) => {
    const paid = Math.max(Number(grn.paidAmount ?? 0) || 0, 0);
    return Math.max((Number(grn.totalAmount || 0) || 0) - paid, 0);
  };

  const load = async () => {
    try {
      setLoading(true);
      setHistoryLoading(true);
      const [grnRes, payRes, supplierRes] = await Promise.all([
        grnApi.getAll(),
        grnApi.getAllPayments({
          page,
          limit: 10,
          supplierId: supplierId || undefined,
          from: from || undefined,
          to: to || undefined,
          grnId: grnIdFilter || undefined,
          search: search || undefined,
        }),
        suppliersApi.getAll(),
      ]);

      setGrns(grnRes.grns || []);
      setPayments(payRes.payments || []);
      setSuppliers(supplierRes.suppliers || []);
      setTotalPages(payRes.pagination?.pages || 1);
    } catch (err) {
      console.error('Failed to load GRN payments:', err);
      notify.error('Failed to load GRN payments');
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [supplierId, from, to, page]);

  const payableGrns = useMemo(() => {
    return grns.filter((grn) => {
      const status = getPaymentStatus(grn);
      return (grn.status === 'APPROVED' || grn.status === 'RECEIVED') && status !== 'FULLY_PAID';
    });
  }, [grns]);

  const filteredGrns = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payableGrns.filter((grn) => {
      const supplierMatch = !supplierId || (typeof grn.supplier_id === 'object' ? grn.supplier_id._id : grn.supplier_id) === supplierId;
      const grnIdMatch = !grnIdFilter || grn._id.toLowerCase().includes(grnIdFilter.toLowerCase()) || grn.grnNumber.toLowerCase().includes(grnIdFilter.toLowerCase());
      const searchMatch = !term
        || grn.grnNumber.toLowerCase().includes(term)
        || (typeof grn.supplier_id === 'object' ? grn.supplier_id.name : getSupplierName(grn.supplier_id)).toLowerCase().includes(term)
        || String(grn.totalAmount).includes(term)
        || String(getRemainingAmount(grn)).includes(term)
        || grn.status.toLowerCase().includes(term)
        || getPaymentStatus(grn).toLowerCase().includes(term);
      return supplierMatch && grnIdMatch && searchMatch;
    });
  }, [payableGrns, supplierId, grnIdFilter, search, suppliers]);

  const filteredPayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((payment) => {
      const supplierText = getSupplierName(payment.supplier_id).toLowerCase();
      const grnText = getGrnName(payment.grn_id).toLowerCase();
      const matchesSupplier = !supplierId || supplierText.includes(supplierId.toLowerCase()) || String(payment.supplier_id).includes(supplierId);
      const matchesGrn = !grnIdFilter || grnText.includes(grnIdFilter.toLowerCase()) || String(payment.grn_id).toLowerCase().includes(grnIdFilter.toLowerCase());
      const matchesSearch = !term
        || supplierText.includes(term)
        || grnText.includes(term)
        || String(payment.amount).includes(term)
        || payment.paymentMethod.toLowerCase().includes(term)
        || (payment.reference || '').toLowerCase().includes(term)
        || (payment.notes || '').toLowerCase().includes(term);
      return matchesSupplier && matchesGrn && matchesSearch;
    });
  }, [payments, supplierId, grnIdFilter, search, suppliers, grns]);

  const openPayment = (grn: GRN) => {
    const supplier = typeof grn.supplier_id === 'object' ? grn.supplier_id._id : grn.supplier_id;
    setPaymentSupplierId(supplier || '');
    setPaymentGrnId(grn._id);
    setPaymentAmount(getRemainingAmount(grn));
    setPaymentMethod('CASH');
    setPaymentOpen(true);
    notify.info(`Recording payment for ${grn.grnNumber}`);
  };

  const selectedSupplierGrns = useMemo(() => {
    return grns.filter((grn) => {
      if (!paymentSupplierId) return getPaymentStatus(grn) !== 'FULLY_PAID';
      const supplier = typeof grn.supplier_id === 'object' ? grn.supplier_id._id : grn.supplier_id;
      return supplier === paymentSupplierId && getPaymentStatus(grn) !== 'FULLY_PAID';
    });
  }, [grns, paymentSupplierId]);

  const selectedPaymentGrn = useMemo(
    () => selectedSupplierGrns.find((grn) => grn._id === paymentGrnId) || null,
    [selectedSupplierGrns, paymentGrnId]
  );

  const remainingBalance = selectedPaymentGrn ? getRemainingAmount(selectedPaymentGrn) : 0;

  useEffect(() => {
    if (!paymentGrnId) {
      setPaymentAmount('');
      return;
    }

    if (!selectedPaymentGrn) {
      return;
    }

    setPaymentAmount(getRemainingAmount(selectedPaymentGrn));
  }, [paymentGrnId, selectedPaymentGrn]);

  const handlePay = async () => {
    if (!paymentSupplierId) {
      notify.error('Supplier is required');
      return;
    }

    if (!paymentGrnId) {
      notify.error('GRN is required');
      return;
    }

    if (!paymentMethod) {
      notify.error('Payment type is required');
      return;
    }

    const amount = toNumber(paymentAmount, 0);
    if (amount <= 0) {
      notify.error('Enter a valid payment amount');
      return;
    }

    if (amount > remainingBalance) {
      notify.error('Payment amount must not exceed the remaining balance');
      return;
    }

    try {
      setPaying(true);
      await grnApi.recordPayment(paymentGrnId, {
        amount,
        paymentMethod,
      });
      notify.success('Payment recorded successfully');
      setPaymentOpen(false);
      setPaymentSupplierId('');
      setPaymentGrnId('');
      setPaymentAmount('');
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message || 'Failed to record payment');
    } finally {
      setPaying(false);
    }
  };

  const grnColumns = [
    {
      key: 'grnNumber',
      header: 'GRN ID',
      render: (grn: GRN) => grn.grnNumber,
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (grn: GRN) => getSupplierName(grn.supplier_id),
    },
    {
      key: 'status',
      header: 'Payment Status',
      render: (grn: GRN) => (
        <Badge variant={getStatusBadgeVariant(getPaymentStatus(grn))}>{getPaymentStatus(grn)}</Badge>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Total',
      render: (grn: GRN) => formatMoney(grn.totalAmount),
    },
    {
      key: 'paidAmount',
      header: 'Paid',
      render: (grn: GRN) => formatMoney(Math.max(Number(grn.paidAmount || 0), 0)),
    },
    {
      key: 'remaining',
      header: 'Remaining',
      render: (grn: GRN) => <span className="font-medium text-red-600">{formatMoney(getRemainingAmount(grn))}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      render: (grn: GRN) => new Date(grn.receivedDate || grn.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (grn: GRN) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openPayment(grn)}
          aria-label={`Make payment for ${grn.grnNumber}`}
          title="Make Payment"
          disabled={getRemainingAmount(grn) <= 0}
        >
          <DollarIcon />
        </Button>
      ),
    },
  ];

  const paymentColumns = [
    {
      key: 'date',
      header: 'Date',
      render: (p: GRNPayment) => new Date(p.createdAt || p.date).toLocaleString(),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (p: GRNPayment) => getSupplierName(p.supplier_id),
    },
    {
      key: 'grn',
      header: 'GRN ID',
      render: (p: GRNPayment) => getGrnName(p.grn_id),
    },
    {
      key: 'amount',
      header: 'Amount Paid',
      render: (p: GRNPayment) => <span className="font-medium">{formatMoney(p.amount)}</span>,
    },
    {
      key: 'paymentMethod',
      header: 'Payment Type',
      render: (p: GRNPayment) => <Badge variant={getStatusBadgeVariant(p.paymentMethod)}>{p.paymentMethod}</Badge>,
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (p: GRNPayment) => p.reference || '-',
    },
  ];

  return (
    <Layout>
      <PageHeader title="GRN Payments" subtitle="Manage GRN payment history and settle outstanding balances" />
      <PageContent>
        <Card className="mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier</label>
              <select
                value={supplierId}
                onChange={(e) => {
                  setPage(1);
                  setSupplierId(e.target.value);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All Suppliers</option>
                {suppliers.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="From"
              type="date"
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
            />
            <Input
              label="To"
              type="date"
              value={to}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
            />
            <Input
              label="GRN ID"
              placeholder="Search by GRN number or id"
              value={grnIdFilter}
              onChange={(e) => {
                setPage(1);
                setGrnIdFilter(e.target.value);
              }}
            />
            <Input
              label="Search"
              placeholder="Supplier, method, amount..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Card>

        <Card className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Payable GRNs</h3>
              <p className="text-sm text-slate-500">Pending and partially paid GRNs available for payment</p>
            </div>
            <div className="text-sm text-slate-500">
              {filteredGrns.length} GRNs
            </div>
          </div>
          <Table
            columns={grnColumns}
            data={filteredGrns}
            keyExtractor={(grn) => grn._id}
            loading={loading}
            emptyMessage="No payable GRNs found"
          />
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Payment History</h3>
              <p className="text-sm text-slate-500">Complete record of GRN payments made</p>
            </div>
            <div className="text-sm text-slate-500">
              {filteredPayments.length} payments
            </div>
          </div>
          <Table
            columns={paymentColumns}
            data={filteredPayments}
            keyExtractor={(payment) => payment._id}
            loading={historyLoading || loading}
            emptyMessage="No GRN payments found"
          />
          <div className="mt-4">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </Card>

        <Modal
          isOpen={paymentOpen}
          onClose={() => {
            setPaymentOpen(false);
            setPaymentSupplierId('');
            setPaymentGrnId('');
            setPaymentAmount('');
          }}
          title="Make GRN Payment"
          size="lg"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setPaymentOpen(false);
                  setPaymentSupplierId('');
                  setPaymentGrnId('');
                  setPaymentAmount('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handlePay} loading={paying} disabled={!paymentSupplierId || !paymentGrnId || toNumber(paymentAmount, 0) <= 0}>
                Pay
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier</label>
              <select
                value={paymentSupplierId}
                onChange={(e) => {
                  const nextSupplierId = e.target.value;
                  setPaymentSupplierId(nextSupplierId);
                  setPaymentGrnId('');
                  setPaymentAmount('');
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">GRN</label>
              <select
                value={paymentGrnId}
                onChange={(e) => {
                  const nextGrnId = e.target.value;
                  setPaymentGrnId(nextGrnId);
                  const nextGrn = selectedSupplierGrns.find((grn) => grn._id === nextGrnId) || null;
                  setPaymentAmount(nextGrn ? getRemainingAmount(nextGrn) : '');
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={!paymentSupplierId}
              >
                <option value="">Select GRN</option>
                {selectedSupplierGrns.map((grn) => {
                  const remaining = getRemainingAmount(grn);
                  return (
                    <option key={grn._id} value={grn._id}>
                      {grn.grnNumber} - {formatMoney(remaining)} remaining
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Remaining balance: <span className="font-semibold text-slate-900">{formatMoney(remainingBalance)}</span>
            </div>

            <Input
              label="Amount"
              type="number"
              value={paymentAmount}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setPaymentAmount('');
                  return;
                }
                const amount = Number(raw);
                if (!Number.isFinite(amount)) {
                  setPaymentAmount('');
                  return;
                }
                setPaymentAmount(Math.min(Math.max(amount, 0), remainingBalance || amount));
              }}
              min={0}
              max={remainingBalance}
              required
              helperText={`Maximum payable: ${formatMoney(remainingBalance)}`}
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Type</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as GRNPaymentMethod)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
          </div>
        </Modal>
      </PageContent>
    </Layout>
  );
}
