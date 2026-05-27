import { useEffect, useState } from 'react';
import { Layout, PageHeader, PageContent, Card, Table, Badge, Button, Input, PageLoader } from '../components';
import { EyeIcon } from '../components/ActionIcons';
import { loyaltyApi, customersApi } from '../api';
import type { LoyaltyAccount, LoyaltyTransaction, Customer } from '../types';
import { formatMoney } from '../money';

export default function LoyaltyPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
  const [pointsHistory, setPointsHistory] = useState<LoyaltyTransaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await customersApi.getAll({ search, status: 'ACTIVE' });
      setCustomers(res.customers || []);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search]);

  const viewLoyalty = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailLoading(true);
    try {
      const [account, points] = await Promise.all([
        loyaltyApi.getAccount(customer._id),
        loyaltyApi.getPointsHistory(customer._id),
      ]);
      setLoyaltyAccount(account);
      setPointsHistory(points || []);
    } catch (error) {
      console.error('Failed to load loyalty data:', error);
      setLoyaltyAccount(null);
      setPointsHistory([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const getTierBadge = (tier: string) => {
    const variants: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
      BASIC: 'default',
      SILVER: 'info',
      GOLD: 'warning',
      PLATINUM: 'success',
    };
    return <Badge variant={variants[tier] || 'default'}>{tier}</Badge>;
  };

  const columns = [
    { key: 'customerCode', header: 'Code' },
    { key: 'name', header: 'Name' },
    { key: 'phone', header: 'Phone' },
    {
      key: 'tier',
      header: 'Tier',
      render: (item: Customer) => getTierBadge(item.tier),
    },
    {
      key: 'totalSpent',
      header: 'Total Spent',
      render: (item: Customer) => formatMoney(item.totalSpent),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: Customer) => (
        <Button size="sm" variant="ghost" onClick={() => viewLoyalty(item)} aria-label={`View loyalty for ${item.name}`} title="View Loyalty">
          <EyeIcon />
        </Button>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Loyalty Points"
        subtitle="Manage customer loyalty points"
      />
      <PageContent>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Customer List */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <Input
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Table
              columns={columns}
              data={customers}
              keyExtractor={(item) => item._id}
              loading={loading}
              emptyMessage="No customers found"
            />
          </div>

          {/* Loyalty Detail */}
          <div>
            {!selectedCustomer ? (
              <Card>
                <div className="py-8 text-center text-slate-500">
                  Select a customer to view loyalty details
                </div>
              </Card>
            ) : detailLoading ? (
              <Card>
                <PageLoader />
              </Card>
            ) : (
              <div className="space-y-4">
                <Card>
                  <h3 className="mb-3 text-lg font-semibold">{selectedCustomer.name}</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tier:</span>
                      {getTierBadge(loyaltyAccount?.tier || selectedCustomer.tier)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Points Balance:</span>
                      <span className="font-bold text-lg">{loyaltyAccount?.pointsBalance || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Lifetime Points:</span>
                      <span>{loyaltyAccount?.lifetimePoints || 0}</span>
                    </div>
                  </div>
                </Card>

                {/* Points History */}
                <Card>
                  <h4 className="mb-3 font-semibold">Points History</h4>
                  {!pointsHistory || pointsHistory.length === 0 ? (
                    <p className="text-sm text-slate-500">No points history</p>
                  ) : (
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {pointsHistory.slice(0, 10).map((txn) => (
                        <div key={txn._id} className="flex justify-between text-sm">
                          <span className={txn.type === 'EARNED' ? 'text-green-600' : 'text-red-600'}>
                            {txn.type === 'EARNED' ? '+' : '-'}{txn.points} pts
                          </span>
                          <span className="text-slate-500">
                            {new Date(txn.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        </div>
      </PageContent>
    </Layout>
  );
}
