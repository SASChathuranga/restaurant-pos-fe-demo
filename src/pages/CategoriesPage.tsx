import { useEffect, useState } from 'react';
import notify from '../utils/notify';
import { Layout, PageHeader, PageContent, Button, Input, Modal, Card, PageLoader, Badge } from '../components';
import { categoriesApi } from '../api';
import type { Category, CategoryFormData } from '../types';

type Numberish = number | '';

type CategoryFormState = Omit<CategoryFormData, 'displayOrder'> & {
  displayOrder: Numberish;
};

const toNumber = (v: Numberish, fallback = 0) => {
  if (v === '') return fallback;
  return Number.isFinite(v) ? v : fallback;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<CategoryFormState>({
    name: '',
    description: '',
    parentId: '',
    icon: '',
    displayOrder: '',
  });

  const loadCategories = async () => {
    try {
      setLoading(true);
      const cats = await categoriesApi.getAll();

      // If backend defaults to returning active-only when `isActive` isn't provided,
      // fetch inactive categories explicitly and merge.
      const allFlat = flattenCategories(cats || []);
      const hasInactive = allFlat.some((c) => c.isActive === false);

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const normalizeCategoryName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

  const flattenCategories = (cats: Category[]): Category[] => {
    const result: Category[] = [];
    const walk = (arr: Category[]) => {
      for (const c of arr) {
        result.push(c);
        if (c.children?.length) walk(c.children);
      }
    };
    if (Array.isArray(cats)) walk(cats);
    return result;
  };

  const openCreateModal = (parentId?: string) => {
    setEditingCategory(null);
    setFormData({ name: '', description: '', parentId: parentId || '', icon: '', displayOrder: '' });
    setModalOpen(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      parentId: category.parentId || '',
      icon: category.icon || '',
      displayOrder: category.displayOrder,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const normalizedName = normalizeCategoryName(formData.name || '');
      if (!normalizedName) {
        notify.error('Category name is required');
        return;
      }

      const parentKey = (formData.parentId || '').trim();
      const all = flattenCategories(categories);
      const duplicate = all.find((c) => {
        if (editingCategory && c._id === editingCategory._id) return false;
        const sameParent = (c.parentId || '').trim() === parentKey;
        return sameParent && normalizeCategoryName(c.name) === normalizedName;
      });

      if (duplicate) {
        notify.error('A category with this name already exists');
        return;
      }

      setSaving(true);
      const data: CategoryFormData = {
        ...formData,
        displayOrder: toNumber(formData.displayOrder, 0),
      };
      if (!data.parentId) delete data.parentId;
      
      if (editingCategory) {
        await categoriesApi.update(editingCategory._id, data);
        notify.success('Category updated successfully');
      } else {
        await categoriesApi.create(data);
        notify.success('Category created successfully');
      }
      setModalOpen(false);
      loadCategories();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (category: Category) => {
    try {
      const currentlyActive = category.isActive !== false;
      const nextActive = !currentlyActive;
      await categoriesApi.update(category._id, { isActive: nextActive });
      notify.success(nextActive ? 'Category activated' : 'Category marked inactive');
      loadCategories();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to update category status');
    }
  };

  const flattenForSelect = (cats: Category[], prefix = '', excludeId?: string): { value: string; label: string }[] => {
    if (!Array.isArray(cats)) return [];
    let result: { value: string; label: string }[] = [];
    for (const cat of cats) {
      if (cat._id !== excludeId) {
        result.push({ value: cat._id, label: prefix + cat.name });
        if (cat.children?.length) {
          result = result.concat(flattenForSelect(cat.children, prefix + '── ', excludeId));
        }
      }
    }
    return result;
  };

  const renderCategoryTree = (cats: Category[], level = 0) => {
    if (!Array.isArray(cats)) return null;
    return cats.map((cat) => (
      <div key={cat._id} style={{ marginLeft: level * 24 }}>
        <div className={`mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 ${cat.isActive === false ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-3">
            {cat.icon && <span className="text-xl">{cat.icon}</span>}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-900">{cat.name}</p>
                <Badge variant={cat.isActive === false ? 'default' : 'success'}>
                  {cat.isActive === false ? 'Inactive' : 'Active'}
                </Badge>
              </div>
              {cat.description && (
                <p className="text-sm text-slate-500">{cat.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => openCreateModal(cat._id)} aria-label={`Add subcategory for ${cat.name}`} title="Add Subcategory">Add Subcategory</Button>
            <Button size="sm" variant="ghost" onClick={() => openEditModal(cat)} aria-label={`Edit ${cat.name}`} title="Edit">Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => handleToggleActive(cat)} aria-label={cat.isActive === false ? `Set ${cat.name} active` : `Set ${cat.name} inactive`} title={cat.isActive === false ? 'Set Active' : 'Set Inactive'}>{cat.isActive === false ? 'Activate' : 'Deactivate'}</Button>
          </div>
        </div>
        {cat.children?.length ? renderCategoryTree(cat.children, level + 1) : null}
      </div>
    ));
  };

  if (loading) {
    return (
      <Layout>
        <PageLoader />
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Categories"
        subtitle="Organize your products into categories"
        actions={
          <Button onClick={() => openCreateModal()} aria-label="Add Category" title="Add Category">Add Category</Button>
        }
      />
      <PageContent>
        {categories.length === 0 ? (
          <Card>
            <div className="py-8 text-center text-slate-500">
              No categories yet. Create your first category!
            </div>
          </Card>
        ) : (
          <div className="space-y-2">{renderCategoryTree(categories)}</div>
        )}
      </PageContent>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCategory ? 'Edit Category' : 'Add Category'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <Input
            label="Icon (emoji)"
            value={formData.icon}
            onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
            placeholder="🍔"
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Parent Category
            </label>
            <select
              value={formData.parentId}
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">None (Top Level)</option>
              {flattenForSelect(categories, '', editingCategory?._id).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Display Order"
            type="number"
            value={formData.displayOrder}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setFormData({ ...formData, displayOrder: '' });
                return;
              }
              const n = parseInt(raw, 10);
              setFormData({ ...formData, displayOrder: Number.isFinite(n) ? n : '' });
            }}
          />
        </div>
      </Modal>
    </Layout>
  );
}
