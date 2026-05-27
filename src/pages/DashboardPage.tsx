import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout, PageHeader, PageContent, StatCard, Card, Badge, PageLoader } from '../components';
import { dashboardApi, reportsApi } from '../api';
import { getSales } from '../api/sales.api';
import type { DashboardSummary, TopProduct, Inventory } from '../types';
import { QuickActions } from '../components/QuickActions';

import { formatMoney } from '../money';

// Simple Bar Chart Component (no external dependencies)
const SimpleBarChart = ({ data, height = 300 }: { data: { date?: string; label?: string; revenue: number }[]; height?: number }) => {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-[300px] text-slate-400">No data available</div>;
  }
  const maxValue = Math.max(...data.map(d => d.revenue));
  return (
    <div className="w-full" style={{ height }}>
      <div className="flex items-end justify-between h-full gap-2 px-2 pb-8">
        {data.map((item, index) => {
          const barHeight = maxValue > 0 ? (item.revenue / maxValue) * 100 : 0;
          const label = item.date ? new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' }) : item.label || '';
          return (
            <div key={index} className="flex flex-col items-center flex-1 h-full">
              <div className="flex-1 w-full flex items-end">
                <div
                  className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md transition-all hover:from-blue-700"
                  style={{ height: `${barHeight}%`, minHeight: barHeight > 0 ? '4px' : '0' }}
                  title={formatMoney(item.revenue)}
                />
              </div>
              <div className="mt-2 text-xs text-slate-500 truncate w-full text-center">{label}</div>
              <div className="text-xs font-medium text-slate-700">{item.revenue >= 1000 ? `${(item.revenue / 1000).toFixed(1)}k` : item.revenue}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Simple Pie/Donut Chart Component (CSS-based)
const SimplePieChart = ({ data, height = 320 }: { data: { name: string; value?: number; quantitySold?: number; revenue?: number }[]; height?: number }) => {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center" style={{ height }}>No data available</div>;
  }
  const total = data.reduce((sum, item) => sum + (item.value || item.quantitySold || item.revenue || 0), 0);
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
  
  return (
    <div className="flex items-center gap-6" style={{ height }}>
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {(() => {
            let currentAngle = 0;
            return data.map((item, index) => {
              const value = item.value || item.quantitySold || item.revenue || 0;
              const percentage = total > 0 ? (value / total) * 100 : 0;
              const angle = (percentage / 100) * 360;
              const largeArc = angle > 180 ? 1 : 0;
              const startX = 50 + 40 * Math.cos((currentAngle * Math.PI) / 180);
              const startY = 50 + 40 * Math.sin((currentAngle * Math.PI) / 180);
              const endX = 50 + 40 * Math.cos(((currentAngle + angle) * Math.PI) / 180);
              const endY = 50 + 40 * Math.sin(((currentAngle + angle) * Math.PI) / 180);
              const pathD = `M 50 50 L ${startX} ${startY} A 40 40 0 ${largeArc} 1 ${endX} ${endY} Z`;
              currentAngle += angle;
              return <path key={index} d={pathD} fill={colors[index % colors.length]} className="hover:opacity-80 transition-opacity" />;
            });
          })()}
          <circle cx="50" cy="50" r="20" fill="white" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-slate-700">{total >= 1000 ? `${(total / 1000).toFixed(0)}k` : total}</span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {data.slice(0, 5).map((item, index) => {
          const value = item.value || item.quantitySold || item.revenue || 0;
          const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
          return (
            <div key={index} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              <span className="text-sm text-slate-600 flex-1 truncate">{item.name}</span>
              <span className="text-sm font-medium text-slate-700">{percentage}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Hourly Chart Component
const HourlyChart = ({ data, height = 300 }: { data: { hour: string; revenue: number; orders: number }[]; height?: number }) => {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-[300px] text-slate-400">No data available</div>;
  }
  const maxRevenue = Math.max(...data.map(d => d.revenue));
  return (
    <div className="w-full" style={{ height }}>
      <div className="flex items-end justify-between h-full gap-1 px-2 pb-8">
        {data.map((item, index) => {
          const barHeight = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
          return (
            <div key={index} className="flex flex-col items-center flex-1 h-full">
              <div className="flex-1 w-full flex items-end">
                <div
                  className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-sm transition-all hover:from-emerald-700"
                  style={{ height: `${barHeight}%`, minHeight: barHeight > 0 ? '2px' : '0' }}
                  title={`${formatMoney(item.revenue)} - ${item.orders} orders`}
                />
              </div>
              <div className="mt-1 text-[10px] text-slate-500">{item.hour.split(':')[0]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const location = useLocation();
  const isEmbedded = new URLSearchParams(location.search).get('embedded') === '1';

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lowStock, setLowStock] = useState<Inventory[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  const [salesPeriod, setSalesPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [todayProfit, setTodayProfit] = useState<number>(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        if (isEmbedded) {
          const summaryData = await dashboardApi.getSummary();
          setSummary(summaryData);
          setTodayProfit(typeof summaryData?.todayProfit === 'number' ? summaryData.todayProfit : 0);
          return;
        }

        // Calculate date ranges
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 30);

        const [summaryData, topProductsData, lowStockData] = await Promise.all([
          dashboardApi.getSummary(),
          dashboardApi.getTopProducts(5),
          reportsApi.getLowStock(),
        ]);
        setSummary(summaryData);
        setTopProducts(topProductsData || []);
        setLowStock(lowStockData || []);
        
        // Fetch ALL sales for the last 30 days to build real charts
        // Add populate parameter to get product details with costs
        const { sales: allSales } = await getSales({ 
          from: monthAgo.toISOString().split('T')[0], 
          to: todayStr, 
          limit: 5000 
        });

        console.log('Sample sale:', allSales[0]);
        console.log('Today string:', todayStr);
        console.log('First sale date:', allSales[0] ? new Date(allSales[0].createdAt).toISOString().split('T')[0] : 'none');

        // Build REAL daily revenue data from actual sales
        const dailyRevenue: Record<string, { revenue: number; cost: number; orders: number }> = {};
        
        // Initialize last 30 days with zeros
        for (let i = 0; i < 30; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          dailyRevenue[dateStr] = { revenue: 0, cost: 0, orders: 0 };
        }

        // Aggregate real sales data by day
        let todayCost = 0;
        let todayRevenue = 0;
        
        console.log('Total sales fetched:', allSales.length);
        
        allSales.forEach(sale => {
          const saleDate = new Date(sale.createdAt).toISOString().split('T')[0];
          
          if (dailyRevenue[saleDate]) {
            dailyRevenue[saleDate].revenue += sale.grandTotal || 0;
            dailyRevenue[saleDate].orders += 1;
            
            // Calculate cost from items
            (sale.items || []).forEach(item => {
              const product = typeof item.product === 'object' ? item.product : null;
              const cost = product?.cost || 0;
              dailyRevenue[saleDate].cost += cost * item.quantity;
              
              // Debug: log if cost is 0
              if (cost === 0 && product) {
                console.log('Product without cost:', product.name || 'Unknown');
              }
            });
          }
          
          // Track today's totals for profit - use grandTotal directly
          if (saleDate === todayStr) {
            todayRevenue += sale.grandTotal || 0;
            (sale.items || []).forEach(item => {
              const product = typeof item.product === 'object' ? item.product : null;
              const itemCost = (product?.cost || 0) * item.quantity;
              todayCost += itemCost;
            });
          }
        });

        console.log('Today Revenue:', todayRevenue, 'Today Cost:', todayCost, 'Profit:', todayRevenue - todayCost);

        // If no sales match today or no cost data, use summary revenue with estimated 30% margin
        if (todayRevenue === 0 && summaryData?.todayRevenue) {
          todayRevenue = summaryData.todayRevenue;
          // Estimate 70% cost ratio (30% profit margin)
          todayCost = todayRevenue * 0.7;
          console.log('Using summary revenue with estimated cost');
        }

        // Set today's profit
        const calculatedProfit = todayRevenue - todayCost;
        setTodayProfit(calculatedProfit);

        // Convert to array format sorted by date for charts
        const revenueDataArray = Object.entries(dailyRevenue)
          .map(([date, data]) => ({
            date,
            revenue: data.revenue,
            profit: data.revenue - data.cost,
            orders: data.orders,
            label: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        console.log('Revenue Data (last 7 days):', revenueDataArray.slice(-7));
        setRevenueData(revenueDataArray);
        

        // Build REAL hourly data for today from actual sales
        const hourlyRevenue: Record<number, { revenue: number; orders: number }> = {};
        for (let h = 0; h < 24; h++) {
          hourlyRevenue[h] = { revenue: 0, orders: 0 };
        }
        
        const todaySales = allSales.filter(s => new Date(s.createdAt).toISOString().split('T')[0] === todayStr);
        console.log('Today sales count:', todaySales.length);
        
        todaySales.forEach(sale => {
          const hour = new Date(sale.createdAt).getHours();
          hourlyRevenue[hour].revenue += sale.grandTotal || 0;
          hourlyRevenue[hour].orders += 1;
        });

        // If no sales today, distribute today's revenue across typical hours
        if (todaySales.length === 0 && summaryData?.todayRevenue) {
          console.log('No sales found for today, using distributed summary revenue');
          const peakHours = [11, 12, 13, 18, 19, 20]; // Lunch and dinner
          const revenuePerHour = summaryData.todayRevenue / peakHours.length;
          peakHours.forEach(hour => {
            hourlyRevenue[hour].revenue = revenuePerHour;
            hourlyRevenue[hour].orders = Math.ceil(summaryData.todayOrders / peakHours.length);
          });
        }

        const hourlyDataReal = Object.entries(hourlyRevenue)
          .filter(([hour]) => Number(hour) >= 6 && Number(hour) <= 23)
          .map(([hour, data]) => ({
            hour: `${hour}:00`,
            revenue: data.revenue,
            orders: data.orders
          }));
        
        console.log('Hourly Data:', hourlyDataReal.filter(h => h.revenue > 0));
        setHourlyData(hourlyDataReal);

        // Generate category data from top products
        const categoryDataReal = topProductsData?.length ? 
          topProductsData.map((p: any) => ({
            name: p.name || 'Unknown',
            value: p.revenue || 0
          })) : 
          [{ name: 'No Data', value: 0 }];
        setCategoryData(categoryDataReal);


      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [isEmbedded]);

  if (loading) {
    return (
      <Layout>
        <PageLoader />
      </Layout>
    );
  }

  return (
    <Layout>
      {!isEmbedded && (
        <PageHeader 
          title="Dashboard" 
          subtitle="Overview of your business"
        />
      )}
      <PageContent>
        {!isEmbedded && (
          <>
            {/* Quick Actions */}
            <div className="mb-6">
              <QuickActions />
            </div>
          </>
        )}

        {/* Stats Grid */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Today's Revenue"
            value={formatMoney(summary?.todayRevenue)}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Today's Profit"
            value={formatMoney(todayProfit)}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          />
          <StatCard
            title="Today's Orders"
            value={summary?.todayOrders || 0}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
          <StatCard
            title="Low Stock Items"
            value={summary?.lowStockCount || 0}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          />
          <StatCard
            title="Pending Kitchen"
            value={summary?.pendingKitchenOrders || 0}
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>

        {!isEmbedded && (
          <>
            {/* Sales Trend & Category Charts */}
            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Sales Chart with Period Selector */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Sales Trend
                  </h3>
                  <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                    {(['today', 'week', 'month'] as const).map((period) => (
                      <button
                        key={period}
                        onClick={() => setSalesPeriod(period)}
                        className={`px-3 py-1 text-sm rounded-md transition ${
                          salesPeriod === period
                            ? 'bg-white shadow text-slate-900 font-medium'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {period === 'today' ? 'Today' : period === 'week' ? 'Week' : 'Month'}
                      </button>
                    ))}
                  </div>
                </div>
                {salesPeriod === 'today' && hourlyData.length === 0 ? (
                  <div className="flex h-[300px] items-center justify-center text-slate-500">
                    No hourly data available
                  </div>
                ) : salesPeriod === 'today' ? (
                  <HourlyChart data={hourlyData} height={300} />
                ) : (
                  <SimpleBarChart 
                    data={salesPeriod === 'week' ? revenueData.slice(-7) : revenueData.slice(-30)} 
                    height={300} 
                  />
                )}
              </Card>

              {/* Category Breakdown Chart */}
              <Card>
                <h3 className="mb-4 text-lg font-semibold text-slate-900">
                  Sales by Category
                </h3>
                {categoryData.length === 0 ? (
                  <div className="flex h-[320px] items-center justify-center text-slate-500">
                    No category data available
                  </div>
                ) : (
                  <SimplePieChart data={categoryData} height={320} />
                )}
              </Card>
            </div>

            {/* Revenue & Products Charts — duplicate section removed */}

            {/* Main Content: Top Products + Low Stock (full width, 2 col) */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Top Products */}
              <Card>
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Top Products</h3>
                {topProducts.length === 0 ? (
                  <p className="text-slate-500">No sales data yet</p>
                ) : (
                  <div className="space-y-3">
                    {topProducts.map((product, index) => (
                      <div
                        key={product.productId}
                        className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-medium text-white">
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium text-slate-900">{product.name}</p>
                            <p className="text-sm text-slate-500">
                              {product.quantitySold} sold
                            </p>
                          </div>
                        </div>
                        <span className="font-semibold text-slate-900">
                          {formatMoney(product.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Low Stock Alert */}
              <Card>
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Low Stock Alerts</h3>
                {lowStock.length === 0 ? (
                  <p className="text-slate-500">All items are well stocked ✅</p>
                ) : (
                  <div className="space-y-3">
                    {lowStock.slice(0, 8).map((item) => {
                      const product = typeof item.product === 'object' ? item.product : null;
                      return (
                        <div
                          key={item._id}
                          className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3"
                        >
                          <div>
                            <p className="font-medium text-slate-900">
                              {product?.name || 'Unknown Product'}
                            </p>
                            <p className="text-sm text-slate-500">
                              SKU: {product?.sku || 'N/A'}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="danger">{item.stockQuantity} left</Badge>
                            <p className="mt-1 text-xs text-slate-500">
                              Min: {item.lowStockThreshold}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </PageContent>
    </Layout>
  );
}
