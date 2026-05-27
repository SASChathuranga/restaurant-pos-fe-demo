import { useState, useEffect } from 'react';
import { Layout, PageHeader, PageContent, Button, Input, Table, Badge, getStatusBadgeVariant, Modal, Card } from '../components';
import { EyeIcon, PrinterIcon, EditIcon, XIcon, TrashIcon, HandIcon } from '../components/ActionIcons';
import { purchaseOrdersApi, suppliersApi, productsApi } from '../api';
import type { PurchaseOrder, PurchaseOrderFormData, PurchaseOrderItem, Supplier, Product } from '../types';
import { formatMoney } from '../money';
import notify from '../utils/notify';

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState<string | null>(null);
  const [printLoadingId, setPrintLoadingId] = useState<string | null>(null);
  const [approveLoadingId, setApproveLoadingId] = useState<string | null>(null);
  const [cancelLoadingId, setCancelLoadingId] = useState<string | null>(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [orderToApprove, setOrderToApprove] = useState<PurchaseOrder | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<PurchaseOrder | null>(null);

  const [formData, setFormData] = useState<PurchaseOrderFormData>({
    supplier_id: '',
    items: [],
    totalAmount: 0,
    deliveryDate: '',
    notes: '',
  });

  const [newItem, setNewItem] = useState<{
    product_id: string;
    quantity: number | '';
    unitPrice: number | '';
  }>({
    product_id: '',
    quantity: 1,
    unitPrice: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [ordersRes, suppliersRes, productsRes] = await Promise.all([
        purchaseOrdersApi.getAll({ status: statusFilter as any || undefined }),
        suppliersApi.getAll({}),
        productsApi.getAll({ limit: 1000 }),
      ]);
      setOrders(ordersRes.purchaseOrders || []);
      setSuppliers(suppliersRes.suppliers || []);
      setProducts(productsRes.products || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      supplier_id: '',
      items: [],
      totalAmount: 0,
      deliveryDate: '',
      notes: '',
    });
    setNewItem({ product_id: '', quantity: 1, unitPrice: '' });
    setModalOpen(true);
  };

  const openEditModal = (order: PurchaseOrder) => {
    setEditingId(order._id);
    setFormData({
      supplier_id: typeof order.supplier_id === 'object' ? order.supplier_id._id : order.supplier_id,
      items: order.items,
      totalAmount: order.totalAmount,
      deliveryDate: order.deliveryDate || '',
      notes: order.notes || '',
    });
    setModalOpen(true);
  };

  const openViewModal = async (id: string) => {
    try {
      setViewLoadingId(id);
      setViewOpen(true);
      setViewLoading(true);
      setViewOrder(null);
      const po = await purchaseOrdersApi.getById(id);
      setViewOrder(po);
      notify.success('Purchase order details opened');
    } catch (error) {
      console.error('Failed to load PO:', error);
      notify.error('Failed to load purchase order');
      setViewOpen(false);
    } finally {
      setViewLoading(false);
      setViewLoadingId(null);
    }
  };

  const printPurchaseOrder = (po: PurchaseOrder) => {
    const supplierName = (po.supplier_id && typeof po.supplier_id === 'object') ? po.supplier_id.name : '-';
    const createdAt = po.createdAt ? new Date(po.createdAt).toLocaleString() : '-';
    const deliveryDate = po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString() : '-';

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order - ${po.poNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
          .header { text-align: center; margin-bottom: 24px; }
          .header h1 { margin: 0; font-size: 20px; }
          .header h2 { margin: 6px 0 0; font-size: 16px; font-weight: 600; color: #334155; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
          .meta .row { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; }
          .label { font-size: 12px; color: #64748b; }
          .value { margin-top: 4px; font-size: 14px; font-weight: 600; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; font-size: 13px; }
          th { background: #f8fafc; font-weight: 700; color: #334155; }
          td.num, th.num { text-align: right; }
          .totals { margin-top: 12px; display: flex; justify-content: flex-end; gap: 12px; font-size: 14px; }
          .notes { margin-top: 16px; font-size: 13px; }
          .notes .value { font-weight: 400; white-space: pre-wrap; }
          .footer { margin-top: 28px; border-top: 2px solid #0f172a; padding-top: 16px; display: flex; justify-content: space-between; gap: 24px; }
          .sign { width: 45%; }
          .line { margin-top: 36px; border-top: 1px solid #0f172a; }
          .sign-label { margin-top: 6px; font-size: 12px; color: #475569; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PURCHASE ORDER</h1>
          <h2>${po.poNumber}</h2>
        </div>

        <div class="meta">
          <div class="row">
            <div class="label">Supplier</div>
            <div class="value">${supplierName}</div>
          </div>
          <div class="row">
            <div class="label">Status</div>
            <div class="value">${po.status}</div>
          </div>
          <div class="row">
            <div class="label">Created</div>
            <div class="value">${createdAt}</div>
          </div>
          <div class="row">
            <div class="label">Expected Delivery</div>
            <div class="value">${deliveryDate}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th class="num">Qty</th>
              <th class="num">Unit Price</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            ${(po.items || []).map(it => `
              <tr>
                <td>${it.productName}</td>
                <td class="num">${it.quantity}</td>
                <td class="num">${formatMoney(it.unitPrice)}</td>
                <td class="num">${formatMoney(it.totalPrice)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="label" style="align-self:center">Grand Total</div>
          <div class="value">${formatMoney(po.totalAmount)}</div>
        </div>

        ${po.notes ? `
          <div class="notes">
            <div class="label">Notes</div>
            <div class="value">${String(po.notes).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>
        ` : ''}

        <div class="footer">
          <div class="sign">
            <div class="line"></div>
            <div class="sign-label">Prepared By</div>
          </div>
          <div class="sign">
            <div class="line"></div>
            <div class="sign-label">Approved By</div>
          </div>
        </div>

        <script>
          window.addEventListener('load', () => { window.print(); });
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      notify.error('Pop-up blocked. Please allow pop-ups to print.');
      return;
    }
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const handlePrintPO = async (id: string) => {
    try {
      setPrintLoadingId(id);
      const po = await purchaseOrdersApi.getById(id);
      printPurchaseOrder(po);
    } catch (error) {
      console.error('Failed to load PO for print:', error);
      notify.error('Failed to print purchase order');
    } finally {
      setPrintLoadingId(null);
    }
  };

  const addItem = () => {
    if (!newItem.product_id) {
      notify.error('Please select a product');
      return;
    }
    const product = products.find((p) => p._id === newItem.product_id);
    if (!product) {
      notify.error('Product not found');
      return;
    }

    const quantity = newItem.quantity === '' ? NaN : Number(newItem.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      notify.error('Please enter a valid quantity');
      return;
    }

    const fallbackCost = typeof product.cost === 'number' ? product.cost : 0;
    const unitPrice = newItem.unitPrice === '' ? fallbackCost : Number(newItem.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      notify.error('Please enter a valid unit price');
      return;
    }

    const item: PurchaseOrderItem = {
      product_id: newItem.product_id,
      productName: product.name,
      quantity,
      unitPrice,
      totalPrice: quantity * unitPrice,
    };

    const newItems = [...formData.items, item];
    const total = newItems.reduce((sum, i) => sum + i.totalPrice, 0);
    
    setFormData({ ...formData, items: newItems, totalAmount: total });
    setNewItem({ product_id: '', quantity: 1, unitPrice: '' });
  };

  const removeItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    const total = newItems.reduce((sum, i) => sum + i.totalPrice, 0);
    setFormData({ ...formData, items: newItems, totalAmount: total });
  };

  const handleSave = async () => {
    if (!formData.supplier_id) {
      notify.error('Please select a supplier');
      return;
    }

    if (formData.items.length === 0) {
      notify.error('Please add at least one item');
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        await purchaseOrdersApi.update(editingId, formData);
        notify.success('Purchase order updated successfully');
      } else {
        await purchaseOrdersApi.create(formData);
        notify.success('Purchase order created successfully');
      }
      setModalOpen(false);
      loadData();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to save PO');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
      const order = orders.find(o => o._id === id);
      if (order) {
        setOrderToApprove(order);
        setApprovalModalOpen(true);
      }
    };

    const confirmApproval = async () => {
      if (!orderToApprove) return;
      try {
        setApproveLoadingId(orderToApprove._id);
        await purchaseOrdersApi.approve(orderToApprove._id);
        notify.success(`PO ${orderToApprove.poNumber} approved successfully! Ready for procurement.`);
        setApprovalModalOpen(false);
        setOrderToApprove(null);
        loadData();
      } catch (error: any) {
        notify.error(error?.response?.data?.message || 'Failed to approve PO');
      } finally {
        setApproveLoadingId(null);
      }
    };

  const handleCancel = async (id: string) => {
    const order = orders.find((item) => item._id === id);
    if (order) {
      setOrderToCancel(order);
      setCancelModalOpen(true);
    }
  };

  const confirmCancel = async () => {
    if (!orderToCancel) return;

    try {
      setCancelLoadingId(orderToCancel._id);
      await purchaseOrdersApi.cancel(orderToCancel._id);
      notify.success(`PO ${orderToCancel.poNumber} has been cancelled.`);
      setCancelModalOpen(false);
      setOrderToCancel(null);
      loadData();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to cancel PO');
    } finally {
      setCancelLoadingId(null);
    }
  };

  const columns = [
    { key: 'poNumber', header: 'PO Number' },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (item: PurchaseOrder) =>
        (item.supplier_id && typeof item.supplier_id === 'object') ? item.supplier_id.name : '-',
    },
    {
      key: 'items',
      header: 'Items',
      render: (item: PurchaseOrder) => item.items?.length || 0,
    },
    {
      key: 'totalAmount',
      header: 'Total',
      render: (item: PurchaseOrder) => formatMoney(item.totalAmount),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: PurchaseOrder) => (
        <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (item: PurchaseOrder) => new Date(item.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: PurchaseOrder) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => openViewModal(item._id)} loading={viewLoadingId === item._id} aria-label={`View purchase order ${item.poNumber}`} title="View">
            <EyeIcon />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handlePrintPO(item._id)} loading={printLoadingId === item._id} aria-label={`Print purchase order ${item.poNumber}`} title="Print">
            <PrinterIcon />
          </Button>
          {(item.status === 'DRAFT' || item.status === 'PENDING') && (
            <Button size="sm" variant="ghost" onClick={() => openEditModal(item)} aria-label={`Edit purchase order ${item.poNumber}`} title="Edit">
              <EditIcon />
            </Button>
          )}
          {item.status === 'PENDING' && (
            <>
              <Button size="sm" variant="ghost" onClick={() => handleApprove(item._id)} loading={approveLoadingId === item._id} aria-label={`Approve purchase order ${item.poNumber}`} title="Approve">
                 <HandIcon />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleCancel(item._id)} loading={cancelLoadingId === item._id} aria-label={`Cancel purchase order ${item.poNumber}`} title="Cancel">
                <XIcon />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage procurement orders"
        actions={<Button onClick={openCreateModal} aria-label="Create Purchase Order" title="Create PO">Create PO</Button>}
      />
      <PageContent>
        <div className="mb-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <Table
          columns={columns}
          data={orders}
          keyExtractor={(item) => item._id}
          loading={loading}
          emptyMessage="No purchase orders found"
        />
      </PageContent>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Purchase Order" : "Create Purchase Order"}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving} disabled={!formData.supplier_id || formData.items.length === 0}>
              {editingId ? "Update PO" : "Create PO"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier</label>
              <select
                value={formData.supplier_id}
                onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <Input
              label="Expected Delivery"
              type="date"
              value={formData.deliveryDate || ''}
              onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
            />
          </div>

          {/* Add Item */}
          <Card padding="sm">
            <h4 className="mb-3 font-medium">Add Item</h4>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_180px_auto] md:items-end">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Product</label>
                <select
                  value={newItem.product_id}
                  onChange={(e) => {
                    const product = products.find((p) => p._id === e.target.value);
                    setNewItem({
                      ...newItem,
                      product_id: e.target.value,
                      unitPrice: typeof product?.cost === 'number' ? product.cost : '',
                    });
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select Product</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>
              <Input
                label="Quantity"
                type="number"
                value={newItem.quantity}
                onChange={(e) =>
                  setNewItem({
                    ...newItem,
                    quantity: e.target.value === '' ? '' : parseInt(e.target.value, 10),
                  })
                }
              />
              <Input
                label="Unit Price"
                type="number"
                value={newItem.unitPrice}
                onChange={(e) =>
                  setNewItem({
                    ...newItem,
                    unitPrice: e.target.value === '' ? '' : parseFloat(e.target.value),
                  })
                }
              />
              <Button onClick={addItem} aria-label="Add item" title="Add">Add</Button>
            </div>
          </Card>

          {/* Items List */}
          {formData.items.length > 0 && (
            <div className="space-y-2">
              {formData.items.map((item, index) => (
                <div key={index} className="flex justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-sm text-slate-500">
                      {item.quantity} x {formatMoney(item.unitPrice)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{formatMoney(item.totalPrice)}</span>
                    <Button size="sm" variant="ghost" onClick={() => removeItem(index)} aria-label="Remove item" title="Remove">
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="text-right font-bold text-lg">
                Total: {formatMoney(formData.totalAmount)}
              </div>
            </div>
          )}

          <Input
            label="Notes"
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
      </Modal>

      <Modal
        isOpen={viewOpen}
        onClose={() => setViewOpen(false)}
        title={viewOrder ? `Purchase Order ${viewOrder.poNumber}` : "Purchase Order"}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Close
            </Button>
            <Button onClick={() => viewOrder && printPurchaseOrder(viewOrder)} disabled={!viewOrder || viewLoading} aria-label="Print purchase order" title="Print">
              <PrinterIcon />
            </Button>
          </>
        }
      >
        {viewLoading && (
          <div className="p-4 text-sm text-slate-600">Loading...</div>
        )}

        {!viewLoading && viewOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Supplier</div>
                <div className="font-medium">
                  {typeof viewOrder.supplier_id === 'object' ? viewOrder.supplier_id.name : '-'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Status</div>
                <div>
                  <Badge variant={getStatusBadgeVariant(viewOrder.status)}>{viewOrder.status}</Badge>
                </div>
              </div>
              <div>
                <div className="text-slate-500">Created</div>
                <div className="font-medium">{new Date(viewOrder.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-slate-500">Delivery Date</div>
                <div className="font-medium">
                  {viewOrder.deliveryDate ? new Date(viewOrder.deliveryDate).toLocaleDateString() : '-'}
                </div>
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="grid grid-cols-12 gap-2 border-b bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                <div className="col-span-6">Product</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Unit</div>
                <div className="col-span-2 text-right">Total</div>
              </div>
              <div className="divide-y">
                {viewOrder.items?.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                    <div className="col-span-6">{it.productName}</div>
                    <div className="col-span-2 text-right">{it.quantity}</div>
                    <div className="col-span-2 text-right">{formatMoney(it.unitPrice)}</div>
                    <div className="col-span-2 text-right">{formatMoney(it.totalPrice)}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-4 px-3 py-3 text-sm">
                <span className="text-slate-600">Grand Total</span>
                <span className="font-semibold">{formatMoney(viewOrder.totalAmount)}</span>
              </div>
            </div>

            {viewOrder.notes && (
              <div className="text-sm">
                <div className="text-slate-500">Notes</div>
                <div className="font-medium whitespace-pre-wrap">{viewOrder.notes}</div>
              </div>
            )}
          </div>
        )}

        {!viewLoading && !viewOrder && (
          <div className="p-4 text-sm text-slate-600">No data</div>
        )}
      </Modal>

        <Modal
          isOpen={approvalModalOpen}
          onClose={() => {
            setApprovalModalOpen(false);
            setOrderToApprove(null);
          }}
          title="Approve Purchase Order"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setApprovalModalOpen(false);
                  setOrderToApprove(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={confirmApproval} loading={approveLoadingId === orderToApprove?._id}>
                Approve Order
              </Button>
            </>
          }
        >
          {orderToApprove && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">Approve PO? This will move it into the approved procurement flow.</p>
                <p className="mt-2 text-sm text-slate-600">Use this only when the order is ready to proceed.</p>
              </div>
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">PO Number:</span>
                  <span className="font-medium">{orderToApprove.poNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Supplier:</span>
                  <span className="font-medium">
                    {orderToApprove.supplier_id && typeof orderToApprove.supplier_id === 'object'
                      ? orderToApprove.supplier_id.name
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total Amount:</span>
                  <span className="font-medium text-emerald-600">{formatMoney(orderToApprove.totalAmount)}</span>
                </div>
              </div>
            </div>
          )}
        </Modal>

        <Modal
          isOpen={cancelModalOpen}
          onClose={() => {
            setCancelModalOpen(false);
            setOrderToCancel(null);
          }}
          title="Cancel Purchase Order"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setCancelModalOpen(false);
                  setOrderToCancel(null);
                }}
              >
                Close
              </Button>
              <Button onClick={confirmCancel} loading={cancelLoadingId === orderToCancel?._id}>
                Cancel PO
              </Button>
            </>
          }
        >
          {orderToCancel && (
            <div className="space-y-4">
              <div className="rounded-lg bg-rose-50 p-4">
                <p className="text-sm font-medium text-rose-700">Cancel PO? This will remove it from the active workflow.</p>
                <p className="mt-2 text-sm text-rose-600">This action should be used only when the order is no longer needed.</p>
              </div>
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">PO Number:</span>
                  <span className="font-medium">{orderToCancel.poNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Supplier:</span>
                  <span className="font-medium">
                    {orderToCancel.supplier_id && typeof orderToCancel.supplier_id === 'object'
                      ? orderToCancel.supplier_id.name
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total Amount:</span>
                  <span className="font-medium text-rose-600">{formatMoney(orderToCancel.totalAmount)}</span>
                </div>
              </div>
            </div>
          )}
        </Modal>
    </Layout>
  );
}

