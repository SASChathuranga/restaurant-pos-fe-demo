import { useEffect, useState } from 'react';
import notify from '../utils/notify';
import { Layout, PageHeader, PageContent, Table, Badge, Button, Input } from '../components';
import { inventoryApi } from '../api';
import type { Inventory, Product } from '../types';

export default function InventoryPage() {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'tracked' | 'restaurant'>('tracked');

  const loadInventory = async () => {
    try {
      setLoading(true);
      const data = await inventoryApi.getAll();
      // Filter out items with null/undefined products (deleted products)
      const validData = (data || []).filter(item => {
        if (!item) return false;
        // Check if product exists and is an object with _id
        if (typeof item.product === 'object' && item.product && item.product._id) {
          return true;
        }
        // If product is just an ID string, we can't verify it exists, so exclude it
        return false;
      });
      setInventory(validData);
      
      if (validData.length === 0 && data && data.length > 0) {
        notify.error('Some inventory items reference deleted products. Click "Cleanup" to remove them.');
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
      notify.error('Failed to load inventory');
      setInventory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const getProduct = (item: Inventory | null): Product | null => {
    if (!item) return null;
    return (item.product && typeof item.product === 'object') ? item.product : null;
  };

  const filteredInventory = inventory.filter((item) => {
    const product = getProduct(item);
    if (!product) return false;
    if (!search) return true;
    return product?.name.toLowerCase().includes(search.toLowerCase()) ||
           product?.sku.toLowerCase().includes(search.toLowerCase());
  });

  // Separate tracked and untracked products
  const trackedInventory = filteredInventory.filter((item) => {
    const product = getProduct(item);
    return product?.trackStock === true;
  });

  const untrackedInventory = filteredInventory.filter((item) => {
    const product = getProduct(item);
    return product?.trackStock === false;
  });

  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: (item: Inventory) => getProduct(item)?.name || 'Unknown',
    },
    {
      key: 'sku',
      header: 'SKU',
      render: (item: Inventory) => getProduct(item)?.sku || '-',
    },
    {
      key: 'stockQuantity',
      header: 'Stock',
      render: (item: Inventory) => (
        <span className={item.stockQuantity <= item.lowStockThreshold ? 'text-red-600 font-medium' : ''}>
          {item.stockQuantity}
        </span>
      ),
    },
    {
      key: 'lowStockThreshold',
      header: 'Min Stock',
      render: (item: Inventory) => (
        <span className="text-slate-600">
          {item.lowStockThreshold || 0}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Inventory) => {
        if (item.stockQuantity <= 0) {
          return <Badge variant="danger">Out of Stock</Badge>;
        }
        if (item.stockQuantity <= item.lowStockThreshold) {
          return <Badge variant="warning">Low Stock</Badge>;
        }
        return <Badge variant="success">In Stock</Badge>;
      },
    },
  ];

  // Columns for non-tracked products (restaurant items)
  const untrackedColumns = [
    {
      key: 'product',
      header: 'Product',
      render: (item: Inventory) => getProduct(item)?.name || 'Unknown',
    },
    {
      key: 'sku',
      header: 'SKU',
      render: (item: Inventory) => getProduct(item)?.sku || '-',
    },
    {
      key: 'status',
      header: 'Status',
      render: () => (
        <Badge variant="success">Always Available</Badge>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Inventory"
        subtitle="Monitor stock levels"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadInventory}>
              🔄 Refresh
            </Button>
          </div>
        }
      />
      <PageContent>
        {/* Summary Stats */}
        {activeTab === 'tracked' ? (
          <div className="mb-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-600">Total Items</div>
                <div className="text-2xl font-bold text-slate-900">{trackedInventory.length}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-600">Out of Stock</div>
                <div className="text-2xl font-bold text-red-600">
                  {trackedInventory.filter(i => i.stockQuantity <= 0).length}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-600">Low Stock</div>
                <div className="text-2xl font-bold text-yellow-600">
                  {trackedInventory.filter(i => i.stockQuantity > 0 && i.stockQuantity <= i.lowStockThreshold).length}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-600">In Stock</div>
                <div className="text-2xl font-bold text-green-600">
                  {trackedInventory.filter(i => i.stockQuantity > i.lowStockThreshold).length}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-600">Total Items</div>
                <div className="text-2xl font-bold text-slate-900">{untrackedInventory.length}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-600">Always Available</div>
                <div className="text-2xl font-bold text-green-600">{untrackedInventory.length}</div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <Input
            placeholder="Search by product name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
          <button
            onClick={() => setActiveTab('tracked')}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
              activeTab === 'tracked'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📦 Stock Tracked ({trackedInventory.length})
          </button>
          <button
            onClick={() => setActiveTab('restaurant')}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
              activeTab === 'restaurant'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🍽️ Restaurant Items ({untrackedInventory.length})
          </button>
        </div>

        {/* Tab 1: Tracked Inventory */}
        {activeTab === 'tracked' && (
          <div>
            <Table
              columns={columns}
              data={trackedInventory}
              keyExtractor={(item) => item._id}
              loading={loading}
              emptyMessage="No tracked inventory items found"
            />
          </div>
        )}

        {/* Tab 2: Restaurant Items (Untracked) */}
        {activeTab === 'restaurant' && (
          <div>
            <Table
              columns={untrackedColumns}
              data={untrackedInventory}
              keyExtractor={(item) => item._id}
              loading={loading}
              emptyMessage="No restaurant items found"
            />
          </div>
        )}
      </PageContent>
    </Layout>
  );
}
