import { useEffect, useMemo, useState } from 'react';
import notify from '../utils/notify';
import { Layout, PageHeader, PageContent, Button, Input, Select, Modal, Badge, Table, ConfirmDialog } from '../components';
import { EyeIcon, EditIcon, TrashIcon } from '../components/ActionIcons';
import { discountsApi, productsApi } from '../api';
import type { Discount, DiscountFormData, DiscountType, Product, ProductFormData } from '../types';
import { formatMoney } from '../money';

type Numberish = number | '';

type DiscountFormState = Omit<DiscountFormData, 'value'> & {
  value: Numberish;
};

const initialFormData: DiscountFormState = {
  name: '',
  discountType: 'PERCENTAGE',
  value: '',
  validFrom: '',
  validTo: '',
  isActive: true,
};

const toNumber = (v: Numberish, fallback = 0) => {
  if (v === '') return fallback;
  return Number.isFinite(v) ? v : fallback;
};

const formatDiscountValue = (d: Pick<Discount, 'discountType' | 'value'>) =>
  d.discountType === 'FLAT' ? formatMoney(d.value) : `${d.value}%`;

const isWithinRange = (now: Date, from?: string, to?: string) => {
  const fromOk = !from || Number.isNaN(new Date(from).getTime()) || now >= new Date(from);
  const toOk = !to || Number.isNaN(new Date(to).getTime()) || now <= new Date(to);
  return fromOk && toOk;
};

export default function DiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [formData, setFormData] = useState<DiscountFormState>(initialFormData);
  const [saving, setSaving] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingDiscount, setDeletingDiscount] = useState<Discount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Product assignment
  const [knownProducts, setKnownProducts] = useState<Product[]>([]);
  const [pickerProducts, setPickerProducts] = useState<Product[]>([]);
  const [loadingPickerProducts, setLoadingPickerProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [initialAssignedProductIds, setInitialAssignedProductIds] = useState<string[]>([]);

  // View modal
  const [viewDiscount, setViewDiscount] = useState<Discount | null>(null);
  const [viewProducts, setViewProducts] = useState<Product[]>([]);
  const [loadingViewProducts, setLoadingViewProducts] = useState(false);

  const loadDiscounts = async () => {
    try {
      setLoading(true);
      const data = await discountsApi.getAll();
      setDiscounts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load discounts:', err);
      notify.error('Failed to load discounts');
      setDiscounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiscounts();
  }, []);

  // Debounced product search for the picker
  useEffect(() => {
    if (!showModal) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        await loadPickerProducts(productSearch.trim());
      } catch {
        if (!cancelled) setPickerProducts([]);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [productSearch, showModal]);

  useEffect(() => {
    if (!showModal) {
      setPickerProducts([]);
      setProductSearch('');
    }
  }, [showModal]);

  const productDiscountId = (p: Product) => {
    if (!p.discount) return '';
    if (typeof p.discount === 'string') return p.discount;
    return p.discount?._id || '';
  };

  const mergeKnownProducts = (list: Product[]) => {
    if (!Array.isArray(list) || list.length === 0) return;
    setKnownProducts((prev) => {
      const byId = new Map<string, Product>();
      prev.forEach((p) => byId.set(p._id, p));
      list.forEach((p) => byId.set(p._id, p));
      return Array.from(byId.values());
    });
  };

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    knownProducts.forEach((p) => map.set(p._id, p));
    return map;
  }, [knownProducts]);

  const selectedProducts = useMemo(() => {
    return selectedProductIds.map((id) => productById.get(id)).filter(Boolean) as Product[];
  }, [productById, selectedProductIds]);

  const loadPickerProducts = async (search?: string) => {
    try {
      setLoadingPickerProducts(true);
      const res = await productsApi.getAll({ page: 1, limit: 30, search: search || '' } as any);
      const list = (res?.products ?? []) as Product[];
      setPickerProducts(Array.isArray(list) ? list : []);
      mergeKnownProducts(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load products:', err);
      setPickerProducts([]);
    } finally {
      setLoadingPickerProducts(false);
    }
  };

  const loadAssignedProductsForDiscount = async (discountId: string) => {
    // Best-effort: fetch a large page and filter client-side
    const res = await productsApi.getAll({ page: 1, limit: 500 } as any);
    const list = (res?.products ?? []) as Product[];
    const assigned = (Array.isArray(list) ? list : []).filter((p) => productDiscountId(p) === discountId);
    mergeKnownProducts(assigned);
    return assigned;
  };

  const buildProductPayloadWithDiscount = (p: Product, discount: string | null): ProductFormData => {
    const categoryId = typeof p.category === 'string' ? p.category : p.category?._id;
    const unitId = typeof p.unit === 'string' ? p.unit : p.unit?._id;

    return {
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      category: categoryId || '',
      discount: discount as any,
      price: p.price,
      cost: p.cost,
      taxRate: p.taxRate ?? 0,
      trackStock: p.trackStock ?? false,
      lowStockThreshold: p.lowStockThreshold ?? 0,
      preparationTime: p.preparationTime,
      unit: unitId,
    };
  };

  const updateProductDiscount = async (productId: string, discountId: string | null) => {
    const current = await productsApi.getById(productId);
    const payload = buildProductPayloadWithDiscount(current, discountId);
    await productsApi.update(productId, payload as any);
  };

  const syncProductAssignments = async (discountId: string) => {
    const before = new Set(initialAssignedProductIds);
    const after = new Set(selectedProductIds);

    const toAdd: string[] = [];
    const toRemove: string[] = [];

    after.forEach((id) => {
      if (!before.has(id)) toAdd.push(id);
    });
    before.forEach((id) => {
      if (!after.has(id)) toRemove.push(id);
    });

    // Sequential updates (safer for typical backends)
    for (const id of toAdd) {
      await updateProductDiscount(id, discountId);
    }
    for (const id of toRemove) {
      await updateProductDiscount(id, null);
    }
  };

  const openCreateModal = () => {
    setEditingDiscount(null);
    setFormData(initialFormData);
    setSelectedProductIds([]);
    setInitialAssignedProductIds([]);
    setProductSearch('');
    loadPickerProducts('');
    setShowModal(true);
  };

  const openEditModal = (discount: Discount) => {
    setEditingDiscount(discount);
    setFormData({
      name: discount.name,
      discountType: discount.discountType,
      value: discount.value,
      validFrom: discount.validFrom ? discount.validFrom.split('T')[0] : '',
      validTo: discount.validTo ? discount.validTo.split('T')[0] : '',
      isActive: discount.isActive,
    });
    setProductSearch('');
    loadPickerProducts('');
    // Preload currently assigned products
    loadAssignedProductsForDiscount(discount._id)
      .then((assigned) => {
        const ids = assigned.map((p) => p._id);
        setSelectedProductIds(ids);
        setInitialAssignedProductIds(ids);
      })
      .catch(() => {
        setSelectedProductIds([]);
        setInitialAssignedProductIds([]);
      });
    setShowModal(true);
  };

  const openViewModal = (discount: Discount) => {
    setViewDiscount(discount);
    setViewProducts([]);
    setLoadingViewProducts(true);
    loadAssignedProductsForDiscount(discount._id)
      .then((assigned) => setViewProducts(assigned))
      .catch(() => setViewProducts([]))
      .finally(() => setLoadingViewProducts(false));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      notify.error('Please enter discount name');
      return;
    }
    if (typeof formData.value !== 'number' || formData.value <= 0) {
      notify.error('Please enter a valid discount value');
      return;
    }

    try {
      setSaving(true);

      const payload: DiscountFormData = {
        ...formData,
        value: toNumber(formData.value, 0),
        validFrom: formData.validFrom ? formData.validFrom : undefined,
        validTo: formData.validTo ? formData.validTo : undefined,
      };

      let saved: Discount;
      if (editingDiscount) {
        saved = await discountsApi.update(editingDiscount._id, payload);
        await syncProductAssignments(saved._id);
        notify.success('Discount updated');
      } else {
        saved = await discountsApi.create(payload);
        // Assign selected products to the newly created discount
        if (selectedProductIds.length > 0) {
          setInitialAssignedProductIds([]);
          await syncProductAssignments(saved._id);
        }
        notify.success('Discount created');
      }
      setShowModal(false);
      loadDiscounts();
    } catch (err: any) {
      notify.error(err?.response?.data?.message || 'Failed to save discount');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (discount: Discount) => {
    try {
      await discountsApi.toggle(discount._id);
      loadDiscounts();
    } catch (err: any) {
      notify.error(err?.response?.data?.message || 'Failed to toggle discount status');
    }
  };

  const requestDelete = (discount: Discount) => {
    setDeletingDiscount(discount);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingDiscount?._id) return;
    try {
      setDeleting(true);
      await discountsApi.delete(deletingDiscount._id);
      notify.success('Discount deleted');
      setDeleteConfirmOpen(false);
      setDeletingDiscount(null);
      loadDiscounts();
    } catch (err: any) {
      notify.error(err?.response?.data?.message || 'Failed to delete discount');
    } finally {
      setDeleting(false);
    }
  };

  const now = useMemo(() => new Date(), []);

  const columns = [
    { key: 'name', header: 'Name', render: (d: Discount) => (
      <div className="flex flex-col">
        <span className="font-medium text-slate-900">{d.name}</span>
        <span className="text-xs text-slate-500">{formatDiscountValue(d)}</span>
      </div>
    )},
    { key: 'type', header: 'Type', render: (d: Discount) => (
      <Badge variant={d.discountType === 'FLAT' ? 'info' : 'warning'}>
        {d.discountType}
      </Badge>
    )},
    { key: 'value', header: 'Value', render: (d: Discount) => formatDiscountValue(d) },
    { key: 'period', header: 'Valid', render: (d: Discount) => {
      const from = d.validFrom ? new Date(d.validFrom).toLocaleDateString() : '--';
      const to = d.validTo ? new Date(d.validTo).toLocaleDateString() : '--';
      return <span className="text-sm text-slate-700">{from} {'->'} {to}</span>;
    }},
    { key: 'status', header: 'Status', render: (d: Discount) => {
      const activeInTime = isWithinRange(now, d.validFrom, d.validTo);
      const disabled = !activeInTime;
      return (
        <button
          onClick={() => handleToggle(d)}
          disabled={disabled}
          className={`px-3 py-1 rounded-full text-xs font-medium transition ${
            d.isActive && activeInTime
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {!activeInTime ? 'Out of range' : d.isActive ? 'Active' : 'Inactive'}
        </button>
      );
    }},
    { key: 'actions', header: 'Actions', render: (d: Discount) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => openViewModal(d)} aria-label={`View ${d.name}`} title="View">
          <EyeIcon />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openEditModal(d)} aria-label={`Edit ${d.name}`} title="Edit">
          <EditIcon />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => requestDelete(d)} aria-label={`Delete ${d.name}`} title="Delete">
          <TrashIcon />
        </Button>
      </div>
    )},
  ];

  return (
    <Layout>
      <PageHeader
        title="Discounts"
        subtitle="Create discounts and assign them to products"
        actions={<Button onClick={openCreateModal} aria-label="Add Discount" title="Add Discount">Add Discount</Button>}
      />

      <PageContent>
        <Table
          data={discounts}
          columns={columns}
          keyExtractor={(d) => d._id}
          loading={loading}
          emptyMessage="No discounts found. Create your first discount!"
        />
      </PageContent>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingDiscount ? 'Edit Discount' : 'Create Discount'}
      >
        <div className="space-y-4">
          <Input
            label="Discount Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Weekend Offer"
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Discount Type"
              value={formData.discountType}
              options={[
                { value: 'PERCENTAGE', label: 'Percentage' },
                { value: 'FLAT', label: 'Flat Amount' },
              ]}
              onChange={(e) => setFormData({ ...formData, discountType: e.target.value as DiscountType })}
            />
            <Input
              label={formData.discountType === 'FLAT' ? 'Amount (Rs.)' : 'Percentage (%)'}
              type="number"
              value={formData.value}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setFormData({ ...formData, value: '' });
                  return;
                }
                const n = Number(raw);
                setFormData({ ...formData, value: Number.isFinite(n) ? n : '' });
              }}
              min={0}
              max={formData.discountType === 'PERCENTAGE' ? 100 : undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Valid From (Optional)"
              type="date"
              value={formData.validFrom || ''}
              onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
            />
            <Input
              label="Valid To (Optional)"
              type="date"
              value={formData.validTo || ''}
              onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <div className="text-sm font-medium text-slate-900">Active</div>
              <div className="text-xs text-slate-500">Disable to stop applying this discount</div>
            </div>
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
          </div>

          {/* Product assignment */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900">Assign Products (Optional)</div>
                <div className="text-xs text-slate-500">Select products that should use this discount</div>
              </div>
              <div className="text-xs font-semibold text-slate-600">Selected: {selectedProductIds.length}</div>
            </div>

            {selectedProducts.length > 0 && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700 max-h-28 overflow-auto">
                {selectedProducts.map((p) => (
                  <div key={p._id} className="flex items-center justify-between gap-3 py-1">
                    <span className="truncate">{p.name}</span>
                    <button
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      onClick={() => setSelectedProductIds((prev) => prev.filter((id) => id !== p._id))}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Input
              label="Search Product"
              value={productSearch}
              onChange={(e) => {
                const next = e.target.value;
                setProductSearch(next);
              }}
              placeholder="Type product name / SKU"
            />

            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="max-h-56 overflow-auto">
                {loadingPickerProducts ? (
                  <div className="p-3 text-sm text-slate-500">Loading products...</div>
                ) : pickerProducts.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">No products found.</div>
                ) : (
                  pickerProducts.map((p) => {
                    const checked = selectedProductIds.includes(p._id);
                    return (
                      <label
                        key={p._id}
                        className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                          <div className="text-xs text-slate-500 truncate">SKU: {p.sku} | Price: {formatMoney(p.price)}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setSelectedProductIds((prev) => {
                              if (on) return prev.includes(p._id) ? prev : [...prev, p._id];
                              return prev.filter((id) => id !== p._id);
                            });
                            mergeKnownProducts([p]);
                          }}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.name.trim() || typeof formData.value !== 'number' || formData.value <= 0}
            >
              {saving ? 'Saving...' : editingDiscount ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* View Discount Modal */}
      <Modal
        isOpen={!!viewDiscount}
        onClose={() => setViewDiscount(null)}
        title="Discount Details"
      >
        {viewDiscount && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-lg font-bold text-slate-900">{viewDiscount.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-700">
                <Badge variant={viewDiscount.discountType === 'FLAT' ? 'info' : 'warning'}>{viewDiscount.discountType}</Badge>
                <span className="font-semibold">{formatDiscountValue(viewDiscount)}</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-600">{viewDiscount.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="mt-2 text-sm text-slate-600">
                Valid: {viewDiscount.validFrom ? new Date(viewDiscount.validFrom).toLocaleDateString() : '--'} {'->'}{' '}
                {viewDiscount.validTo ? new Date(viewDiscount.validTo).toLocaleDateString() : '--'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-white border-b border-slate-100">
                <div className="text-sm font-semibold text-slate-900">Products on this discount</div>
                <div className="text-xs text-slate-500">{loadingViewProducts ? 'Loading...' : `${viewProducts.length} products`}</div>
              </div>
              <div className="max-h-72 overflow-auto bg-white">
                {loadingViewProducts ? (
                  <div className="p-4 text-sm text-slate-500">Loading products...</div>
                ) : viewProducts.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">No products assigned.</div>
                ) : (
                  viewProducts.map((p) => (
                    <div key={p._id} className="px-4 py-3 border-b border-slate-100 last:border-b-0">
                      <div className="text-sm font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">SKU: {p.sku} | Price: {formatMoney(p.price)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setViewDiscount(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  const d = viewDiscount;
                  setViewDiscount(null);
                  openEditModal(d);
                }}
              >
                Edit / Add Products
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (deleting) return;
          setDeleteConfirmOpen(false);
          setDeletingDiscount(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Discount"
        message={`Delete ${deletingDiscount?.name || 'this discount'}? This action permanently removes the discount record.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
      />
    </Layout>
  );
}

