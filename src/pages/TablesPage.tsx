import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import notify from '../utils/notify';
import { Layout, PageHeader, PageContent } from '../components/Layout';
import { Button, Input, Select, Modal, Badge, Card } from '../components';
import { tablesApi } from '../api/tables.api';
import type { RestaurantTable, TableFormData, TableStatus } from '../types';

const statusOptions = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'CLEANING', label: 'Cleaning' },
];

const statusColors: Record<TableStatus, 'success' | 'warning' | 'danger' | 'info'> = {
  AVAILABLE: 'success',
  OCCUPIED: 'danger',
  RESERVED: 'warning',
  MAINTENANCE: 'warning',
  CLEANING: 'info',
};

export default function TablesPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [formData, setFormData] = useState<TableFormData>({
    tableNumber: '',
    capacity: 2,
    section: '',
  });
  const [activeSection, setActiveSection] = useState<string>('__all__');

  const loadTables = async () => {
    try {
      const data = await tablesApi.getAll();
      setTables(data);
    } catch (err) {
      console.error('Failed to load tables:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  const handleCreateTable = async () => {
    try {
        if (editingTable) {
        // Update existing table
        await tablesApi.update(editingTable._id, formData);
        notify.success('Table updated successfully');
      } else {
        // Create new table
        await tablesApi.create(formData);
        notify.success('Table created successfully');
      }
      setShowModal(false);
      setFormData({ tableNumber: '', capacity: 2, section: '' });
      setEditingTable(null);
      loadTables();
    } catch (err: any) {
      notify.error(err?.response?.data?.message || 'Failed to save table');
    }
  };

  const openEditModal = (table: RestaurantTable) => {
    setEditingTable(table);
    setFormData({
      tableNumber: table.tableNumber,
      capacity: table.capacity,
      section: table.section || '',
    });
    setShowModal(true);
  };

  const openDeleteModal = (table: RestaurantTable) => {
    setSelectedTable(table);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!selectedTable) return;
    try {
      await tablesApi.delete(selectedTable._id);
      notify.success('Table deleted successfully');
      setShowDeleteModal(false);
      setSelectedTable(null);
      loadTables();
    } catch (err: any) {
      notify.error(err?.response?.data?.message || 'Failed to delete table');
    }
  };

  const handleStatusChange = async (table: RestaurantTable, status: TableStatus) => {
    try {
      await tablesApi.updateStatus(table._id, status);
      notify.success('Table status updated');
      loadTables();
    } catch (err: any) {
      notify.error(err?.response?.data?.message || 'Failed to update status');
    }
  };

  const openCloseModal = (table: RestaurantTable) => {
    // Navigate directly to POS page with this table selected
    navigate('/pos', { 
      state: { 
        tableId: table._id, 
        saleId: table.currentSale,
        action: 'pay' 
      } 
    });
  };

  // Group tables by section
  const tablesBySection = tables.reduce((acc, table) => {
    const section = table.section || 'Main';
    if (!acc[section]) acc[section] = [];
    acc[section].push(table);
    return acc;
  }, {} as Record<string, RestaurantTable[]>);

  const sectionKeys = Object.keys(tablesBySection);
  const displayedTables =
    activeSection === '__all__'
      ? tables
      : (tablesBySection[activeSection] ?? []);

  return (
    <Layout>
      <PageHeader
        title="Tables"
        actions={
          <Button onClick={() => setShowModal(true)} aria-label="Add Table" title="Add Table">
            Add Table
          </Button>
        }
      />

      <PageContent>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"></div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* ── Section Tabs ── */}
            {sectionKeys.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 w-full sm:w-fit">
                <button
                  onClick={() => setActiveSection('__all__')}
                  className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition whitespace-nowrap ${
                    activeSection === '__all__'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All
                  <span className={`ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full px-1.5 text-[10px] font-bold ${
                    activeSection === '__all__' ? 'bg-slate-900 text-white' : 'bg-slate-300 text-slate-700'
                  }`}>
                    {tables.length}
                  </span>
                </button>
                {sectionKeys.map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setActiveSection(sec)}
                    className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition whitespace-nowrap ${
                      activeSection === sec
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sec}
                    <span className={`ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full px-1.5 text-[10px] font-bold ${
                      activeSection === sec ? 'bg-slate-900 text-white' : 'bg-slate-300 text-slate-700'
                    }`}>
                      {tablesBySection[sec]?.length ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* ── Table Grid ── */}
            {displayedTables.length === 0 ? (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-12 text-center">
                <p className="text-slate-500">
                  No tables found{activeSection !== '__all__' ? ` in "${activeSection}"` : ''}. Add your first table!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {displayedTables.map((table) => (
                  <Card key={table._id} className="p-4 text-center relative">
                    {/* Edit/Delete buttons */}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        onClick={() => openEditModal(table)}
                        className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-blue-600"
                        aria-label={`Edit table ${table.tableNumber}`}
                        title="Edit table"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openDeleteModal(table)}
                        className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Delete table ${table.tableNumber}`}
                        title="Delete table"
                        disabled={table.status === 'OCCUPIED'}
                      >
                        Delete
                      </button>
                    </div>

                    <div className="mb-1 text-2xl font-bold text-slate-900">
                      {table.tableNumber}
                    </div>
                    {activeSection === '__all__' && table.section && (
                      <div className="mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        {table.section}
                      </div>
                    )}
                    <div className="mb-2 text-xs text-slate-500">Cap: {table.capacity}</div>
                    <Badge variant={statusColors[table.status || 'AVAILABLE']}>
                      {table.status || 'AVAILABLE'}
                    </Badge>
                    <div className="mt-3 space-y-2">
                      {(table.status === 'AVAILABLE' || table.status === 'CLEANING') ? (
                        <Select
                          value={table.status}
                          options={statusOptions}
                          onChange={(e) =>
                            handleStatusChange(table, e.target.value as TableStatus)
                          }
                        />
                      ) : (
                        <div className="text-xs text-slate-500 text-center py-2">
                          {table.status === 'OCCUPIED' ? 'Has active order' : 'Reserved'}
                        </div>
                      )}
                      {table.status === 'OCCUPIED' && (
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full"
                          onClick={() => openCloseModal(table)}
                          aria-label={`Close and pay table ${table.tableNumber}`}
                          title="Close & Pay"
                        >
                          Close & Pay
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </PageContent>


      {/* Create/Edit Table Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingTable(null);
          setFormData({ tableNumber: '', capacity: 2, section: '' });
        }}
        title={editingTable ? 'Edit Table' : 'Add New Table'}
      >
        <div className="space-y-4">
          <Input
            label="Table Number"
            value={formData.tableNumber}
            onChange={(e) => setFormData({ ...formData, tableNumber: e.target.value })}
            placeholder="e.g., T1, A1"
          />
          <Input
            label="Capacity"
            type="number"
            value={formData.capacity}
            onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 2 })}
            min={1}
          />
          <Input
            label="Section (Optional)"
            value={formData.section || ''}
            onChange={(e) => setFormData({ ...formData, section: e.target.value })}
            placeholder="e.g., Main, Patio, VIP"
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => {
              setShowModal(false);
              setEditingTable(null);
              setFormData({ tableNumber: '', capacity: 2, section: '' });
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreateTable} disabled={!formData.tableNumber}>
              {editingTable ? 'Update Table' : 'Create Table'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Table"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete table <strong>{selectedTable?.tableNumber}</strong>?
            {selectedTable?.status === 'OCCUPIED' && (
              <span className="block mt-2 text-red-600 font-medium">
                ⚠️ Cannot delete table with active sale. Please close the table first.
              </span>
            )}
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="danger" 
              onClick={handleDelete}
              disabled={selectedTable?.status === 'OCCUPIED'}
            >
              Delete Table
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
