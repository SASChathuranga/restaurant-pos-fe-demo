import { useEffect, useMemo, useState } from 'react';
import { Layout, PageHeader, PageContent, Button, Input, Table, Pagination, Badge, Modal, ConfirmDialog } from '../components';
import { productsApi, categoriesApi, unitsApi, discountsApi } from '../api';
import type { Product, Category, ProductFormData, Unit, Discount } from '../types';
import notify from '../utils/notify';
import { formatMoney } from '../money';

type Numberish = number | '';

type ProductFormState = Omit<
  ProductFormData,
  'price' | 'cost' | 'taxRate' | 'lowStockThreshold' | 'preparationTime'
> & {
  price: Numberish;
  cost: Numberish;
  taxRate: Numberish;
  lowStockThreshold: Numberish;
  preparationTime: Numberish;
};

const toNumber = (v: Numberish, fallback = 0) => {
  if (v === '') return fallback;
  return Number.isFinite(v) ? v : fallback;
};

const toOptionalNumber = (v: Numberish, min?: number) => {
  if (v === '') return undefined;
  if (!Number.isFinite(v)) return undefined;
  if (typeof min === 'number' && v < min) return min;
  return v;
};

export default function ProductsPage() {
  const PAGE_SIZE = 25;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Unit creation modal
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitSymbol, setNewUnitSymbol] = useState('');

  const [formData, setFormData] = useState<ProductFormState>({
    name: '',
    sku: '',
    barcode: '',
    category: '',
    discount: '',
    price: '',
    cost: '',
    taxRate: '',
    trackStock: false,
    lowStockThreshold: 5,
    preparationTime: '',
    unit: '',
  });

  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await productsApi.getAll({ page, limit: PAGE_SIZE, search });
      setProducts(res.products || []);
      setTotalPages(res.pagination?.pages || 1);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await categoriesApi.getAll();

      // If backend defaults to active-only when `isActive` isn't provided,
      // fetch inactive categories explicitly and merge.
      const flatten = (arr: Category[]): Category[] => {
        const out: Category[] = [];
        const walk = (list: Category[]) => {
          for (const c of list || []) {
            out.push(c);
            if (Array.isArray(c.children) && c.children.length) walk(c.children);
          }
        };
        if (Array.isArray(arr)) walk(arr);
        return out;
      };

      const hasInactive = flatten(cats || []).some((c) => c.isActive === false);
      if (hasInactive) {
        setCategories(cats || []);
        return;
      }

      const [activeCats, inactiveCats] = await Promise.all([
        categoriesApi.getAll({ isActive: true }).catch(() => []),
        categoriesApi.getAll({ isActive: false }).catch(() => []),
      ]);

      const mergeCategoryTrees = (a: Category[], b: Category[]): Category[] => {
        const byId = new Map<string, Category>();
        const order: string[] = [];

        const mergeOne = (existing: Category, incoming: Category): Category => {
          const merged: Category = { ...existing, ...incoming };
          const existingChildren = Array.isArray(existing.children) ? existing.children : [];
          const incomingChildren = Array.isArray(incoming.children) ? incoming.children : [];
          const mergedChildren = mergeCategoryTrees(existingChildren, incomingChildren);
          if (mergedChildren.length) merged.children = mergedChildren;
          else delete (merged as any).children;
          return merged;
        };

        const upsert = (cat: Category) => {
          const current = byId.get(cat._id);
          if (!current) {
            byId.set(cat._id, { ...cat });
            order.push(cat._id);
          } else {
            byId.set(cat._id, mergeOne(current, cat));
          }
        };

        (a || []).forEach(upsert);
        (b || []).forEach(upsert);

        return order.map((id) => byId.get(id)!).filter(Boolean);
      };

      setCategories(mergeCategoryTrees(activeCats || [], inactiveCats || []));
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories([]);
    }
  };

  const flatCategories = useMemo(() => {
    const out: Category[] = [];
    const walk = (arr: Category[]) => {
      for (const c of arr || []) {
        out.push(c);
        if (Array.isArray(c.children) && c.children.length) walk(c.children);
      }
    };
    if (Array.isArray(categories)) walk(categories);
    return out;
  }, [categories]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    flatCategories.forEach((c) => map.set(c._id, c));
    return map;
  }, [flatCategories]);

  const loadUnits = async () => {
    try {
      const unitsData = await unitsApi.getAll();
      const unitsArray = Array.isArray(unitsData) ? unitsData : unitsData?.units || [];
      setUnits(Array.isArray(unitsArray) ? unitsArray : []);
    } catch (error) {
      console.error('Failed to load units:', error);
      setUnits([]);
    }
  };

  const loadDiscounts = async () => {
    try {
      const data = await discountsApi.getAll();
      setDiscounts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load discounts:', error);
      setDiscounts([]);
    }
  };

  const handleCreateUnit = async () => {
    if (!newUnitName.trim()) {
      notify.error('Please enter unit name');
      return;
    }
    try {
      await unitsApi.create({ 
        name: newUnitName, 
        shortCode: newUnitName.substring(0, 3).toUpperCase(),
        type: 'WEIGHT' as const
      });
      notify.success('Unit created successfully!');
      setShowUnitModal(false);
      setNewUnitName('');
      setNewUnitSymbol('');
      loadUnits();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to create unit');
    }
  };

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadUnits();
    loadDiscounts();
  }, [page, search]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '', 
      sku: '', 
      barcode: '', 
      category: '', 
      discount: '',
      price: '', 
      cost: '', 
      taxRate: '',
      trackStock: false,
      lowStockThreshold: 5,
      preparationTime: '',
      unit: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    const discountId = !product.discount
      ? ''
      : typeof product.discount === 'string'
        ? product.discount
        : product.discount?._id || '';
    setFormData({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      category: typeof product.category === 'string' ? product.category : product.category._id,
      discount: discountId,
      price: product.price,
      cost: product.cost,
      taxRate: typeof product.taxRate === 'number' ? product.taxRate : 0,
      trackStock: product.trackStock || false,
      lowStockThreshold: product.lowStockThreshold || 5,
      preparationTime: typeof product.preparationTime === 'number' ? product.preparationTime : '',
      unit: typeof product.unit === 'string' ? product.unit : product.unit?._id || '',
    });
    setModalOpen(true);
  };

  const openViewModal = (product: Product) => {
    setViewingProduct(product);
  };

  const handleSave = async () => {
    // Validation
    if (!formData.name || !formData.name.trim()) {
      notify.error('Please enter a product name');
      return;
    }
    if (!formData.sku || !formData.sku.trim()) {
      notify.error('Please enter a SKU');
      return;
    }
    if (!formData.category) {
      notify.error('Please select a category');
      return;
    }
    if (typeof formData.price !== 'number' || formData.price < 0) {
      notify.error('Please enter a valid price');
      return;
    }
    if (typeof formData.cost !== 'number' || formData.cost < 0) {
      notify.error('Please enter a valid cost');
      return;
    }

    try {
      setSaving(true);
      const payload: ProductFormData = {
        ...formData,
        price: toNumber(formData.price, 0),
        cost: toNumber(formData.cost, 0),
        taxRate: toNumber(formData.taxRate, 0),
        lowStockThreshold: toNumber(formData.lowStockThreshold, 5),
        preparationTime: toOptionalNumber(formData.preparationTime),
        discount: formData.discount ? formData.discount : undefined,
      };
      if (editingProduct) {
        await productsApi.update(editingProduct._id, payload);
        notify.success('Product updated successfully');
      } else {
        await productsApi.create(payload);
        notify.success('Product created successfully');
      }
      setModalOpen(false);
      if (!editingProduct) {
        const shouldResetListView = page !== 1 || search.trim() !== '';
        if (shouldResetListView) {
          setPage(1);
          setSearch('');
        } else {
          loadProducts();
        }
      } else {
        loadProducts();
      }
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (product: Product) => {
    setDeletingProduct(product);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct?._id) return;
    try {
      setDeleting(true);
      await productsApi.delete(deletingProduct._id);
      notify.success('Product deleted successfully');
      setDeleteConfirmOpen(false);
      setDeletingProduct(null);
      loadProducts();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to delete product');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleAvailability = async (product: Product) => {
    try {
      await productsApi.toggleAvailability(product._id, !product.isAvailable);
      notify.success(`${product.isAvailable ? '🔴' : '🟢'} Product availability updated`);
      loadProducts();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to update availability');
    }
  };

  const flattenCategories = (cats: Category[], prefix = ''): { value: string; label: string }[] => {
    if (!Array.isArray(cats)) return [];
    let result: { value: string; label: string }[] = [];
    for (const cat of cats) {
      const isActive = cat.isActive !== false;
      const childPrefix = isActive ? prefix + '  ' : prefix;

      if (isActive) {
        result.push({ value: cat._id, label: prefix + cat.name });
      }

      if (cat.children?.length) {
        result = result.concat(flattenCategories(cat.children, childPrefix));
      }
    }
    return result;
  };

  const discountLabel = (d: Discount) => {
    const v = d.discountType === 'FLAT' ? formatMoney(d.value) : `${d.value}%`;
    return `${d.name} (${v})${d.isActive ? '' : ' [Inactive]'}`;
  };

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'sku', header: 'SKU' },
    {
      key: 'category',
      header: 'Category',
      render: (item: Product) => {
        const cat = typeof item.category === 'object' ? item.category : categoryById.get(item.category);
        if (!cat) return '-';
        return (
          <div className="flex items-center gap-2">
            <span>{cat.name}</span>
            {cat.isActive === false && <Badge variant="default">Inactive</Badge>}
          </div>
        );
      },
    },
    {
      key: 'price',
      header: 'Price',
      render: (item: Product) => formatMoney(item.price),
    },
    {
      key: 'discount',
      header: 'Discount',
      render: (item: Product) => {
        const d = item.discount && typeof item.discount === 'object' ? item.discount : null;
        if (!d) return <span className="text-slate-400">—</span>;
        const value = d.discountType === 'FLAT' ? formatMoney(d.value) : `${d.value}%`;
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-900">{d.name}</span>
            <Badge variant={d.discountType === 'FLAT' ? 'info' : 'warning'}>{value}</Badge>
            {!d.isActive && <Badge variant="default">Inactive</Badge>}
          </div>
        );
      },
    },
    {
      key: 'taxRate',
      header: 'Tax',
      render: (item: Product) => `${item.taxRate || 0}%`,
    },
    {
      key: 'trackStock',
      header: 'Stock Tracking',
      render: (item: Product) => (
        <Badge variant={item.trackStock ? 'success' : 'default'}>
          {item.trackStock ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'isAvailable',
      header: 'Available',
      render: (item: Product) => (
        <button
          onClick={() => handleToggleAvailability(item)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition ${
            item.isAvailable !== false
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          {item.isAvailable !== false ? '✓ In Stock' : '✗ Out of Stock'}
        </button>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (item: Product) => (
        <Badge variant={item.isActive ? 'success' : 'default'}>
          {item.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: Product) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => openViewModal(item)} aria-label={`View ${item.name}`} title="View">View</Button>
          <Button size="sm" variant="ghost" onClick={() => openEditModal(item)} aria-label={`Edit ${item.name}`} title="Edit">Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => requestDelete(item)} aria-label={`Delete ${item.name}`} title="Delete">Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Products"
        subtitle="Manage your product catalog"
        actions={
          <Button onClick={openCreateModal} aria-label="Add Product" title="Add Product">Add Product</Button>
        }
      />
      <PageContent>
        <div className="mb-4">
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="max-w-md"
          />
        </div>

        <Table
          columns={columns}
          data={products}
          keyExtractor={(item) => item._id}
          loading={loading}
          emptyMessage="No products found"
        />
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </PageContent>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editingProduct ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="SKU"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Barcode"
              value={formData.barcode || ''}
              onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              placeholder="Optional"
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select Category</option>
                {flattenCategories(categories).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Discount (Optional)
            </label>
            <select
              value={formData.discount || ''}
              onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No Discount</option>
              {discounts.map((d) => (
                <option key={d._id} value={d._id}>
                  {discountLabel(d)}
                </option>
              ))}
            </select>
          </div>
          
          {/* Unit Selection with Create Option */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Unit of Measurement
            </label>
            <div className="flex gap-2">
              <select
                value={formData.unit || ''}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select Unit (Optional)</option>
                {units.map((unit) => (
                  <option key={unit._id} value={unit._id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowUnitModal(true)}
              >
                + New
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Price"
              type="number"
              value={formData.price}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  setFormData({ ...formData, price: '' });
                  return;
                }
                const n = Number(value);
                setFormData({ ...formData, price: Number.isFinite(n) ? n : '' });
              }}
              required
            />
            <Input
              label="Cost"
              type="number"
              value={formData.cost}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  setFormData({ ...formData, cost: '' });
                  return;
                }
                const n = Number(value);
                setFormData({ ...formData, cost: Number.isFinite(n) ? n : '' });
              }}
              required
            />
            <Input
              label="Tax Rate (%)"
              type="number"
              value={formData.taxRate}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  setFormData({ ...formData, taxRate: '' });
                  return;
                }
                const n = Number(value);
                setFormData({ ...formData, taxRate: Number.isFinite(n) ? n : '' });
              }}
            />
          </div>
          <div className="grid grid-cols-3 gap-4 items-end">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="trackStock"
                checked={formData.trackStock || false}
                onChange={(e) => setFormData({ ...formData, trackStock: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="trackStock" className="text-sm font-medium text-slate-700">
                Track Stock
              </label>
            </div>
            <Input
              label="Low Stock Threshold"
              type="number"
              value={formData.lowStockThreshold}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setFormData({ ...formData, lowStockThreshold: '' });
                  return;
                }
                const n = parseInt(raw, 10);
                setFormData({ ...formData, lowStockThreshold: Number.isFinite(n) ? n : '' });
              }}
              disabled={!formData.trackStock}
            />
            <Input
              label="Prep Time (min)"
              type="number"
              value={formData.preparationTime}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setFormData({ ...formData, preparationTime: '' });
                  return;
                }
                const n = parseInt(raw, 10);
                setFormData({ ...formData, preparationTime: Number.isFinite(n) ? n : '' });
              }}
              placeholder="Optional"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!viewingProduct}
        onClose={() => setViewingProduct(null)}
        title="View Product"
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setViewingProduct(null)}>
            Close
          </Button>
        }
      >
        {viewingProduct && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Name" value={viewingProduct.name} disabled />
              <Input label="SKU" value={viewingProduct.sku} disabled />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Barcode" value={viewingProduct.barcode || ''} disabled />
              <Input
                label="Category"
                value={
                  (typeof viewingProduct.category === 'object'
                    ? viewingProduct.category?.name
                    : categoryById.get(viewingProduct.category)?.name) ||
                  ''
                }
                disabled
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input label="Price" value={formatMoney(viewingProduct.price)} disabled />
              <Input label="Cost" value={formatMoney(viewingProduct.cost)} disabled />
              <Input label="Tax Rate (%)" value={`${viewingProduct.taxRate || 0}%`} disabled />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Discount"
                value={
                  viewingProduct.discount
                    ? typeof viewingProduct.discount === 'object'
                      ? viewingProduct.discount?.name || ''
                      : discounts.find((d) => d._id === viewingProduct.discount)?.name || ''
                    : ''
                }
                disabled
              />
              <Input
                label="Unit"
                value={
                  viewingProduct.unit
                    ? typeof viewingProduct.unit === 'object'
                      ? viewingProduct.unit?.name || ''
                      : units.find((u) => u._id === viewingProduct.unit)?.name || ''
                    : ''
                }
                disabled
              />
              <Input
                label="Status"
                value={viewingProduct.isActive ? 'Active' : 'Inactive'}
                disabled
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Stock Tracking"
                value={viewingProduct.trackStock ? 'Enabled' : 'Disabled'}
                disabled
              />
              <Input
                label="Low Stock Threshold"
                value={`${viewingProduct.lowStockThreshold || 5}`}
                disabled
              />
              <Input
                label="Prep Time (min)"
                value={viewingProduct.preparationTime ? `${viewingProduct.preparationTime}` : ''}
                disabled
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (deleting) return;
          setDeleteConfirmOpen(false);
          setDeletingProduct(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Product"
        message={`Delete ${deletingProduct?.name || 'this product'}? This action permanently removes the product record.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
      />

      {/* Create Unit Modal */}
      <Modal
        isOpen={showUnitModal}
        onClose={() => setShowUnitModal(false)}
        title="Create New Unit"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowUnitModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUnit}>
              Create Unit
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Unit Name"
            value={newUnitName}
            onChange={(e) => setNewUnitName(e.target.value)}
            placeholder="e.g., Kilogram, Piece, Liter"
            required
          />
          <Input
            label="Symbol"
            value={newUnitSymbol}
            onChange={(e) => setNewUnitSymbol(e.target.value)}
            placeholder="e.g., kg, pcs, L"
          />
        </div>
      </Modal>
    </Layout>
  );
}
