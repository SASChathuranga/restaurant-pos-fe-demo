import { useEffect, useState } from 'react';
import { Layout, PageHeader, PageContent, Button, Input, Table, Badge, Modal, ConfirmDialog } from '../components';
import { suppliersApi, grnApi } from '../api';
import type { Supplier, SupplierFormData, SupplierTransaction, GRN, GRNPaymentMethod } from '../types';
import { formatMoney } from '../money';
import notify from '../utils/notify';

type Numberish = number | '';

type SupplierFormState = Omit<SupplierFormData, 'creditLimit' | 'paymentTerms'> & {
  creditLimit: Numberish;
  paymentTerms: Numberish;
};

const toNumber = (v: Numberish, fallback = 0) => {
  if (v === '') return fallback;
  return Number.isFinite(v) ? v : fallback;
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerData, setLedgerData] = useState<SupplierTransaction[]>([]);
  const [ledgerLoadingId, setLedgerLoadingId] = useState<string | null>(null);
  
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<Numberish>('');
  const [paymentMethod, setPaymentMethod] = useState<GRNPaymentMethod>('CASH');
  const [paymentGrns, setPaymentGrns] = useState<GRN[]>([]);
  const [selectedGrnId, setSelectedGrnId] = useState('');
  const [loadingPaymentGrns, setLoadingPaymentGrns] = useState(false);
  const currentOutstanding = ledgerSupplier?.outstandingBalance || 0;

  const [formData, setFormData] = useState<SupplierFormState>({
    code: '',
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    creditLimit: '',
    paymentTerms: 30,
    gstNumber: '',
    panNumber: '',
  });

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const res = await suppliersApi.getAll({ search });
      setSuppliers(res.suppliers || []);
    } catch (err: any) {
      console.error('Failed to load suppliers:', err);
      notify.error(err?.response?.data?.message || 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search]);

  const openCreateModal = () => {
    setEditingSupplier(null);
    setFormData({
      code: '',
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      creditLimit: '',
      paymentTerms: 30,
      gstNumber: '',
      panNumber: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      code: supplier.code,
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      creditLimit: supplier.creditLimit,
      paymentTerms: supplier.paymentTerms,
      gstNumber: supplier.gstNumber || '',
      panNumber: supplier.panNumber || '',
    });
    setModalOpen(true);
  };

  const openViewModal = (supplier: Supplier) => {
    setViewSupplier(supplier);
    setViewOpen(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload: SupplierFormData = {
        ...formData,
        creditLimit: toNumber(formData.creditLimit, 0),
        paymentTerms: toNumber(formData.paymentTerms, 30),
      };
      if (editingSupplier) {
        await suppliersApi.update(editingSupplier._id, payload);
        notify.success('Supplier updated successfully');
      } else {
        await suppliersApi.create(payload);
        notify.success('Supplier created successfully');
      }
      setModalOpen(false);
      loadSuppliers();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  const openLedger = async (supplier: Supplier) => {
    setLedgerSupplier(supplier);
    try {
      setLedgerLoadingId(supplier._id);
      const transactions = await suppliersApi.getLedger(supplier._id);
      setLedgerData(transactions);
      setLedgerOpen(true);
    } catch (error) {
      console.error('Failed to load ledger:', error);
    } finally {
      setLedgerLoadingId(null);
    }
  };

  const openPayment = (supplier: Supplier) => {
    setLedgerSupplier(supplier);
    setSelectedGrnId('');
    setPaymentAmount(supplier.outstandingBalance > 0 ? supplier.outstandingBalance : '');
    setPaymentMethod('CASH');
    setPaymentOpen(true);
    setPaymentGrns([]);

    void loadSupplierGrns(supplier._id);
  };

  const getSelectedPaymentGrn = () => paymentGrns.find((grn) => grn._id === selectedGrnId) || null;

  const getOutstandingBalance = () => {
    const selected = getSelectedPaymentGrn();
    if (selected) {
      return Math.max(selected.totalAmount - (selected.paidAmount || 0), 0);
    }
    return currentOutstanding;
  };

  const loadSupplierGrns = async (supplierId: string) => {
    try {
      setLoadingPaymentGrns(true);
      const res = await grnApi.getAll({ supplierId, status: 'APPROVED' });
      const grns = (res.grns || []).filter((grn: GRN) => {
        const paymentStatus = grn.paymentStatus || (grn.paidAmount && grn.paidAmount > 0 ? (grn.paidAmount >= grn.totalAmount ? 'FULLY_PAID' : 'PARTIALLY_PAID') : 'PENDING');
        return paymentStatus === 'PENDING' || paymentStatus === 'PARTIALLY_PAID';
      });
      setPaymentGrns(grns);
    } catch (error) {
      console.error('Failed to load GRNs:', error);
      setPaymentGrns([]);
    } finally {
      setLoadingPaymentGrns(false);
    }
  };

  const handlePayment = async () => {
    const selectedGrn = getSelectedPaymentGrn();
    const outstanding = getOutstandingBalance();

    if (!ledgerSupplier) {
      notify.error('Select a supplier');
      return;
    }

    if (!selectedGrnId) {
      notify.error('Select a GRN');
      return;
    }

    if (typeof paymentAmount !== 'number' || paymentAmount <= 0) {
      notify.error('Enter a valid payment amount');
      return;
    }

    if (!paymentMethod) {
      notify.error('Select payment type');
      return;
    }

    if (!selectedGrn) {
      notify.error('Selected GRN is no longer available');
      return;
    }

    if (outstanding <= 0) {
      notify.error('No outstanding balance to pay');
      return;
    }

    if (paymentAmount > outstanding) {
      notify.error('Payment amount cannot exceed remaining balance');
      return;
    }

    try {
      await grnApi.recordPayment(selectedGrn._id, {
        amount: paymentAmount,
        paymentMethod,
      });
      setPaymentOpen(false);
      setSelectedGrnId('');
      setPaymentGrns([]);
      loadSuppliers();
      notify.success('Payment recorded successfully');
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to record payment');
    }
  };

  const requestDelete = (supplier: Supplier) => {
    setDeletingSupplier(supplier);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingSupplier?._id) return;
    try {
      setDeleting(true);
      await suppliersApi.delete(deletingSupplier._id);
      notify.success('Supplier deleted successfully');
      setDeleteConfirmOpen(false);
      setDeletingSupplier(null);
      loadSuppliers();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to delete supplier');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: 'code', header: 'Code' },
    { key: 'name', header: 'Name' },
    { key: 'contactPerson', header: 'Contact' },
    { key: 'phone', header: 'Phone' },
    {
      key: 'outstandingBalance',
      header: 'Balance',
      render: (item: Supplier) => (
        <span className={item.outstandingBalance > 0 ? 'text-red-600 font-medium' : ''}>
          {formatMoney(item.outstandingBalance)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Supplier) => (
        <Badge variant={item.status === 'ACTIVE' ? 'success' : item.status === 'BLOCKED' ? 'danger' : 'default'}>
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: Supplier) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => openViewModal(item)} aria-label={`View ${item.name}`} title="View">View</Button>
          <Button size="sm" variant="ghost" onClick={() => openEditModal(item)} aria-label={`Edit ${item.name}`} title="Edit">Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => openLedger(item)} loading={ledgerLoadingId === item._id} aria-label={`Payment history for ${item.name}`} title="Payment History">History</Button>
          <Button size="sm" variant="ghost" onClick={() => openPayment(item)} aria-label={`Pay ${item.name}`} title="Pay">Pay</Button>
          <Button size="sm" variant="ghost" onClick={() => requestDelete(item)} aria-label={`Delete ${item.name}`} title="Delete">Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Suppliers"
        subtitle="Manage your suppliers"
        actions={
          <Button onClick={openCreateModal} aria-label="Add Supplier" title="Add Supplier">Add Supplier</Button>
        }
      />
      <PageContent>
        <div className="mb-4">
          <Input
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>
        <Table
          columns={columns}
          data={suppliers}
          keyExtractor={(item) => item._id}
          loading={loading}
          emptyMessage="No suppliers found"
        />
      </PageContent>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>
              {editingSupplier ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Company Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Contact Person"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
              required
            />
            <Input
              label="Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            <Input
              label="Address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Credit Limit"
              type="number"
              value={formData.creditLimit}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setFormData({ ...formData, creditLimit: '' });
                  return;
                }
                const n = Number(raw);
                setFormData({ ...formData, creditLimit: Number.isFinite(n) ? n : '' });
              }}
              required
            />
            <Input
              label="Payment Terms (days)"
              type="number"
              value={formData.paymentTerms}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setFormData({ ...formData, paymentTerms: '' });
                  return;
                }
                const n = parseInt(raw, 10);
                setFormData({ ...formData, paymentTerms: Number.isFinite(n) ? n : '' });
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="GST Number"
              value={formData.gstNumber}
              onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
              required
            />
            <Input
              label="PAN Number"
              value={formData.panNumber}
              onChange={(e) => setFormData({ ...formData, panNumber: e.target.value })}
              required
            />
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal
        isOpen={viewOpen && !!viewSupplier}
        onClose={() => setViewOpen(false)}
        title={`Supplier: ${viewSupplier?.name || ''}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Code</p>
            <p className="font-medium text-slate-900">{viewSupplier?.code || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Status</p>
            {viewSupplier ? (
              <Badge
                variant={
                  viewSupplier.status === 'ACTIVE'
                    ? 'success'
                    : viewSupplier.status === 'BLOCKED'
                      ? 'danger'
                      : 'default'
                }
              >
                {viewSupplier.status}
              </Badge>
            ) : (
              <span className="text-slate-700">-</span>
            )}
          </div>

          <div>
            <p className="text-xs text-slate-500">Contact Person</p>
            <p className="font-medium text-slate-900">{viewSupplier?.contactPerson || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Phone</p>
            <p className="font-medium text-slate-900">{viewSupplier?.phone || '-'}</p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Email</p>
            <p className="font-medium text-slate-900 break-all">{viewSupplier?.email || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Address</p>
            <p className="font-medium text-slate-900">{viewSupplier?.address || '-'}</p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Credit Limit</p>
            <p className="font-medium text-slate-900">{formatMoney(viewSupplier?.creditLimit || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Payment Terms</p>
            <p className="font-medium text-slate-900">{String(viewSupplier?.paymentTerms ?? '-') || '-'}</p>
          </div>

          <div>
            <p className="text-xs text-slate-500">GST Number</p>
            <p className="font-medium text-slate-900">{viewSupplier?.gstNumber || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">PAN Number</p>
            <p className="font-medium text-slate-900">{viewSupplier?.panNumber || '-'}</p>
          </div>

          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500">Outstanding Balance</p>
            <p className="font-medium text-slate-900">{formatMoney(viewSupplier?.outstandingBalance || 0)}</p>
          </div>
        </div>
      </Modal>

      {/* Ledger Modal */}
      <Modal
        isOpen={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        title={`Payment History: ${ledgerSupplier?.name || ''}`}
        size="lg"
      >
        <div className="space-y-2">
          {ledgerData.filter((txn) => txn.transactionType === 'PAYMENT').length === 0 ? (
            <p className="text-slate-500">No payment history yet</p>
          ) : (
            ledgerData.filter((txn) => txn.transactionType === 'PAYMENT').map((txn) => (
              <div key={txn._id} className="flex justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Payment</p>
                  <p className="text-sm text-slate-500">
                    {new Date(txn.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-green-600">
                  -{formatMoney(txn.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={paymentOpen}
        onClose={() => {
          setPaymentOpen(false);
          setSelectedGrnId('');
          setPaymentGrns([]);
        }}
        title={`Record Payment: ${ledgerSupplier?.name || ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => {
              setPaymentOpen(false);
              setSelectedGrnId('');
              setPaymentGrns([]);
            }}>Cancel</Button>
            <Button
              onClick={handlePayment}
              disabled={
                typeof paymentAmount !== 'number' ||
                paymentAmount <= 0 ||
                paymentAmount > getOutstandingBalance() ||
                getOutstandingBalance() <= 0 ||
                !selectedGrnId
              }
            >
              Record Payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Supplier Outstanding: <span className="font-semibold text-slate-900">{formatMoney(ledgerSupplier?.outstandingBalance || 0)}</span>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">GRN</label>
            <select
              value={selectedGrnId}
              onChange={(e) => {
                const grnId = e.target.value;
                setSelectedGrnId(grnId);
                const selected = paymentGrns.find((grn) => grn._id === grnId) || null;
                const remaining = selected ? Math.max(selected.totalAmount - (selected.paidAmount || 0), 0) : currentOutstanding;
                setPaymentAmount(remaining > 0 ? remaining : '');
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={loadingPaymentGrns}
            >
              <option value="">Select GRN</option>
              {paymentGrns.map((grn) => {
                const remaining = Math.max(grn.totalAmount - (grn.paidAmount || 0), 0);
                return (
                  <option key={grn._id} value={grn._id}>
                    {grn.grnNumber} - {formatMoney(remaining)} remaining
                  </option>
                );
              })}
            </select>
            {loadingPaymentGrns ? <p className="mt-1 text-xs text-slate-500">Loading GRNs...</p> : null}
            {!loadingPaymentGrns && paymentGrns.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">No pending or partially paid GRNs for this supplier.</p>
            ) : null}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Remaining Balance: <span className="font-semibold text-amber-950">{formatMoney(getOutstandingBalance())}</span>
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
              const n = Number(raw);
              if (!Number.isFinite(n)) {
                setPaymentAmount('');
                return;
              }
              if (n < 0) {
                setPaymentAmount(0);
                return;
              }
              setPaymentAmount(Math.min(n, getOutstandingBalance()));
            }}
            min={0}
            max={getOutstandingBalance()}
            required
            helperText={`Maximum payable: ${formatMoney(getOutstandingBalance())}`}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Type</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as GRNPaymentMethod)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Select payment type</option>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (deleting) return;
          setDeleteConfirmOpen(false);
          setDeletingSupplier(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Supplier"
        message={`Delete ${deletingSupplier?.name || 'this supplier'}? This action permanently removes the supplier record.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
      />
    </Layout>
  );
}
