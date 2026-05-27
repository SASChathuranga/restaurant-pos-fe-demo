import { useEffect, useState } from 'react';
import { Layout, PageHeader, PageContent } from '../components/Layout';
import { Button, Input, Select, Modal, Badge, Table, ConfirmDialog } from '../components';
import { EditIcon, TrashIcon } from '../components/ActionIcons';
import { couponsApi } from '../api/coupons.api';
import type { Coupon, CouponFormData, DiscountType } from '../types';
import { formatMoney } from '../money';

type Numberish = number | '';

type CouponFormState = Omit<CouponFormData, 'value' | 'minOrderValue' | 'maxDiscount' | 'usageLimit'> & {
  value: Numberish;
  minOrderValue: Numberish;
  maxDiscount?: Numberish;
  usageLimit?: Numberish;
};

const initialFormData: CouponFormState = {
  code: '',
  discountType: 'FLAT',
  value: '',
  expiryDate: '',
  minOrderValue: '',
  maxDiscount: '',
  validFrom: '',
  validTo: '',
  usageLimit: '',
};

const toNumber = (v: Numberish, fallback = 0) => {
  if (v === '') return fallback;
  return Number.isFinite(v) ? v : fallback;
};

const toOptionalNumber = (v: Numberish | undefined) => {
  if (v === '' || v === undefined) return undefined;
  return Number.isFinite(v) ? v : undefined;
};

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState<CouponFormState>(initialFormData);
  const [saving, setSaving] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCoupons = async () => {
    try {
      const data = await couponsApi.getAll();
      setCoupons(data);
    } catch (err) {
      console.error('Failed to load coupons:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  const openCreateModal = () => {
    setEditingCoupon(null);
    setFormData(initialFormData);
    setShowModal(true);
  };

  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      discountType: coupon.discountType,
      value: coupon.value,
      expiryDate: coupon.expiryDate.split('T')[0],
      minOrderValue: coupon.minOrderValue,
      maxDiscount: coupon.maxDiscount ?? '',
      validFrom: coupon.validFrom ? coupon.validFrom.split('T')[0] : '',
      validTo: coupon.validTo ? coupon.validTo.split('T')[0] : '',
      usageLimit: coupon.usageLimit ?? '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const valueNum = toNumber(formData.value, 0);
    if (!formData.code.trim()) {
      alert('Coupon code is required');
      return;
    }
    if (!formData.expiryDate) {
      alert('Expiry date is required');
      return;
    }
    if (!(typeof formData.value === 'number') || valueNum <= 0) {
      alert('Please enter a valid discount amount');
      return;
    }
    if (formData.discountType === 'PERCENTAGE' && valueNum > 100) {
      alert('Percentage discount cannot exceed 100');
      return;
    }

    try {
      setSaving(true);
      const payload: CouponFormData = {
        ...formData,
        code: formData.code.trim(),
        value: valueNum,
        minOrderValue: toNumber(formData.minOrderValue, 0),
        maxDiscount: toOptionalNumber(formData.maxDiscount),
        usageLimit: toOptionalNumber(formData.usageLimit),
      };

      if (editingCoupon) {
        await couponsApi.update(editingCoupon._id, payload);
      } else {
        await couponsApi.create(payload);
      }
      setShowModal(false);
      loadCoupons();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to save coupon');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (coupon: Coupon) => {
    try {
      await couponsApi.toggle(coupon._id);
      loadCoupons();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to toggle coupon status');
    }
  };

  const requestDelete = (coupon: Coupon) => {
    setDeletingCoupon(coupon);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCoupon?._id) return;
    try {
      setDeleting(true);
      await couponsApi.delete(deletingCoupon._id);
      setDeleteConfirmOpen(false);
      setDeletingCoupon(null);
      loadCoupons();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete coupon');
    } finally {
      setDeleting(false);
    }
  };

  const isExpired = (date: string) => new Date(date) < new Date();

  const columns = [
    { key: 'code', header: 'Code', render: (c: Coupon) => (
      <span className="font-mono font-medium">{c.code}</span>
    )},
    { key: 'discountType', header: 'Type', render: (c: Coupon) => (
      <Badge variant={c.discountType === 'FLAT' ? 'info' : 'warning'}>
        {c.discountType}
      </Badge>
    )},
    { key: 'value', header: 'Value', render: (c: Coupon) => (
      c.discountType === 'FLAT' ? formatMoney(c.value) : `${c.value}%`
    )},
    { key: 'minOrderValue', header: 'Min Order', render: (c: Coupon) => (
      formatMoney(c.minOrderValue)
    )},
    { key: 'expiryDate', header: 'Expiry', render: (c: Coupon) => (
      <span className={isExpired(c.expiryDate) ? 'text-red-600' : ''}>
        {new Date(c.expiryDate).toLocaleDateString()}
      </span>
    )},
    { key: 'usage', header: 'Usage', render: (c: Coupon) => (
      c.usageLimit ? `${c.timesUsed}/${c.usageLimit}` : `${c.timesUsed}/Infinity`
    )},
    { key: 'status', header: 'Status', render: (c: Coupon) => (
      <button
        onClick={() => handleToggle(c)}
        disabled={isExpired(c.expiryDate)}
        className={`px-3 py-1 rounded-full text-xs font-medium transition ${
          c.isActive && !isExpired(c.expiryDate)
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        } ${isExpired(c.expiryDate) ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {!c.isActive ? 'Inactive' : isExpired(c.expiryDate) ? 'Expired' : 'Active'}
      </button>
    )},
    { key: 'actions', header: 'Actions', render: (c: Coupon) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => openEditModal(c)} aria-label={`Edit ${c.code}`} title="Edit">
          <EditIcon />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => requestDelete(c)} aria-label={`Delete ${c.code}`} title="Delete">
          <TrashIcon />
        </Button>
      </div>
    )},
  ];

  return (
    <Layout>
      <PageHeader
        title="Coupons"
        actions={<Button onClick={openCreateModal} aria-label="Add Coupon" title="Add Coupon">Add Coupon</Button>}
      />

      <PageContent>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"></div>
          </div>
        ) : (
          <Table 
            data={coupons} 
            columns={columns} 
            keyExtractor={(c) => c._id}
            emptyMessage="No coupons found. Create your first coupon!"
          />
        )}
      </PageContent>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCoupon ? 'Edit Coupon' : 'Create Coupon'}
      >
        <div className="space-y-4">
          <Input
            label="Coupon Code"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            placeholder="e.g., SAVE20"
            disabled={!!editingCoupon}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Discount Type"
              value={formData.discountType}
              options={[
                { value: 'FLAT', label: 'Flat Amount' },
                { value: 'PERCENTAGE', label: 'Percentage' },
              ]}
              onChange={(e) => setFormData({ ...formData, discountType: e.target.value as DiscountType })}
            />
            <Input
              label={formData.discountType === 'FLAT' ? 'Discount Amount (Rs.)' : 'Discount (%)'}
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
              label="Min Order Value"
              type="number"
              value={formData.minOrderValue}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setFormData({ ...formData, minOrderValue: '' });
                  return;
                }
                const n = Number(raw);
                setFormData({ ...formData, minOrderValue: Number.isFinite(n) ? n : '' });
              }}
              min={0}
            />
            {formData.discountType === 'PERCENTAGE' && (
              <Input
                label="Max Discount (Rs.)"
                type="number"
                value={formData.maxDiscount ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setFormData({ ...formData, maxDiscount: '' });
                    return;
                  }
                  const n = Number(raw);
                  setFormData({ ...formData, maxDiscount: Number.isFinite(n) ? n : '' });
                }}
                placeholder="No limit"
                min={0}
              />
            )}
          </div>
          <Input
            label="Expiry Date"
            type="date"
            value={formData.expiryDate}
            onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
          />
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
          <Input
            label="Usage Limit (Optional)"
            type="number"
            value={formData.usageLimit ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setFormData({ ...formData, usageLimit: '' });
                return;
              }
              const n = parseInt(raw, 10);
              setFormData({ ...formData, usageLimit: Number.isFinite(n) ? n : '' });
            }}
            placeholder="Unlimited"
            min={1}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving || !formData.code || !formData.expiryDate || typeof formData.value !== 'number' || formData.value <= 0}
            >
              {saving ? 'Saving...' : editingCoupon ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (deleting) return;
          setDeleteConfirmOpen(false);
          setDeletingCoupon(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Coupon"
        message={`Delete ${deletingCoupon?.code || 'this coupon'}? This action permanently removes the coupon record.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
      />
    </Layout>
  );
}

