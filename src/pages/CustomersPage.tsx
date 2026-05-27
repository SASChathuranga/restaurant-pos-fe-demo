import { useEffect, useState } from 'react';
import { Layout, PageHeader, PageContent, Button, Input, Table, Badge, Modal, ConfirmDialog } from '../components';
import { EyeIcon, EditIcon, TrashIcon } from '../components/ActionIcons';
import { customersApi } from '../api';
import type { Customer, CustomerFormData } from '../types';
import { formatMoney } from '../money';
import notify from '../utils/notify';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchReadOnly, setSearchReadOnly] = useState(true);
  const [searchFieldName] = useState(
    () => `q-customer-lookup-${Math.random().toString(36).slice(2, 10)}`
  );
  const [tierFilter, setTierFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  const normalizePhoneInput = (raw: string) => {
    const trimmed = String(raw ?? '').trim();
    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');
    return (hasPlus ? '+' : '') + digits;
  };

  const phoneDigits = (raw: string) => String(raw ?? '').replace(/\D/g, '');

  const isValidYmd = (value: string) => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map((n) => Number(n));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };

  const [viewOpen, setViewOpen] = useState(false);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<any>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState<CustomerFormData>({
    name: '',
    phone: '',
    email: '',
    address: '',
  });

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await customersApi.getAll({ 
        search,
        status: 'ACTIVE',
        tier: tierFilter as any || undefined,
      });
      setCustomers(res.customers || []);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search, tierFilter]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormData({ name: '', phone: '', email: '', address: '', dob: '', notes: '', tier: 'BASIC' });
    setModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || '',
      dob: customer.dob ? customer.dob.split('T')[0] : '',
      notes: customer.notes || '',
      tier: customer.tier || 'BASIC',
    });
    setModalOpen(true);
  };

  const openViewModal = async (customer: Customer) => {
    try {
      setViewCustomer(customer);
      setViewOpen(true);
      setHistoryLoading(true);
      setHistoryData(null);
      const data = await customersApi.getHistory(customer._id, { page: 1, limit: 10 });
      setHistoryData(data);
    } catch (error) {
      console.error('Failed to load customer history:', error);
      notify.error('Failed to load customer history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openDeleteDialog = (customer: Customer) => {
    setDeleteCustomer(customer);
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setDeleteCustomer(null);
  };

  const handleDeleteCustomer = async () => {
    if (!deleteCustomer) return;

    try {
      setDeleting(true);
      const deletingId = deleteCustomer._id;
      const response = await customersApi.delete(deletingId);
      const backendMessage = String((response as { message?: string })?.message || '');

      await loadCustomers();
      setCustomers((prev) => prev.filter((customer) => customer._id !== deletingId));

      notify.success(`${backendMessage || 'Customer deleted successfully'}`);
      setDeleteCustomer(null);
    } catch (error: any) {
      notify.error(error?.response?.data?.message || error?.message || 'Failed to delete customer');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    try {
      const name = (formData.name || '').trim();
      const normalizedPhone = normalizePhoneInput(formData.phone || '');

      if (!name || !normalizedPhone) {
        notify.error('Name and phone are required');
        return;
      }

      const digits = phoneDigits(normalizedPhone);
      if (digits.length < 10 || digits.length > 15) {
        notify.error('Phone number must be 10 to 15 digits');
        return;
      }

      if (!isValidYmd(formData.dob || '')) {
        notify.error('Date of Birth must be in YYYY-MM-DD format');
        return;
      }

      setSaving(true);
      const payload: CustomerFormData = {
        ...formData,
        name,
        phone: normalizedPhone,
      };

      if (!payload.dob) delete payload.dob;

      if (editingCustomer) {
        await customersApi.update(editingCustomer._id, payload);
        notify.success('Customer updated successfully');
      } else {
        await customersApi.create(payload);
        notify.success('Customer created successfully');
      }
      setModalOpen(false);
      loadCustomers();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const getTierVariant = (tier: string) => {
    const map: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
      BASIC: 'default',
      SILVER: 'info',
      GOLD: 'warning',
      PLATINUM: 'success',
    };
    return map[tier] || 'default';
  };

  const columns = [
    { key: 'customerCode', header: 'Code' },
    { key: 'name', header: 'Name' },
    { key: 'phone', header: 'Phone' },
    {
      key: 'tier',
      header: 'Tier',
      render: (item: Customer) => (
        <Badge variant={getTierVariant(item.tier)}>{item.tier}</Badge>
      ),
    },
    {
      key: 'totalOrders',
      header: 'Orders',
    },
    {
      key: 'totalSpent',
      header: 'Total Spent',
      render: (item: Customer) => formatMoney(item.totalSpent),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Customer) => (
        <Badge variant={item.status === 'ACTIVE' ? 'success' : 'default'}>
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: Customer) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => openViewModal(item)} aria-label={`View ${item.name}`} title="View">
            <EyeIcon />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openEditModal(item)} aria-label={`Edit ${item.name}`} title="Edit">
            <EditIcon />
          </Button>
          <Button size="sm" variant="danger" onClick={() => openDeleteDialog(item)} aria-label={`Delete ${item.name}`} title="Delete">
            <TrashIcon />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Customers"
        subtitle="Manage your customer database"
        actions={<Button onClick={openCreateModal} aria-label="Add Customer" title="Add Customer">Add Customer</Button>}
      />
      <PageContent>
        <div className="mb-4 flex gap-4">
          <Input
            placeholder="Search by name, phone, or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            name={searchFieldName}
            autoComplete="off"
            readOnly={searchReadOnly}
            onFocus={() => setSearchReadOnly(false)}
            onBlur={() => setSearchReadOnly(true)}
            type="search"
            spellCheck={false}
            className="max-w-md"
          />
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Tiers</option>
            <option value="BASIC">Basic</option>
            <option value="SILVER">Silver</option>
            <option value="GOLD">Gold</option>
            <option value="PLATINUM">Platinum</option>
          </select>
        </div>

        <Table
          columns={columns}
          data={customers}
          keyExtractor={(item) => item._id}
          loading={loading}
          emptyMessage="No customers found"
        />
      </PageContent>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editingCustomer ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Decoy fields reduce aggressive browser/profile autofill on real inputs */}
          <input
            type="text"
            name="fake-username"
            autoComplete="username"
            tabIndex={-1}
            className="hidden"
            aria-hidden="true"
          />
          <input
            type="password"
            name="fake-password"
            autoComplete="new-password"
            tabIndex={-1}
            className="hidden"
            aria-hidden="true"
          />

          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            name="cf-name"
            autoComplete="new-password"
            data-lpignore="true"
            required
          />
          <Input
            label="Phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: normalizePhoneInput(e.target.value) })}
            name="cf-phone"
            autoComplete="new-password"
            data-lpignore="true"
            inputMode="tel"
            helperText="Digits only (10-15). Use + for country code if needed."
            required
          />
          <Input
            label="Email"
            type="email"
            value={formData.email || ''}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            name="cf-email"
            autoComplete="new-password"
            data-lpignore="true"
          />
          <Input
            label="Address"
            value={formData.address || ''}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            name="cf-address"
            autoComplete="new-password"
            data-lpignore="true"
          />
          <Input
            label="Date of Birth"
            type="date"
            value={formData.dob || ''}
            onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
            name="cf-dob"
            autoComplete="new-password"
            data-lpignore="true"
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Tier
            </label>
            <select
              value={formData.tier || 'BASIC'}
              onChange={(e) => setFormData({ ...formData, tier: e.target.value as any })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="BASIC">Basic</option>
              <option value="SILVER">Silver</option>
              <option value="GOLD">Gold</option>
              <option value="PLATINUM">Platinum</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              name="cf-notes"
              autoComplete="new-password"
              data-lpignore="true"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={3}
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={viewOpen}
        onClose={() => setViewOpen(false)}
        title={viewCustomer ? `Customer ${viewCustomer.name}` : "Customer"}
        size="xl"
      >
        {historyLoading && <div className="p-4 text-sm text-slate-600">Loading...</div>}

        {!historyLoading && historyData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Phone</div>
                <div className="font-medium">{historyData.customer?.phone || '-'}</div>
              </div>
              <div>
                <div className="text-slate-500">Tier</div>
                <div className="font-medium">{historyData.customer?.tier || '-'}</div>
              </div>
              <div>
                <div className="text-slate-500">Total Orders</div>
                <div className="font-medium">{historyData.stats?.totalOrders ?? 0}</div>
              </div>
              <div>
                <div className="text-slate-500">Total Spent</div>
                <div className="font-medium">{formatMoney(historyData.stats?.totalSpent ?? 0)}</div>
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                Recent Sales
              </div>
              <div className="divide-y">
                {(historyData.sales || []).length === 0 ? (
                  <div className="px-3 py-4 text-sm text-slate-600">No sales found</div>
                ) : (
                  (historyData.sales || []).map((s: any) => (
                    <div key={s._id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                      <div className="col-span-3 font-medium">{s.invoiceNumber}</div>
                      <div className="col-span-3 text-slate-600">{new Date(s.createdAt).toLocaleString()}</div>
                      <div className="col-span-2 text-slate-600">{s.orderType || '-'}</div>
                      <div className="col-span-2 text-slate-600">
                        {s.table ? `${s.table.tableNumber}${s.table.section ? ` (${s.table.section})` : ''}` : '-'}
                      </div>
                      <div className="col-span-2 text-right font-semibold">{formatMoney(s.grandTotal)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {historyData.pagination && (
              <div className="text-xs text-slate-500">
                Showing page {historyData.pagination.page} of {historyData.pagination.pages} (total {historyData.pagination.total})
              </div>
            )}
          </div>
        )}

        {!historyLoading && !historyData && (
          <div className="p-4 text-sm text-slate-600">No data</div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteCustomer}
        onClose={closeDeleteDialog}
        onConfirm={handleDeleteCustomer}
        title="Delete Customer"
        message={deleteCustomer ? `Delete ${deleteCustomer.name}? This action permanently removes the customer record.` : 'Delete this customer? This action permanently removes the customer record.'}
        confirmText="Delete"
        variant="danger"
        loading={deleting}
      />
    </Layout>
  );
}

