import React, { useState, useEffect, useMemo } from 'react';
import { Layout, PageHeader, PageContent, Button, ConfirmDialog } from '../components';
import Table from '../components/Table';
import Modal from '../components/Modal';
import { rolesApi } from '../api';
import type { Role, Permission } from '../types';
import { useAuthStore } from '../store/auth.store';

const RolesPage: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: [] as string[],
  });
  
  const { user } = useAuthStore();

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await rolesApi.getAll();
      setRoles(data);
    } catch (error) {
      console.error('Failed to load roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async () => {
    try {
      const data = await rolesApi.getPermissions();
      setPermissions(data);
    } catch (error) {
      console.error('Failed to load permissions:', error);
    }
  };

  useEffect(() => {
    loadRoles();
    loadPermissions();
  }, []);

  const handleOpenModal = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      const permissionIds = Array.isArray(role.permissions)
        ? role.permissions.map(p => typeof p === 'string' ? p : p._id)
        : [];
      setFormData({
        name: role.name,
        description: role.description || '',
        permissions: permissionIds,
      });
    } else {
      setEditingRole(null);
      setFormData({ name: '', description: '', permissions: [] });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingRole(null);
    setFormData({ name: '', description: '', permissions: [] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await rolesApi.update(editingRole._id, formData);
      } else {
        await rolesApi.create(formData);
      }
      await loadRoles();
      handleCloseModal();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save role');
    }
  };

  const requestDelete = (role: Role) => {
    setDeletingRole(role);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingRole?._id) return;
    try {
      setDeleting(true);
      await rolesApi.delete(deletingRole._id);
      await loadRoles();
      setDeleteConfirmOpen(false);
      setDeletingRole(null);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete role');
    } finally {
      setDeleting(false);
    }
  };

  const togglePermission = (permissionId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId]
    }));
  };

  // Filter permissions based on current user's permissions
  const allowedPermissions = useMemo(() => {
    if (!user) return [];
    // Super admin can assign all permissions
    const visiblePermissions = permissions.filter(
      (perm) => perm.name !== 'VIEW_SUPPLIER_RETURNS'
    );

    if (user.role?.name === 'SUPER_ADMIN') return visiblePermissions;
    
    // Other users can only assign permissions they have
    return visiblePermissions.filter(perm => 
      user.permissions?.includes(perm.name) || false
    );
  }, [permissions, user]);

  const toggleAllPermissions = () => {
    if (formData.permissions.length === allowedPermissions.length) {
      setFormData(prev => ({ ...prev, permissions: [] }));
    } else {
      setFormData(prev => ({ 
        ...prev, 
        permissions: allowedPermissions.map(p => p._id) 
      }));
    }
  };

  // Group permissions by category
  const groupedPermissions = allowedPermissions.reduce((acc, perm) => {
    const category = perm.name.split('_').slice(1).join('_') || 'OTHER';
    if (!acc[category]) acc[category] = [];
    acc[category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const columns = [
    { key: 'name', header: 'Role Name' },
    { key: 'description', header: 'Description' },
    { 
      key: 'permissions', 
      header: 'Permissions', 
      render: (role: Role) => {
        const count = Array.isArray(role.permissions) ? role.permissions.length : 0;
        return `${count} permission(s)`;
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (role: Role) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => handleOpenModal(role)} aria-label={`Edit ${role.name}`} title="Edit">Edit</Button>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => requestDelete(role)}
            disabled={role.name === 'SUPER_ADMIN' || role.name === 'ADMIN'}
            aria-label={`Delete ${role.name}`}
            title="Delete"
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Role Management"
        subtitle="Manage roles and assign permissions"
        actions={
          <Button onClick={() => handleOpenModal()} aria-label="Create Role" title="Create Role">Create Role</Button>
        }
      />
      
      <PageContent>
        <Table
          columns={columns}
          data={roles}
          keyExtractor={(role) => role._id}
          loading={loading}
          emptyMessage="No roles found"
        />

        <Modal
          isOpen={showModal}
          onClose={handleCloseModal}
          title={editingRole ? 'Edit Role' : 'Create Role'}
        >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Role Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
              placeholder="e.g., MANAGER"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border rounded px-3 py-2"
              rows={2}
              placeholder="Optional description"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Permissions</label>
              <button
                type="button"
                onClick={toggleAllPermissions}
                className="text-sm text-blue-500 hover:text-blue-700"
              >
                {formData.permissions.length === allowedPermissions.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            
            <div className="border rounded p-4 max-h-96 overflow-y-auto">
              {allowedPermissions.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  You don't have permissions to assign to roles
                </p>
              ) : (
                Object.entries(groupedPermissions).map(([category, perms]) => (
                <div key={category} className="mb-4">
                  <h4 className="font-semibold text-sm text-gray-700 mb-2">
                    {category.replace(/_/g, ' ')}
                  </h4>
                  <div className="grid grid-cols-1 gap-2 ml-4">
                    {perms.map(perm => (
                      <label key={perm._id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.permissions.includes(perm._id)}
                          onChange={() => togglePermission(perm._id)}
                          className="rounded"
                        />
                        <span className="text-sm">
                          {perm.name}
                          {perm.description && (
                            <span className="text-gray-500 ml-2">- {perm.description}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )))}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Selected: {formData.permissions.length} / {allowedPermissions.length}
              {user?.role?.name !== 'SUPER_ADMIN' && allowedPermissions.length < permissions.length && (
                <span className="ml-2 text-xs text-amber-600">
                  (Showing only permissions you can assign)
                </span>
              )}
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {editingRole ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (deleting) return;
          setDeleteConfirmOpen(false);
          setDeletingRole(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Role"
        message={`Delete ${deletingRole?.name || 'this role'}? This action permanently removes the role record.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
      />
    </PageContent>
  </Layout>
);
};

export default RolesPage;
