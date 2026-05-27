import { useEffect, useState, Fragment } from 'react';
import notify from '../utils/notify';
import { Layout, PageHeader, PageContent, Button, Table, Badge, getStatusBadgeVariant, Modal, Card, Input } from '../components';
import { PlusIcon, EyeIcon, PrinterIcon, DollarIcon, EditIcon, CheckIcon, TrashIcon } from '../components/ActionIcons';
import { grnApi, purchaseOrdersApi, suppliersApi } from '../api';
import type { GRN, GRNBatch, GRNFormData, GRNItem, GRNPayment, GRNPaymentMethod, PurchaseOrder, QualityStatus, Supplier } from '../types';
import { formatMoney } from '../money';

type GRNItemForm = Omit<GRNItem, 'receivedQuantity'> & { receivedQuantity: number | '' };
type GRNFormState = Omit<GRNFormData, 'items'> & { items: GRNItemForm[] };

type Numberish = number | '';

const toNumber = (v: Numberish, fallback = 0) => {
  if (v === '') return fallback;
  return Number.isFinite(v) ? v : fallback;
};

export default function GRNPage() {
  const [grns, setGrns] = useState<GRN[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedGRN, setSelectedGRN] = useState<GRN | null>(null);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Payment modal state
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentGRN, setPaymentGRN] = useState<GRN | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<Numberish>('');
  const [paymentMethod, setPaymentMethod] = useState<GRNPaymentMethod>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paying, setPaying] = useState(false);

  // Payment history for details
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [grnPayments, setGrnPayments] = useState<GRNPayment[]>([]);
  const [paymentTotals, setPaymentTotals] = useState<{
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    paymentStatus: string;
  } | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState<string | null>(null);
  const [printLoadingId, setPrintLoadingId] = useState<string | null>(null);
  const [approveLoadingId, setApproveLoadingId] = useState<string | null>(null);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [grnToApprove, setGrnToApprove] = useState<GRN | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [grnToDelete, setGrnToDelete] = useState<GRN | null>(null);
  
  // Filter states
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [search, setSearch] = useState('');

  const [formData, setFormData] = useState<GRNFormState>({
    purchaseOrder_id: '',
    supplier_id: '',
    items: [],
    totalAmount: 0,
    notes: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [grnRes, poRes, supplierRes] = await Promise.all([
        grnApi.getAll({ 
          status: filterStatus || undefined,
          supplierId: filterSupplier || undefined 
        }),
        purchaseOrdersApi.getAll({ status: 'APPROVED' }),
        suppliersApi.getAll(),
      ]);
      
      const allGrns = grnRes.grns || [];
      const allPos = poRes.purchaseOrders || [];
      
      // Filter out POs that already have GRNs
      const grnPoIds = allGrns.map((grn: GRN) => {
        const poId = typeof grn.purchaseOrder_id === 'object' 
          ? grn.purchaseOrder_id._id 
          : grn.purchaseOrder_id;
        return poId;
      });
      
      const pendingPos = allPos.filter((po: PurchaseOrder) => !grnPoIds.includes(po._id));
      
      setGrns(allGrns);
      setPurchaseOrders(pendingPos); // Only show POs without GRNs
      setSuppliers(supplierRes.suppliers || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      notify.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterStatus, filterSupplier]);

  const filteredGrns = grns.filter((grn) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const grnNumber = grn.grnNumber.toLowerCase();
    const supplierName = (grn.supplier_id && typeof grn.supplier_id === 'object')
      ? grn.supplier_id.name.toLowerCase()
      : '';
    const status = grn.status.toLowerCase();
    const paymentStatus = (grn.paymentStatus || '').toLowerCase();
    const poNumber = (grn.purchaseOrder_id && typeof grn.purchaseOrder_id === 'object')
      ? grn.purchaseOrder_id.poNumber.toLowerCase()
      : '';

    return (
      grnNumber.includes(term) ||
      supplierName.includes(term) ||
      status.includes(term) ||
      paymentStatus.includes(term) ||
      poNumber.includes(term) ||
      String(grn.totalAmount).includes(term)
    );
  });

  const getPaidAmount = (grn: GRN) => Math.max(Number(grn.paidAmount ?? 0) || 0, 0);
  const getRemainingAmount = (grn: GRN) => Math.max((Number(grn.totalAmount || 0) || 0) - getPaidAmount(grn), 0);
  const getPaymentStatus = (grn: GRN) => {
    if (grn.paymentStatus) return grn.paymentStatus;
    const paid = getPaidAmount(grn);
    const rem = getRemainingAmount(grn);
    if (paid <= 0) return 'PENDING';
    if (rem <= 0) return 'FULLY_PAID';
    return 'PARTIALLY_PAID';
  };

  const openPaymentModal = (grn: GRN) => {
    const remaining = getRemainingAmount(grn);
    setPaymentGRN(grn);
    setPaymentAmount(remaining > 0 ? remaining : '');
    setPaymentMethod('CASH');
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!paymentGRN) return;

    const remaining = getRemainingAmount(paymentGRN);
    const amount = toNumber(paymentAmount, 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify.error('Enter a valid payment amount');
      return;
    }

    if (remaining <= 0) {
      notify.error('This GRN is already fully paid');
      return;
    }

    if (amount > remaining) {
      notify.error('Payment amount cannot exceed remaining balance');
      return;
    }

    try {
      setPaying(true);
      await grnApi.recordPayment(paymentGRN._id, {
        amount,
        paymentMethod,
        reference: paymentReference || undefined,
        notes: paymentNotes || undefined,
      });

      notify.success('Payment recorded successfully');
      setPaymentOpen(false);
      await loadData();

      // Refresh details modal (if currently viewing same GRN)
      if (selectedGRN?._id === paymentGRN._id) {
        const [fullGrn, payRes] = await Promise.all([
          grnApi.getById(paymentGRN._id),
          grnApi.getPayments(paymentGRN._id),
        ]);
        setSelectedGRN(fullGrn);
        setGrnPayments(payRes.payments || []);
        setPaymentTotals(payRes.totals || null);
      }
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to record payment');
    } finally {
      setPaying(false);
    }
  };

  const generateBatchNumber = (productName: string) => {
    const date = new Date();
    const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
    const prefix = productName.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${dateStr}-${random}`;
  };

  const openCreateModal = (po: PurchaseOrder) => {
    setEditingId(null);
    setSelectedPO(po);
    const supplierId = typeof po.supplier_id === 'object' ? po.supplier_id._id : po.supplier_id;
    

    const items: GRNItemForm[] = po.items.map((item) => ({
      product_id: item.product_id,
      productName: item.productName,
      orderedQuantity: item.quantity,
      receivedQuantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      qualityStatus: 'ACCEPTED' as QualityStatus,
      batchNumber: generateBatchNumber(item.productName),
      expiryDate: '',
    }));

    setFormData({
      purchaseOrder_id: po._id,
      supplier_id: supplierId,
      items,
      totalAmount: po.totalAmount,
      notes: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (grn: GRN) => {
    setEditingId(grn._id);
    setSelectedPO(null);
    setFormData({
      purchaseOrder_id: typeof grn.purchaseOrder_id === 'object' ? grn.purchaseOrder_id._id : grn.purchaseOrder_id,
      supplier_id: typeof grn.supplier_id === 'object' ? grn.supplier_id._id : grn.supplier_id,
      items: grn.items as GRNItemForm[],
      totalAmount: grn.totalAmount,
      notes: grn.notes || '',
    });
    setModalOpen(true);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    (newItems[index] as any)[field] = value;
    
    if (field === 'receivedQuantity') {
      const qty = value === '' ? 0 : Number(value);
      newItems[index].totalPrice = (Number.isFinite(qty) ? qty : 0) * newItems[index].unitPrice;
    }
    
    const total = newItems.reduce((sum, i) => sum + i.totalPrice, 0);
    setFormData({ ...formData, items: newItems, totalAmount: total });
  };

  const handleSave = async () => {
    // Validation
    if (!formData.items || formData.items.length === 0) {
      notify.error('Please add at least one item');
      return;
    }

    // Validate all items
    for (const item of formData.items) {
      const qty = item.receivedQuantity === '' ? NaN : Number(item.receivedQuantity);
      if (!Number.isFinite(qty) || qty < 0) {
        notify.error(`Invalid received quantity for ${item.productName}`);
        return;
      }

      if (item.qualityStatus === 'REJECTED' || item.qualityStatus === 'PARTIAL') {
        if (!item.rejectionReason || item.rejectionReason.trim() === '') {
          notify.error(`Please provide rejection reason for ${item.productName}`);
          return;
        }
      }

      // Validate batch info - if batch number provided, expiry date is required
      if (item.batchNumber && item.batchNumber.trim() !== '' && !item.expiryDate) {
        notify.error(`Please provide expiry date for batch ${item.batchNumber}`);
        return;
      }
    }

    // Build batches array from items that have batch info
    const batches: GRNBatch[] = formData.items
      .filter(item => item.batchNumber && item.batchNumber.trim() !== '' && item.expiryDate)
      .map(item => ({
        batchNumber: item.batchNumber!,
        product_id: item.product_id,
        expiryDate: item.expiryDate!,
        quantity: Number(item.receivedQuantity),
        costPerUnit: item.unitPrice,
      }));

    const payloadItems: GRNItem[] = formData.items.map((item) => {
      const receivedQuantity = Number(item.receivedQuantity);
      return {
        ...item,
        receivedQuantity,
        totalPrice: receivedQuantity * item.unitPrice,
      };
    });

    // Prepare payload with explicit batches array
    const payload: GRNFormData = {
      ...formData,
      items: payloadItems,
      totalAmount: payloadItems.reduce((sum, i) => sum + i.totalPrice, 0),
      batches,
    };

    console.log('GRN Payload:', payload);

    try {
      setSaving(true);
      if (editingId) {
        await grnApi.update(editingId, payload);
        notify.success('GRN updated successfully');
      } else {
        await grnApi.create(payload);
        notify.success('GRN created successfully');
      }
      setModalOpen(false);
      loadData();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to save GRN');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const grn = grns.find((item) => item._id === id);
    if (grn) {
      setGrnToDelete(grn);
      setDeleteModalOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (!grnToDelete) return;

    try {
      await grnApi.delete(grnToDelete._id);
      notify.success(`GRN ${grnToDelete.grnNumber} deleted successfully.`);
      setDeleteModalOpen(false);
      setGrnToDelete(null);
      loadData();
    } catch (error: any) {
      if (error?.response?.status === 404) {
        notify.error('GRN not found (already deleted)');
        loadData();
      } else {
        notify.error(error?.response?.data?.message || 'Failed to delete GRN');
      }
    }
  };

  const handleApprove = async (id: string) => {
    const grn = grns.find((item) => item._id === id);
    if (grn) {
      setGrnToApprove(grn);
      setApproveModalOpen(true);
    }
  };

  const confirmApprove = async () => {
    if (!grnToApprove) return;

    try {
      setApproveLoadingId(grnToApprove._id);
      await grnApi.approve(grnToApprove._id);
      notify.success(`GRN ${grnToApprove.grnNumber} approved successfully.`);
      setApproveModalOpen(false);
      setGrnToApprove(null);
      loadData();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to approve GRN');
    } finally {
      setApproveLoadingId(null);
    }
  };

  const handleViewDetails = async (grn: GRN) => {
    try {
      setViewLoadingId(grn._id);
      // Fetch full GRN details to ensure all data is available
      const fullGrn = await grnApi.getById(grn._id);
      setSelectedGRN(fullGrn || grn);
      setPaymentsLoading(true);
      try {
        const payRes = await grnApi.getPayments(grn._id);
        setGrnPayments(payRes.payments || []);
        setPaymentTotals(payRes.totals || null);
      } catch (err) {
        console.warn('Failed to load GRN payments:', err);
        setGrnPayments([]);
        setPaymentTotals(null);
      } finally {
        setPaymentsLoading(false);
      }
      setDetailModalOpen(true);
      notify.success('GRN details opened');
    } catch (error) {
      console.error('Failed to fetch GRN details:', error);
      // Fall back to using the list data
      setSelectedGRN(grn);
      setGrnPayments([]);
      setPaymentTotals(null);
      setDetailModalOpen(true);
      notify.success('GRN details opened (partial data)');
    } finally {
      setViewLoadingId(null);
    }
  };

  const printGRN = (grn: GRN) => {
    const escapeHtml = (text: unknown) => String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const supplierName = (grn.supplier_id && typeof grn.supplier_id === 'object') ? grn.supplier_id.name : '-';
    const poNumber = (grn.purchaseOrder_id && typeof grn.purchaseOrder_id === 'object') ? grn.purchaseOrder_id.poNumber : '-';

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>GRN - ${escapeHtml(grn.grnNumber)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
          .header { text-align: center; margin-bottom: 24px; }
          .header h1 { margin: 0; font-size: 20px; }
          .header h2 { margin: 6px 0 0; font-size: 16px; font-weight: 600; color: #334155; }
          .details { margin-bottom: 16px; font-size: 13px; }
          .details div { margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; font-size: 13px; }
          th { background: #f8fafc; font-weight: 700; color: #334155; }
          td.num, th.num { text-align: right; }
          .footer { margin-top: 28px; border-top: 2px solid #0f172a; padding-top: 16px; display: flex; justify-content: space-between; gap: 24px; }
          .sign { width: 45%; }
          .line { margin-top: 36px; border-top: 1px solid #0f172a; }
          .sign-label { margin-top: 6px; font-size: 12px; color: #475569; }
          .warn { background: #fff3cd; padding: 6px 10px; border: 1px solid #ffeeba; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>GOODS RECEIVED NOTE</h1>
          <h2>${escapeHtml(grn.grnNumber)}</h2>
        </div>

        <div class="details">
          <div><strong>Supplier:</strong> ${escapeHtml(supplierName)}</div>
          <div><strong>PO Number:</strong> ${escapeHtml(poNumber)}</div>
          <div><strong>Received Date:</strong> ${new Date(grn.receivedDate).toLocaleDateString()}</div>
          <div><strong>Status:</strong> ${escapeHtml(grn.status)}</div>
          ${grn.notes ? `<div><strong>Notes:</strong> ${escapeHtml(grn.notes)}</div>` : ''}
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th class="num">Ordered</th>
              <th class="num">Received</th>
              <th>Quality</th>
              <th>Batch#</th>
              <th>Expiry</th>
              <th class="num">Unit Price</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            ${(grn.items || []).map(item => {
              const ordered = (item as any).orderedQuantity ?? (item as any).purchasedQuantity ?? '-';
              const rejectionRow = item.rejectionReason
                ? `<tr><td colspan="8" class="warn">⚠️ Rejection Reason: ${escapeHtml(item.rejectionReason)}</td></tr>`
                : '';

              return `
                <tr>
                  <td>${escapeHtml(item.productName)}</td>
                  <td class="num">${escapeHtml(ordered)}</td>
                  <td class="num">${escapeHtml(item.receivedQuantity)}</td>
                  <td>${escapeHtml(item.qualityStatus)}</td>
                  <td>${escapeHtml(item.batchNumber || '-')}</td>
                  <td>${item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-'}</td>
                  <td class="num">${formatMoney(item.unitPrice)}</td>
                  <td class="num">${formatMoney(item.totalPrice)}</td>
                </tr>
                ${rejectionRow}
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="7" class="num">TOTAL</th>
              <th class="num">${formatMoney(grn.totalAmount)}</th>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          <div class="sign">
            <div class="line"></div>
            <div class="sign-label">Received By</div>
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

  const handlePrintGRN = async (grn: GRN) => {
    try {
      setPrintLoadingId(grn._id);
      const fullGrn = await grnApi.getById(grn._id);
      printGRN(fullGrn || grn);
    } catch (error) {
      console.error('Failed to load GRN for print:', error);
      // Fall back to current data
      printGRN(grn);
    } finally {
      setPrintLoadingId(null);
    }
  };

  const columns = [
    { key: 'grnNumber', header: 'GRN Number' },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (item: GRN) =>
        (item.supplier_id && typeof item.supplier_id === 'object') ? item.supplier_id.name : '-',
    },
    {
      key: 'po',
      header: 'PO Number',
      render: (item: GRN) =>
        (item.purchaseOrder_id && typeof item.purchaseOrder_id === 'object') ? item.purchaseOrder_id.poNumber : '-',
    },
    {
      key: 'totalAmount',
      header: 'Total',
      render: (item: GRN) => formatMoney(item.totalAmount),
    },
    {
      key: 'paidAmount',
      header: 'Paid',
      render: (item: GRN) => formatMoney(getPaidAmount(item)),
    },
    {
      key: 'remainingAmount',
      header: 'Due',
      render: (item: GRN) => formatMoney(getRemainingAmount(item)),
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      render: (item: GRN) => (
        <Badge variant={getStatusBadgeVariant(getPaymentStatus(item))}>
          {getPaymentStatus(item)}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: GRN) => (
        <Badge variant={getStatusBadgeVariant(item.status)}>{item.status}</Badge>
      ),
    },
    {
      key: 'receivedDate',
      header: 'Received',
      render: (item: GRN) => new Date(item.receivedDate).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: GRN) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => handleViewDetails(item)} loading={viewLoadingId === item._id} aria-label={`View GRN ${item.grnNumber}`} title="View">
            <EyeIcon />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handlePrintGRN(item)} loading={printLoadingId === item._id} aria-label={`Print GRN ${item.grnNumber}`} title="Print">
            <PrinterIcon />
          </Button>
          {['APPROVED', 'RECEIVED'].includes(item.status) && getRemainingAmount(item) > 0 && (
            <Button size="sm" variant="ghost" onClick={() => openPaymentModal(item)} aria-label={`Pay GRN ${item.grnNumber}`} title="Pay">
              <DollarIcon />
            </Button>
          )}
          {item.status === 'DRAFT' && (
            <>
              <Button size="sm" variant="ghost" onClick={() => openEditModal(item)} aria-label={`Edit GRN ${item.grnNumber}`} title="Edit">
                <EditIcon />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleApprove(item._id)} loading={approveLoadingId === item._id} aria-label={`Approve GRN ${item.grnNumber}`} title="Approve">
                <CheckIcon />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(item._id)} aria-label={`Delete GRN ${item.grnNumber}`} title="Delete">
                <TrashIcon />
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
        title="Goods Received Notes"
        subtitle="Receive goods against purchase orders"
      />
      <PageContent>
        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <Input
              placeholder="Search by GRN ID, supplier, PO number, or amount..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="w-48">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="APPROVED">Approved</option>
              <option value="RECEIVED">Received</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          
          <div className="w-48">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Supplier</label>
            <select
              value={filterSupplier}
              onChange={(e) => setFilterSupplier(e.target.value)}
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
        </div>
        
        {/* Pending POs to receive */}
        {purchaseOrders.length > 0 && (
          <Card className="mb-6">
            <h3 className="mb-3 font-medium text-slate-900">Approved POs Ready to Receive</h3>
            <div className="space-y-2">
              {purchaseOrders.map((po) => (
                <div key={po._id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{po.poNumber}</p>
                    <p className="text-sm text-slate-500">
                      {(po.supplier_id && typeof po.supplier_id === 'object') ? po.supplier_id.name : '-'} • 
                      {po.items?.length || 0} items • {formatMoney(po.totalAmount || 0)}
                    </p>
                  </div>
                  <Button onClick={() => openCreateModal(po)} aria-label={`Receive PO ${po.poNumber}`} title="Receive"><PlusIcon /></Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Table
          columns={columns}
          data={filteredGrns}
          keyExtractor={(item) => item._id}
          loading={loading}
          emptyMessage="No GRNs found"
        />
      </PageContent>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Receive Goods: ${selectedPO?.poNumber || ''}`}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>
              Create GRN
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-3">
            {formData.items.map((item, index) => (
              <Card key={index} padding="sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-sm text-slate-500">Ordered: {item.orderedQuantity}</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Input
                      label="Received"
                      type="number"
                      value={item.receivedQuantity}
                      onChange={(e) =>
                        updateItem(
                          index,
                          'receivedQuantity',
                          e.target.value === '' ? '' : parseInt(e.target.value, 10)
                        )
                      }
                      className="w-24"
                    />
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Quality</label>
                      <select
                        value={item.qualityStatus}
                        onChange={(e) => updateItem(index, 'qualityStatus', e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                      >
                        <option value="ACCEPTED">Accepted</option>
                        <option value="PARTIAL">Partial</option>
                        <option value="REJECTED">Rejected</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                {/* Rejection Reason - show only if REJECTED or PARTIAL */}
                {(item.qualityStatus === 'REJECTED' || item.qualityStatus === 'PARTIAL') && (
                  <div className="mt-3">
                    <Input
                      label="Rejection Reason"
                      value={item.rejectionReason || ''}
                      onChange={(e) => updateItem(index, 'rejectionReason', e.target.value)}
                      placeholder="e.g., Damaged packaging, expired, poor quality..."
                    />
                  </div>
                )}
                
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Batch Number</label>
                    <div className="flex gap-1">
                      <input
                        value={item.batchNumber || ''}
                        onChange={(e) => updateItem(index, 'batchNumber', e.target.value)}
                        placeholder="Auto-generated"
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => updateItem(index, 'batchNumber', generateBatchNumber(item.productName))}
                        className="rounded-lg bg-slate-100 px-2 py-2 text-sm hover:bg-slate-200"
                        title="Regenerate batch number"
                      >
                        🔄
                      </button>
                    </div>
                  </div>
                  <Input
                    label="Expiry Date"
                    type="date"
                    value={item.expiryDate || ''}
                    onChange={(e) => updateItem(index, 'expiryDate', e.target.value)}
                  />
                </div>
              </Card>
            ))}
          </div>

          <div className="text-right font-bold text-lg">
            Total: {formatMoney(formData.totalAmount)}
          </div>

          <Input
            label="Notes"
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
      </Modal>

      {/* GRN Detail View Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`GRN Details - ${selectedGRN?.grnNumber || ''}`}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>Close</Button>
            <Button
              variant="outline"
              onClick={() => selectedGRN && openPaymentModal(selectedGRN)}
              disabled={
                !selectedGRN ||
                !['APPROVED', 'RECEIVED'].includes(selectedGRN.status) ||
                getRemainingAmount(selectedGRN) <= 0
              }
              aria-label="Pay GRN"
              title="Pay"
            >
              <DollarIcon />
            </Button>
            <Button onClick={() => selectedGRN && handlePrintGRN(selectedGRN)} loading={selectedGRN ? printLoadingId === selectedGRN._id : false} disabled={!selectedGRN} aria-label="Print GRN" title="Print">
              <PrinterIcon />
            </Button>
          </>
        }
      >
        {selectedGRN && (
          <div className="space-y-6">
            {/* GRN Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">GRN Number</label>
                <p className="text-slate-900">{selectedGRN.grnNumber}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Status</label>
                <div className="mt-1">
                  <Badge variant={getStatusBadgeVariant(selectedGRN.status)}>
                    {selectedGRN.status}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Supplier</label>
                <p className="text-slate-900">
                  {typeof selectedGRN.supplier_id === 'object' ? selectedGRN.supplier_id.name : '-'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">PO Number</label>
                <p className="text-slate-900">
                  {typeof selectedGRN.purchaseOrder_id === 'object' ? selectedGRN.purchaseOrder_id.poNumber : '-'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Received Date</label>
                <p className="text-slate-900">{new Date(selectedGRN.receivedDate).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Total Amount</label>
                <p className="text-slate-900 font-bold">{formatMoney(selectedGRN.totalAmount)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Payment Status</label>
                <div className="mt-1">
                  <Badge variant={getStatusBadgeVariant(getPaymentStatus(selectedGRN))}>
                    {getPaymentStatus(selectedGRN)}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Paid Amount</label>
                <p className="text-slate-900 font-bold">{formatMoney(getPaidAmount(selectedGRN))}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Remaining</label>
                <p className="text-slate-900 font-bold">{formatMoney(getRemainingAmount(selectedGRN))}</p>
              </div>
            </div>

            {selectedGRN.notes && (
              <div>
                <label className="text-sm font-medium text-slate-700">Notes</label>
                <p className="text-slate-600 text-sm mt-1">{selectedGRN.notes}</p>
              </div>
            )}

            {/* Items Table */}
            <div>
              <h3 className="font-medium text-slate-900 mb-3">Items</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-left">Ordered</th>
                      <th className="px-3 py-2 text-left">Received</th>
                      <th className="px-3 py-2 text-left">Quality</th>
                      <th className="px-3 py-2 text-left">Batch#</th>
                      <th className="px-3 py-2 text-left">Expiry</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedGRN.items.map((item, idx) => (
                      <Fragment key={idx}>
                        <tr>
                          <td className="px-3 py-2">{item.productName}</td>
                          <td className="px-3 py-2">{item.orderedQuantity || item.purchasedQuantity || '-'}</td>
                          <td className="px-3 py-2">{item.receivedQuantity}</td>
                          <td className="px-3 py-2">
                            <Badge variant={
                              item.qualityStatus === 'ACCEPTED' ? 'success' :
                              item.qualityStatus === 'REJECTED' ? 'danger' : 'warning'
                            }>
                              {item.qualityStatus}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{item.batchNumber || '-'}</td>
                          <td className="px-3 py-2">
                            {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-3 py-2 text-right">{formatMoney(item.unitPrice)}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(item.totalPrice)}</td>
                        </tr>
                        {item.rejectionReason && (
                          <tr>
                            <td colSpan={8} className="px-3 py-2 bg-yellow-50 text-sm">
                              <span className="font-medium">⚠️ Rejection Reason:</span> {item.rejectionReason}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold">
                    <tr>
                      <td colSpan={7} className="px-3 py-2 text-right">TOTAL:</td>
                      <td className="px-3 py-2 text-right">{formatMoney(selectedGRN.totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Approval Info */}
            {selectedGRN.status === 'APPROVED' && selectedGRN.approvedAt && (
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-800">
                  ✅ Approved on {new Date(selectedGRN.approvedAt).toLocaleString()}
                </p>
              </div>
            )}

            {/* Payments Section */}
            <div>
              <h3 className="font-medium text-slate-900 mb-3">💳 Payments</h3>
              {paymentsLoading ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                  Loading payments...
                </div>
              ) : grnPayments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                  No payments recorded for this GRN
                </div>
              ) : (
                <div className="space-y-2">
                  {grnPayments.map((p) => (
                    <div key={p._id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{p.paymentMethod}</p>
                        <p className="text-sm text-slate-500">
                          {new Date(p.createdAt || p.date).toLocaleString()}
                          {p.reference ? ` • Ref: ${p.reference}` : ''}
                        </p>
                        {p.notes ? <p className="text-xs text-slate-500 mt-1">{p.notes}</p> : null}
                      </div>
                      <span className="font-medium text-green-700">{formatMoney(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {paymentTotals && (
                <p className="text-xs text-slate-500 mt-2">
                  Paid: {formatMoney(paymentTotals.paidAmount)} • Due: {formatMoney(paymentTotals.remainingAmount)}
                </p>
              )}
            </div>

            {/* Batches Section */}
            {selectedGRN.batches && selectedGRN.batches.length > 0 && (
              <div>
                <h3 className="font-medium text-slate-900 mb-3">📦 Batches Created</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-purple-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Batch Number</th>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-right">Quantity</th>
                        <th className="px-3 py-2 text-right">Cost/Unit</th>
                        <th className="px-3 py-2 text-left">Expiry Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedGRN.batches.map((batch, idx) => {
                        // Find product name from items
                        const item = selectedGRN.items.find(i => 
                          i.product_id === batch.product_id || 
                          (batch.batchNumber && i.batchNumber === batch.batchNumber)
                        );
                        return (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-medium text-purple-700">{batch.batchNumber}</td>
                            <td className="px-3 py-2">{item?.productName || '-'}</td>
                            <td className="px-3 py-2 text-right">{batch.quantity}</td>
                            <td className="px-3 py-2 text-right">{formatMoney(batch.costPerUnit)}</td>
                            <td className="px-3 py-2">
                              {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  💡 These batches are tracked for FIFO costing and expiry alerts
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title={`Record Payment: ${paymentGRN?.grnNumber || ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={paying}>
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              loading={paying}
              disabled={
                !paymentGRN ||
                typeof paymentAmount !== 'number' ||
                paymentAmount <= 0 ||
                paymentAmount > getRemainingAmount(paymentGRN)
              }
            >
              Record Payment
            </Button>
          </>
        }
      >
        {paymentGRN && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
              Total: {formatMoney(paymentGRN.totalAmount)} • Paid: {formatMoney(getPaidAmount(paymentGRN))} • Due:{' '}
              {formatMoney(getRemainingAmount(paymentGRN))}
            </div>

            <Input
              label="Amount"
              type="number"
              value={paymentAmount}
              onChange={(e) => {
                const raw = e.target.value;
                const max = getRemainingAmount(paymentGRN);
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
                setPaymentAmount(Math.min(n, max));
              }}
              min={0}
              max={getRemainingAmount(paymentGRN)}
              helperText={`Maximum payable: ${formatMoney(getRemainingAmount(paymentGRN))}`}
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as GRNPaymentMethod)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>

            <Input
              label="Reference (optional)"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Bank reference / Cheque number"
            />
            <Input
              label="Notes (optional)"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="Any notes about this payment"
            />
          </div>
        )}
      </Modal>

      <Modal
        isOpen={approveModalOpen}
        onClose={() => {
          setApproveModalOpen(false);
          setGrnToApprove(null);
        }}
        title="Approve GRN"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setApproveModalOpen(false);
                setGrnToApprove(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmApprove} loading={approveLoadingId === grnToApprove?._id}>
              Approve GRN
            </Button>
          </>
        }
      >
        {grnToApprove && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Approve GRN? This will update inventory and supplier balance.</p>
              <p className="mt-2 text-sm text-slate-600">Use this only when the received goods have been verified.</p>
            </div>
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">GRN Number:</span>
                <span className="font-medium">{grnToApprove.grnNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Supplier:</span>
                <span className="font-medium">
                  {grnToApprove.supplier_id && typeof grnToApprove.supplier_id === 'object'
                    ? grnToApprove.supplier_id.name
                    : '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total Amount:</span>
                <span className="font-medium text-emerald-600">{formatMoney(grnToApprove.totalAmount)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setGrnToDelete(null);
        }}
        title="Delete GRN"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteModalOpen(false);
                setGrnToDelete(null);
              }}
            >
              Close
            </Button>
            <Button onClick={confirmDelete} loading={grnToDelete ? false : false}>
              Delete GRN
            </Button>
          </>
        }
      >
        {grnToDelete && (
          <div className="space-y-4">
            <div className="rounded-lg bg-rose-50 p-4">
              <p className="text-sm font-medium text-rose-700">Delete GRN? This cannot be undone.</p>
              <p className="mt-2 text-sm text-rose-600">This will permanently remove the GRN from the system.</p>
            </div>
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">GRN Number:</span>
                <span className="font-medium">{grnToDelete.grnNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Supplier:</span>
                <span className="font-medium">
                  {grnToDelete.supplier_id && typeof grnToDelete.supplier_id === 'object'
                    ? grnToDelete.supplier_id.name
                    : '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total Amount:</span>
                <span className="font-medium text-rose-600">{formatMoney(grnToDelete.totalAmount)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
