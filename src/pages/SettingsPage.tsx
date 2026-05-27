import { useEffect, useMemo, useState } from 'react';
import { Layout, PageHeader, PageContent, Card, Button, Input, PageLoader } from '../components';
import { configApi } from '../api';
import notify from '../utils/notify';
import type { TaxSetting } from '../types';
import { formatMoneyValue } from '../money';
import { useAuthStore } from '../store/auth.store';

type Numberish = number | '';

type TaxFormState = Omit<TaxSetting, 'rate'> & { rate: Numberish };

const toNumber = (v: Numberish, fallback = 0) => {
  if (v === '') return fallback;
  return Number.isFinite(v) ? v : fallback;
};

export default function SettingsPage() {
  const isSuperAdmin = useAuthStore((s) => s.user?.role?.name === 'SUPER_ADMIN');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<{
    day: string;
    lastIssued: number;
    next: number | null;
    limit: number;
    reached: boolean;
  } | null>(null);

  const [taxes, setTaxes] = useState<TaxFormState[]>([]);
  const [currency, setCurrency] = useState<{ code: string; symbol: string; position: 'BEFORE' | 'AFTER' }>({ 
    code: 'USD', 
    symbol: '$', 
    position: 'BEFORE' as const 
  });
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [invoiceHeader, setInvoiceHeader] = useState('');
  const [invoiceFooter, setInvoiceFooter] = useState('Thank you for your business!');
  const [dailyReceiptNumberLimit, setDailyReceiptNumberLimit] = useState<Numberish>(1500);
  const [expiryAlertDays, setExpiryAlertDays] = useState<Numberish>(30);
  const [serviceCharge, setServiceCharge] = useState<Numberish>(0);
  const [serviceChargeType, setServiceChargeType] = useState<'FIXED' | 'PERCENTAGE'>('PERCENTAGE');
  const [packagingCharge, setPackagingCharge] = useState<Numberish>(0);
  const [packagingChargeType, setPackagingChargeType] = useState<'FIXED' | 'PERCENTAGE'>('PERCENTAGE');

  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessLogo, setBusinessLogo] = useState('');

  const [kitchenBillPrintingEnabled, setKitchenBillPrintingEnabled] = useState(true);
  const [enableDemoLogin, setEnableDemoLogin] = useState(false);

  const [pointsPerDollar, setPointsPerDollar] = useState<Numberish>(0);
  const [pointsExpiryDays, setPointsExpiryDays] = useState<Numberish>(0);
  const [pointsMultiplierByTier, setPointsMultiplierByTier] = useState(
    {
      BASIC: 1,
      SILVER: 1,
      GOLD: 1,
      PLATINUM: 1,
    } as Record<'BASIC' | 'SILVER' | 'GOLD' | 'PLATINUM', Numberish>
  );

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await configApi.get();
      if (!data) {
        console.warn('Config API returned null/undefined');
        return;
      }
      setTaxes(
        (data.taxes || []).map((t: any) => ({
          ...t,
          rate: typeof t.rate === 'number' ? t.rate : '',
        }))
      );
      setCurrency(data.currency || { code: 'USD', symbol: '$', position: 'BEFORE' as const });
      setInvoicePrefix(data.invoiceFormat?.prefix || 'INV');
      setInvoiceHeader(data.invoiceFormat?.header || '');
      setInvoiceFooter(data.invoiceFormat?.footer || 'Thank you!');
      setDailyReceiptNumberLimit(typeof (data as any).dailyReceiptNumberLimit === 'number' ? (data as any).dailyReceiptNumberLimit : 1500);
      setExpiryAlertDays(typeof data.expiryAlertDays === 'number' ? data.expiryAlertDays : 30);
      setServiceCharge(typeof data.serviceCharge === 'number' ? data.serviceCharge : 0);
      setServiceChargeType((data.serviceChargeType as 'FIXED' | 'PERCENTAGE') || 'PERCENTAGE');
      setPackagingCharge(typeof data.packagingCharge === 'number' ? data.packagingCharge : 0);
      setPackagingChargeType((data.packagingChargeType as 'FIXED' | 'PERCENTAGE') || 'PERCENTAGE');

      setBusinessName(data.businessDetails?.name || '');
      setBusinessAddress(data.businessDetails?.address || '');
      setBusinessPhone(data.businessDetails?.phone || '');
      setBusinessEmail(data.businessDetails?.email || '');
      setBusinessLogo(data.businessDetails?.logo || data.logo || '');

      setKitchenBillPrintingEnabled(typeof data.kitchenBillPrintingEnabled === 'boolean' ? data.kitchenBillPrintingEnabled : true);
      const savedDemoLoginFlag = localStorage.getItem('enable_demo_login');
      setEnableDemoLogin(
        typeof data.enableDemoLogin === 'boolean'
          ? data.enableDemoLogin
          : savedDemoLoginFlag === 'true'
      );

      setPointsPerDollar(typeof data.pointsPerDollar === 'number' ? data.pointsPerDollar : 0);
      setPointsExpiryDays(typeof data.pointsExpiryDays === 'number' ? data.pointsExpiryDays : 0);

      const m = (data as any).pointsMultiplierByTier;
      if (m && typeof m === 'object') {
        setPointsMultiplierByTier({
          BASIC: typeof m.BASIC === 'number' ? m.BASIC : 1,
          SILVER: typeof m.SILVER === 'number' ? m.SILVER : 1,
          GOLD: typeof m.GOLD === 'number' ? m.GOLD : 1,
          PLATINUM: typeof m.PLATINUM === 'number' ? m.PLATINUM : 1,
        });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      notify.error('Failed to load settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadReceiptPreview = async () => {
    try {
      setReceiptPreviewLoading(true);
      const data = await configApi.getReceiptPreview();
      setReceiptPreview(data);
    } catch (error) {
      console.warn('Failed to load receipt preview:', error);
      setReceiptPreview(null);
    } finally {
      setReceiptPreviewLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    loadReceiptPreview();
  }, []);

  const invoiceSeed = useState(() => Date.now())[0];
  const invoicePreview = useMemo(() => {
    const prefix = (invoicePrefix || 'INV').trim() || 'INV';
    return `${prefix}-${invoiceSeed}`;
  }, [invoicePrefix]);

  const formatPreviewMoney = useMemo(() => {
    const symbol = currency.symbol || '';
    const position = currency.position || 'BEFORE';
    return (amount: number) => {
      const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
      const v = formatMoneyValue(n);
      if (!symbol) return v;
      return position === 'AFTER' ? `${v}${symbol}` : `${symbol} ${v}`;
    };
  }, [currency.symbol, currency.position]);

  const receiptPreviewComputed = useMemo(() => {
    const lastIssued = Math.max(0, Number(receiptPreview?.lastIssued ?? 0) || 0);
    const limit = Math.max(1, Math.floor(toNumber(dailyReceiptNumberLimit, receiptPreview?.limit ?? 1500)));
    const reached = lastIssued >= limit;
    return {
      day: receiptPreview?.day || '',
      lastIssued,
      limit,
      reached,
      next: reached ? null : lastIssued + 1,
    };
  }, [receiptPreview, dailyReceiptNumberLimit]);

  const receiptOrderNumberPreview = receiptPreviewComputed.next ? String(receiptPreviewComputed.next) : '—';

  const sampleSubtotal = 1200;
  const samplePackagingCharge = useMemo(() => {
    const base = sampleSubtotal;
    const rate = Math.max(0, toNumber(packagingCharge, 0));
    const v = packagingChargeType === 'PERCENTAGE' ? (base * rate) / 100 : rate;
    return Math.round(v * 100) / 100;
  }, [packagingCharge, packagingChargeType]);

  const sampleOrderType = 'TAKEAWAY';
  const showPackaging = samplePackagingCharge > 0;
  const sampleGrandTotal = sampleSubtotal + (showPackaging ? samplePackagingCharge : 0);

  const handleSave = async () => {
    try {
      setSaving(true);
      const taxesPayload: TaxSetting[] = taxes.map((t) => ({
        ...t,
        rate: toNumber(t.rate, 0),
      }));

      const pointsMultiplierByTierPayload = {
        BASIC: toNumber(pointsMultiplierByTier.BASIC, 1),
        SILVER: toNumber(pointsMultiplierByTier.SILVER, 1),
        GOLD: toNumber(pointsMultiplierByTier.GOLD, 1),
        PLATINUM: toNumber(pointsMultiplierByTier.PLATINUM, 1),
      };

      await configApi.update({
        taxes: taxesPayload,
        currency,
        logo: businessLogo || undefined,
        kitchenBillPrintingEnabled,
        dailyReceiptNumberLimit: Math.max(1, Math.floor(toNumber(dailyReceiptNumberLimit, 1500))),
        pointsPerDollar: toNumber(pointsPerDollar, 0),
        pointsExpiryDays: toNumber(pointsExpiryDays, 0),
        pointsMultiplierByTier: pointsMultiplierByTierPayload,
        businessDetails: {
          name: businessName,
          address: businessAddress,
          phone: businessPhone,
          email: businessEmail || undefined,
          logo: businessLogo || undefined,
        },
        invoiceFormat: {
          prefix: invoicePrefix,
          numberLength: 6,
          header: invoiceHeader,
          footer: invoiceFooter,
        },
        expiryAlertDays: toNumber(expiryAlertDays, 30),
        serviceCharge: toNumber(serviceCharge, 0),
        serviceChargeType,
        packagingCharge: toNumber(packagingCharge, 0),
        packagingChargeType,
        enableDemoLogin,
      });

      try {
        localStorage.setItem('enable_demo_login', String(enableDemoLogin));
        localStorage.setItem(
          'pos_print_settings',
          JSON.stringify({
            businessDetails: {
              name: businessName,
              address: businessAddress,
              phone: businessPhone,
              email: businessEmail || undefined,
              logo: businessLogo || undefined,
            },
            invoiceFormat: {
              header: invoiceHeader,
              footer: invoiceFooter,
              prefix: invoicePrefix,
            },
          })
        );
      } catch {
        // ignore localStorage failures
      }

      notify.success('Settings saved successfully');
      loadReceiptPreview();
    } catch (error: any) {
      notify.error(error?.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addTax = () => {
    setTaxes([...taxes, { name: '', rate: '', isDefault: false, type: 'EXCLUSIVE' }]);
  };

  const updateTax = (index: number, field: string, value: any) => {
    const newTaxes = [...taxes];
    (newTaxes[index] as any)[field] = value;
    setTaxes(newTaxes);
  };

  const removeTax = (index: number) => {
    setTaxes(taxes.filter((_, i) => i !== index));
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
        title="Settings"
        subtitle="Configure your POS system"
        actions={
          <Button onClick={handleSave} loading={saving}>
            Save Changes
          </Button>
        }
      />
      <PageContent>
        <div className="max-w-3xl space-y-6">
          {/* Business Details */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Business Details</h3>
            <div className="space-y-4">
              <Input
                label="Business Name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your business name"
              />
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 21s6-5.686 6-10.5A6 6 0 106 10.5C6 15.314 12 21 12 21z" />
                    <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 12.5a2 2 0 100-4 2 2 0 000 4z" />
                  </svg>
                  <span>Address</span>
                </label>
                <textarea
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Street, city, etc."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Phone"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  placeholder="+94..."
                />
                <Input
                  label="Email"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  placeholder="name@company.com"
                />
              </div>
              <Input
                label="Logo URL"
                value={businessLogo}
                onChange={(e) => setBusinessLogo(e.target.value)}
                placeholder="https://..."
                helperText="Used on printed invoice/receipt"
              />
            </div>
          </Card>

          {/* Current Invoice Preview */}
          <Card>
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Current Invoice Preview</h3>
            <p className="mb-4 text-sm text-slate-500">
              Read-only preview. This does not generate or change real invoice/receipt data.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Next Receipt/Bill Number (Today)"
                value={
                  receiptPreviewLoading
                    ? 'Loading...'
                    : receiptPreviewComputed.next
                      ? String(receiptPreviewComputed.next)
                      : 'Limit reached'
                }
                disabled
                helperText={
                  receiptPreviewLoading
                    ? undefined
                    : receiptPreviewComputed.day
                      ? `Day: ${receiptPreviewComputed.day} • Last issued: ${receiptPreviewComputed.lastIssued} • Limit: ${receiptPreviewComputed.limit}`
                      : 'Preview unavailable'
                }
              />

              <Input
                label="Invoice Number Preview"
                value={invoicePreview}
                disabled
                helperText="Preview uses prefix + timestamp-style number"
              />
            </div>

            {/* Bill preview (thermal receipt style) */}
            <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-center">
                {businessLogo ? (
                  <img
                    src={businessLogo}
                    alt="Business logo"
                    className="mx-auto mb-2 h-10 w-10 object-contain"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : null}
                {businessName ? (
                  <div className="text-sm font-semibold text-slate-900">{businessName}</div>
                ) : null}
                {businessAddress ? (
                  <div className="mt-1 text-[11px] text-slate-700 whitespace-pre-wrap">{businessAddress}</div>
                ) : null}
                {businessPhone || businessEmail ? (
                  <div className="mt-1 text-[11px] text-slate-700">
                    {[businessPhone, businessEmail].filter(Boolean).join(' | ')}
                  </div>
                ) : null}
                {invoiceHeader ? (
                  <div className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{invoiceHeader}</div>
                ) : null}
              </div>

              <div className="my-3 border-t border-dashed border-slate-900/60" />

              <div className="border-2 border-slate-900 p-3 text-center">
                <div className="text-xs font-bold tracking-wide text-slate-900">ORDER NUMBER</div>
                <div className="mt-1 text-3xl font-black text-slate-900">{receiptOrderNumberPreview}</div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-slate-900">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-700">Date</span>
                  <span className="text-right">{new Date().toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-700">Invoice</span>
                  <span className="text-right">{invoicePreview}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-700">Order Type</span>
                  <span className="text-right">{sampleOrderType}</span>
                </div>
              </div>

              <div className="my-3 border-t border-dashed border-slate-900/60" />

              <div className="text-xs">
                <div className="grid grid-cols-[1fr_56px_90px] gap-2 font-bold text-slate-900">
                  <div>ITEM</div>
                  <div className="text-right">QTY</div>
                  <div className="text-right">AMT</div>
                </div>

                <div className="mt-2">
                  <div className="grid grid-cols-[1fr_56px_90px] gap-2 text-slate-900">
                    <div>Product</div>
                    <div className="text-right">1</div>
                    <div className="text-right">{formatPreviewMoney(sampleSubtotal)}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-700">1 × {formatPreviewMoney(sampleSubtotal)}</div>
                </div>
              </div>

              <div className="my-3 border-t border-dashed border-slate-900/60" />

              <div className="text-xs text-slate-900">
                <div className="flex justify-between gap-3 py-0.5">
                  <span className="text-slate-700">Subtotal</span>
                  <span>{formatPreviewMoney(sampleSubtotal)}</span>
                </div>
                {showPackaging ? (
                  <div className="flex justify-between gap-3 py-0.5">
                    <span className="text-slate-700">Packaging Charge</span>
                    <span>{formatPreviewMoney(samplePackagingCharge)}</span>
                  </div>
                ) : null}

                <div className="mt-2 border-t-2 border-slate-900 pt-2">
                  <div className="flex justify-between gap-3 font-extrabold">
                    <span>TOTAL DUE</span>
                    <span>{formatPreviewMoney(sampleGrandTotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3">
                    <span className="text-slate-700">Paid</span>
                    <span>{formatPreviewMoney(sampleGrandTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="my-3 border-t border-dashed border-slate-900/60" />

              <div className="text-center text-xs text-slate-700 whitespace-pre-wrap">
                {invoiceFooter || 'Thank you!'}
              </div>
            </div>
          </Card>

          {/* Tax Settings */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Tax Settings</h3>
              <Button size="sm" variant="outline" onClick={addTax}>
                + Add Tax
              </Button>
            </div>
            
            {taxes.length === 0 ? (
              <p className="text-slate-500">No taxes configured</p>
            ) : (
              <div className="space-y-3">
                {taxes.map((tax, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
                    <Input
                      placeholder="Tax Name"
                      value={tax.name}
                      onChange={(e) => updateTax(index, 'name', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Rate %"
                      value={tax.rate}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          updateTax(index, 'rate', '');
                          return;
                        }
                        const n = Number(raw);
                        updateTax(index, 'rate', Number.isFinite(n) ? n : '');
                      }}
                      className="w-24"
                    />
                    <select
                      value={tax.type}
                      onChange={(e) => updateTax(index, 'type', e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                    >
                      <option value="EXCLUSIVE">Exclusive</option>
                      <option value="INCLUSIVE">Inclusive</option>
                    </select>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tax.isDefault}
                        onChange={(e) => updateTax(index, 'isDefault', e.target.checked)}
                      />
                      <span className="text-sm">Default</span>
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => removeTax(index)}>
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Service & Packaging Charges */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Service & Packaging Charges</h3>
            <div className="grid grid-cols-2 gap-6">
              {/* Service Charge */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Service Charge (Dine-in)
                </label>
                <div className="flex gap-2">
                  <select
                    value={serviceChargeType}
                    onChange={(e) => setServiceChargeType(e.target.value as 'FIXED' | 'PERCENTAGE')}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="PERCENTAGE">% Percentage</option>
                    <option value="FIXED">Rs. Fixed</option>
                  </select>
                  <Input
                    type="number"
                    value={serviceCharge}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setServiceCharge('');
                        return;
                      }
                      const n = Number(raw);
                      setServiceCharge(Number.isFinite(n) ? n : '');
                    }}
                    helperText={serviceChargeType === 'PERCENTAGE' ? 'e.g. 5 = 5% of subtotal' : 'Fixed Rs. amount'}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Packaging Charge */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Packaging Charge (Takeaway/Delivery)
                </label>
                <div className="flex gap-2">
                  <select
                    value={packagingChargeType}
                    onChange={(e) => setPackagingChargeType(e.target.value as 'FIXED' | 'PERCENTAGE')}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="PERCENTAGE">% Percentage</option>
                    <option value="FIXED">Rs. Fixed</option>
                  </select>
                  <Input
                    type="number"
                    value={packagingCharge}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setPackagingCharge('');
                        return;
                      }
                      const n = Number(raw);
                      setPackagingCharge(Number.isFinite(n) ? n : '');
                    }}
                    helperText={packagingChargeType === 'PERCENTAGE' ? 'e.g. 3 = 3% of subtotal' : 'Fixed Rs. amount'}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Loyalty Points Settings */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Loyalty Points Settings</h3>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Points Per Currency Unit"
                type="number"
                value={pointsPerDollar}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setPointsPerDollar('');
                    return;
                  }
                  const n = Number(raw);
                  setPointsPerDollar(Number.isFinite(n) ? n : '');
                }}
                helperText="Base points earned per 1 unit of currency (global)"
              />
              <Input
                label="Points Expiry Days"
                type="number"
                value={pointsExpiryDays}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setPointsExpiryDays('');
                    return;
                  }
                  const n = parseInt(raw, 10);
                  setPointsExpiryDays(Number.isFinite(n) ? n : '');
                }}
                helperText="0 = no expiry (if supported by backend)"
              />
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Tier Multipliers</p>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Basic (x)"
                  type="number"
                  value={pointsMultiplierByTier.BASIC}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setPointsMultiplierByTier((p) => ({ ...p, BASIC: '' }));
                      return;
                    }
                    const n = Number(raw);
                    setPointsMultiplierByTier((p) => ({ ...p, BASIC: Number.isFinite(n) ? Math.max(0, n) : '' }));
                  }}
                />
                <Input
                  label="Silver (x)"
                  type="number"
                  value={pointsMultiplierByTier.SILVER}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setPointsMultiplierByTier((p) => ({ ...p, SILVER: '' }));
                      return;
                    }
                    const n = Number(raw);
                    setPointsMultiplierByTier((p) => ({ ...p, SILVER: Number.isFinite(n) ? Math.max(0, n) : '' }));
                  }}
                />
                <Input
                  label="Gold (x)"
                  type="number"
                  value={pointsMultiplierByTier.GOLD}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setPointsMultiplierByTier((p) => ({ ...p, GOLD: '' }));
                      return;
                    }
                    const n = Number(raw);
                    setPointsMultiplierByTier((p) => ({ ...p, GOLD: Number.isFinite(n) ? Math.max(0, n) : '' }));
                  }}
                />
                <Input
                  label="Platinum (x)"
                  type="number"
                  value={pointsMultiplierByTier.PLATINUM}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setPointsMultiplierByTier((p) => ({ ...p, PLATINUM: '' }));
                      return;
                    }
                    const n = Number(raw);
                    setPointsMultiplierByTier((p) => ({ ...p, PLATINUM: Number.isFinite(n) ? Math.max(0, n) : '' }));
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Multiplier increases earned points based on customer tier.
              </p>
            </div>
          </Card>

          {/* Currency Settings */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Currency</h3>
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Code"
                value={currency.code}
                onChange={(e) => setCurrency({ ...currency, code: e.target.value })}
                placeholder="USD"
              />
              <Input
                label="Symbol"
                value={currency.symbol}
                onChange={(e) => setCurrency({ ...currency, symbol: e.target.value })}
                placeholder="$"
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Position</label>
                <select
                  value={currency.position}
                  onChange={(e) => setCurrency({ ...currency, position: e.target.value as 'BEFORE' | 'AFTER' })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="BEFORE">Before ($100)</option>
                  <option value="AFTER">After (100$)</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Invoice Settings */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Invoice Settings</h3>
            <div className="space-y-4">
              <Input
                label="Invoice Prefix"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                placeholder="INV"
              />

              <Input
                label="Daily Receipt/Bill Number Limit"
                type="number"
                value={dailyReceiptNumberLimit}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setDailyReceiptNumberLimit('');
                    return;
                  }
                  const n = Number(raw);
                  setDailyReceiptNumberLimit(Number.isFinite(n) ? n : '');
                }}
                helperText="Receipt/bill numbers reset daily and run from 1 up to this limit (default: 1500)"
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Invoice Header</label>
                <textarea
                  value={invoiceHeader}
                  onChange={(e) => setInvoiceHeader(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  rows={2}
                  placeholder="e.g. TAX INVOICE"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Invoice Footer</label>
                <textarea
                  value={invoiceFooter}
                  onChange={(e) => setInvoiceFooter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  rows={2}
                />
              </div>
            </div>
          </Card>

          {/* Cashier Settings */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Cashier Settings</h3>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Enable kitchen bill printing</div>
                <div className="text-sm text-slate-500">Shows a Print button in the POS Kitchen Orders view.</div>
              </div>
              <input
                type="checkbox"
                checked={kitchenBillPrintingEnabled}
                onChange={(e) => setKitchenBillPrintingEnabled(e.target.checked)}
                className="h-5 w-5"
              />
            </label>
          </Card>

          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Demo Access</h3>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Enable demo login</div>
                <div className="text-sm text-slate-500">Show the demo login button on the login page.</div>
                {!isSuperAdmin && (
                  <div className="mt-1 text-xs font-medium text-amber-600">Only super admin can change this setting.</div>
                )}
              </div>
              <input
                type="checkbox"
                checked={enableDemoLogin}
                onChange={(e) => setEnableDemoLogin(e.target.checked)}
                disabled={!isSuperAdmin}
                className="h-5 w-5 disabled:cursor-not-allowed"
              />
            </label>
          </Card>

          {/* Other Settings */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Other Settings</h3>
            <Input
              label="Expiry Alert Days"
              type="number"
              value={expiryAlertDays}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setExpiryAlertDays('');
                  return;
                }
                const n = parseInt(raw, 10);
                setExpiryAlertDays(Number.isFinite(n) ? n : '');
              }}
              helperText="Days before expiry to show warning alerts"
            />
          </Card>
        </div>
      </PageContent>
    </Layout>
  );
}
