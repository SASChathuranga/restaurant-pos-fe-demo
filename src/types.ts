/**
 * Type definitions for the Restaurant POS Frontend
 */

// ==================== Authentication Types ====================

export interface LoginResponse {
  success: boolean;
  message?: string;
  token: string;
  user: User;
}

// ==================== Core Entity Types ====================

export interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  role?: any;
  permissions?: string[];
  branch_id?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Role {
  _id: string;
  name: string;
  description?: string;
  permissions: (string | Permission)[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Permission {
  _id: string;
  name: string;
  description?: string;
  [key: string]: any;
}

export interface Category {
  _id: string;
  name: string;
  description?: string;
  parentId?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
  children?: Category[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Unit {
  _id: string;
  name: string;
  shortName?: string;
  shortCode?: string;
  description?: string;
  type?: UnitType;
  baseUnit?: string;
  conversionFactor?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Product {
  _id: string;
  name: string;
  description?: string;
  category?: Category | string;
  unit?: Unit | string;
  barcode?: string;
  sku?: string;
  costPrice?: number;
  sellingPrice: number;
  price?: number; // Alias for sellingPrice
  discount?: Discount | string;
  taxPercentage?: number;
  taxRate?: number; // Alias for taxPercentage
  stock?: number;
  reorderLevel?: number;
  isActive?: boolean;
  isAvailable?: boolean;
  image?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any; // Allow additional properties
}

export interface Discount {
  _id: string;
  name: string;
  description?: string;
  type?: DiscountType; // 'PERCENTAGE' | 'FIXED'
  discountType?: DiscountType; // Alias
  value: number;
  applicableProducts?: string[]; // Product IDs
  applicableCategories?: string[]; // Category IDs
  startDate?: string;
  endDate?: string;
  validFrom?: string; // Alias
  validTo?: string; // Alias
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Coupon {
  _id: string;
  code: string;
  description?: string;
  discountType?: DiscountType;
  discountValue: number;
  value?: number; // Alias
  maxUses?: number;
  usageLimit?: number; // Alias
  usedCount?: number;
  minOrderValue?: number;
  maxDiscountValue?: number;
  maxDiscount?: number; // Alias
  validFrom?: string;
  validUntil?: string;
  validTo?: string; // Alias
  expiryDate?: string; // Alias for validUntil
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any; // Allow additional properties
}

export interface Customer {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  loyaltyPoints?: number;
  status?: CustomerStatus;
  tier?: CustomerTier;
  totalPurchases?: number;
  totalSpent?: number; // Alias
  dob?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Supplier {
  _id: string;
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  contactPerson?: string;
  taxId?: string;
  paymentTerms?: number;
  creditLimit?: number;
  outstandingBalance?: number;
  gstNumber?: string;
  panNumber?: string;
  status?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface RestaurantTable {
  _id: string;
  tableNumber: string;
  capacity: number;
  location?: string;
  section?: string;
  status?: TableStatus;
  currentOrderId?: string;
  currentSale?: Sale | string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Reservation {
  _id: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  tableId: string | RestaurantTable;
  table?: RestaurantTable | string;
  reservationDate: string;
  reservationDateTime?: string;
  reservationTime: string;
  numberOfGuests: number;
  guestCount?: number; // Alias
  specialRequests?: string;
  status?: ReservationStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Shift {
  _id: string;
  name?: string;
  startTime?: string;
  endTime?: string;
  status?: 'OPEN' | 'CLOSED' | string;
  openedAt?: string;
  closedAt?: string;
  openingCash?: number;
  expectedCash?: number;
  closingCash?: number;
  cashDifference?: number;
  cashier?: UserRef | User | string;
  description?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Batch {
  _id: string;
  batchNumber: string;
  product?: Product | string;
  product_id?: string;
  quantity: number;
  remainingQuantity?: number;
  manufacturingDate?: string;
  expiryDate: string;
  costPrice?: number;
  costPerUnit?: number;
  sellingPrice?: number;
  status?: BatchStatus;
  alertStatus?: AlertStatus;
  daysUntilExpiry?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Inventory {
  _id: string;
  product?: Product | string;
  product_id?: string;
  quantity: number;
  stockQuantity?: number; // Alias
  unit?: Unit | string;
  minStock?: number;
  lowStockThreshold?: number; // Alias
  maxStock?: number;
  lastRestockDate?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface PurchaseOrder {
  _id: string;
  poNumber: string;
  supplier?: Supplier | string;
  supplier_id?: any;
  items: PurchaseOrderItem[];
  totalAmount: number;
  taxAmount?: number;
  notes?: string;
  status?: POStatus;
  expectedDeliveryDate?: string;
  deliveredDate?: string;
  deliveryDate?: string; // Alias
  createdBy?: UserRef;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface PurchaseOrderItem {
  productId?: string;
  product_id?: string; // Alias
  product?: Product | string;
  productName?: string;
  quantity: number;
  orderedQuantity?: number;
  unitPrice: number;
  totalPrice: number;
  [key: string]: any;
}

export interface GRN {
  _id: string;
  grnNumber: string;
  purchaseOrder?: PurchaseOrder | string;
  purchaseOrder_id?: any;
  supplier?: Supplier | string;
  supplier_id?: any;
  items: GRNItem[];
  totalAmount: number;
  paidAmount?: number;
  totalTaxAmount?: number;
  paymentStatus?: string;
  qualityStatus?: QualityStatus;
  status?: string;
  notes?: string;
  grnDate: string;
  receivedDate?: string;
  receivedBy?: UserRef;
  approvedAt?: string;
  batches?: GRNBatch[];
  payments?: GRNPayment[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface GRNItem {
  productId?: string;
  product_id?: string; // Alias
  productName?: string;
  orderedQuantity?: number;
  purchasedQuantity?: number; // Alias
  receivedQuantity: number;
  unitPrice?: number;
  totalPrice?: number;
  batchNumber?: string;
  expiryDate?: string;
  qualityStatus?: QualityStatus;
  rejectionReason?: string;
  [key: string]: any;
}

export interface GRNBatch {
  batchNumber: string;
  product_id: string;
  expiryDate: string;
  quantity: number;
  costPerUnit: number;
  [key: string]: any;
}

export interface GRNPayment {
  _id?: string;
  amount: number;
  method?: GRNPaymentMethod;
  paymentMethod?: GRNPaymentMethod | string;
  paymentDate?: string;
  date?: string;
  referenceNumber?: string;
  reference?: string;
  supplier_id?: string | Supplier;
  grn_id?: string | GRN;
  notes?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface Sale {
  _id: string;
  saleNumber?: string;
  customer?: Customer | UserRef;
  customer_id?: string;
  items: SaleItem[];
  subtotal: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  grandTotal?: number; // Alias
  paymentMethod?: string;
  paymentStatus?: string;
  orderType?: OrderType;
  tableId?: RestaurantTable | string;
  status?: string;
  invoice?: Invoice;
  invoiceNumber?: string;
  notes?: string;
  saleDate: string;
  createdBy?: UserRef;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any; // Allow additional properties
}

export interface SaleItem {
  productId: string;
  productName?: string;
  product?: Product | string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxPercentage?: number;
  totalPrice: number;
  [key: string]: any;
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  sale?: Sale;
  company?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    logo?: string;
  };
  amount: number;
  issuedDate?: string;
  dueDate?: string;
  status?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface OrderReturn {
  _id: string;
  returnNumber: string;
  sale?: Sale | string;
  items: OrderReturnItem[];
  reason?: string;
  totalReturnAmount: number;
  refundMethod?: string;
  refundStatus?: string;
  notes?: string;
  returnDate: string;
  processedBy?: UserRef;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface OrderReturnItem {
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  reason?: string;
  refundAmount: number;
  costAmount?: number;
  [key: string]: any;
}

export interface SupplierReturn {
  _id: string;
  returnNumber: string;
  supplier?: Supplier | string;
  supplier_id?: any;
  grn?: GRN | string;
  grn_id?: string;
  items: SupplierReturnItem[];
  reason?: string;
  totalReturnAmount: number;
  totalAmount?: number; // Alias
  status?: ReturnStatus;
  notes?: string;
  returnDate: string;
  processedBy?: UserRef;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface SupplierReturnItem {
  productId?: string;
  product_id?: string; // Alias
  productName?: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number; // Alias
  reason?: string;
  refundAmount?: number;
  [key: string]: any;
}

export interface KitchenOrder {
  _id: string;
  orderNumber: string;
  sale?: Sale | string;
  items: KitchenOrderItem[];
  status?: KitchenOrderStatus;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  specialInstructions?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface KitchenOrderItem {
  productId: string;
  productName?: string;
  quantity: number;
  specialRequests?: string;
  status?: KitchenOrderStatus;
  [key: string]: any;
}

export interface LoyaltyAccount {
  _id: string;
  customerId: string;
  points: number;
  tier?: CustomerTier;
  totalSpent?: number;
  transactions?: LoyaltyTransaction[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface LoyaltyTransaction {
  _id?: string;
  type: 'EARNED' | 'REDEEMED' | 'ADJUSTED';
  points: number;
  reference?: string;
  description?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface InventoryAdjustment {
  _id: string;
  productId: string;
  adjustmentType: 'ADDITION' | 'DEDUCTION' | 'CORRECTION';
  quantity: number;
  reason?: string;
  notes?: string;
  adjustedBy?: UserRef;
  createdAt?: string;
  [key: string]: any;
}

// ==================== Form Data Types ====================

export interface CategoryFormData {
  name?: string;
  description?: string;
  parentId?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
  [key: string]: any;
}

export interface ProductFormData {
  name?: string;
  description?: string;
  category?: string;
  unit?: string;
  barcode?: string;
  sku?: string;
  costPrice?: number;
  cost?: number; // Alias
  sellingPrice?: number;
  price?: number; // Alias
  discount?: string;
  taxPercentage?: number;
  taxRate?: number; // Alias
  trackStock?: boolean;
  lowStockThreshold?: number;
  preparationTime?: number;
  isActive?: boolean;
  [key: string]: any;
}

export interface CustomerFormData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  tier?: CustomerTier;
  dob?: string;
  notes?: string;
  [key: string]: any;
}

export interface SupplierFormData {
  code?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  contactPerson?: string;
  taxId?: string;
  paymentTerms?: string | number;
  creditLimit?: number;
  gstNumber?: string;
  panNumber?: string;
  isActive?: boolean;
  [key: string]: any;
}

export interface DiscountFormData {
  name?: string;
  description?: string;
  type?: DiscountType;
  discountType?: DiscountType; // Alias
  value: number;
  applicableProducts?: string[];
  applicableCategories?: string[];
  startDate?: string;
  endDate?: string;
  validFrom?: string; // Alias
  validTo?: string; // Alias
  isActive?: boolean;
  [key: string]: any;
}

export interface CouponFormData {
  code: string;
  description?: string;
  discountType?: DiscountType;
  discountValue?: number;
  value?: number; // Alias
  maxUses?: number;
  usageLimit?: number; // Alias
  minOrderValue?: number;
  maxDiscountValue?: number;
  maxDiscount?: number; // Alias
  validFrom?: string;
  validUntil?: string;
  validTo?: string; // Alias
  expiryDate?: string; // Alias
  isActive?: boolean;
  [key: string]: any;
}

export interface UnitFormData {
  name: string;
  shortName?: string;
  shortCode?: string;
  description?: string;
  type?: UnitType;
  baseUnit?: string;
  conversionFactor?: number;
  isActive?: boolean;
  [key: string]: any;
}

export interface ReservationFormData {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  tableId: string;
  reservationDate?: string;
  reservationDateTime?: string; // Alias
  reservationTime?: string;
  numberOfGuests?: number;
  guestCount?: number; // Alias
  specialRequests?: string;
  notes?: string;
  status?: ReservationStatus;
  [key: string]: any;
}

export interface TableFormData {
  tableNumber: string;
  capacity: number;
  location?: string;
  section?: string;
  notes?: string;
  [key: string]: any;
}

export interface GRNFormData {
  grnNumber?: string;
  purchaseOrder?: string;
  purchaseOrder_id?: string; // Alias
  supplier?: string;
  supplier_id?: string; // Alias
  items: GRNItem[];
  totalAmount?: number;
  notes?: string;
  batches?: GRNBatch[];
  grnDate?: string;
  [key: string]: any;
}

export interface PurchaseOrderFormData {
  poNumber?: string;
  supplier?: string;
  supplier_id?: string; // Alias
  items: PurchaseOrderItem[];
  totalAmount?: number;
  notes?: string;
  expectedDeliveryDate?: string;
  deliveryDate?: string; // Alias
  [key: string]: any;
}

export interface SupplierReturnFormData {
  returnNumber?: string;
  supplier?: string;
  supplier_id?: string;
  grn?: string;
  grn_id?: string; // Alias
  items: SupplierReturnItem[];
  reason?: string;
  notes?: string;
  totalAmount?: number;
  returnDate?: string;
  [key: string]: any;
}

export interface RoleFormData {
  name: string;
  description?: string;
  permissions: string[];
  [key: string]: any;
}

// ==================== Dashboard & Report Types ====================

export interface DashboardSummary {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  averageOrderValue: number;
  todayRevenue?: number;
  todayOrders?: number;
  todayProfit?: number;
  lowStockCount?: number;
  pendingKitchenOrders?: number;
  revenueChart: RevenueChartPoint[];
  topProducts: TopProduct[];
  recentOrders: Sale[];
  expiryAlert: ExpiryDashboard;
  kitchenDashboard: KitchenDashboard;
  [key: string]: any;
}

export interface RevenueChartPoint {
  date: string;
  revenue: number;
  orders: number;
  [key: string]: any;
}

export interface TopProduct {
  productId: string;
  productName: string;
  name?: string; // Alias
  quantitySold: number;
  revenue: number;
  trend?: number;
  [key: string]: any;
}

export interface DailyReport {
  date: string;
  totalSales: number;
  totalRevenue: number;
  totalDiscount: number;
  totalTax: number;
  netRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  paymentMethods: PaymentMethodSummary[];
  [key: string]: any;
}

export interface PaymentMethodSummary {
  method: string;
  count: number;
  amount: number;
  [key: string]: any;
}

export interface PaymentSummary {
  totalPayments?: number;
  totalAmount?: number;
  methods?: PaymentMethodSummary[];
  [key: string]: any;
}

export interface ProfitReport {
  period: string;
  days: ProfitReportDay[];
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  [key: string]: any;
}

export interface ProfitReportDay {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  totalOrders?: number;
  grossSales?: number;
  discount?: number;
  netSales?: number;
  totalCost?: number;
  [key: string]: any;
}

export interface ExpiryDashboard {
  totalBatches?: number;
  normalCount?: number;
  warningCount?: number;
  criticalCount?: number;
  expiredCount?: number;
  expiredProducts?: Batch[];
  expiringSoon?: Batch[];
  totalExpiredValue?: number;
  totalExpiringValue?: number;
  [key: string]: any; // Allow additional properties from backend
}

export interface KitchenDashboard {
  pendingOrders?: KitchenOrder[];
  inProgressCount?: number;
  completedTodayCount?: number;
  averagePrepTime?: number;
  [key: string]: any;
}

export interface SaleFilters {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  from?: string;
  to?: string;
  customerId?: string;
  paymentMethod?: string;
  orderType?: OrderType;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
  [key: string]: any;
}

// ==================== Payment & Transaction Types ====================

export interface PaymentData {
  method?: string;
  paymentMethod?: string; // Alias
  amount: number;
  referenceNumber?: string;
  notes?: string;
  [key: string]: any;
}

export interface RefundData {
  reason: string;
  amount: number;
  method?: string;
  notes?: string;
  [key: string]: any;
}

export interface CloseSaleData {
  paymentMethod: string;
  paymentAmount: number;
  changeAmount?: number;
  referenceNumber?: string;
  [key: string]: any;
}

export type GRNPaymentMethod = 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'CREDIT';

export interface GRNPaymentMethodObject {
  type: GRNPaymentMethod;
  details?: string;
  [key: string]: any;
}

export interface SupplierPaymentData {
  supplierId: string;
  amount: number;
  method: string;
  referenceNumber?: string;
  notes?: string;
  [key: string]: any;
}

export interface SupplierTransaction {
  _id?: string;
  supplierId: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  transactionType?: 'PAYMENT' | 'PURCHASE' | 'CREDIT' | 'DEBIT' | string;
  reference?: string;
  description?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface WalletTransaction {
  _id?: string;
  customerId: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  description?: string;
  reference?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface WalletTopupData {
  customerId: string;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string;
  [key: string]: any;
}

export interface WalletPaymentData {
  customerId: string;
  amount: number;
  saleId?: string;
  [key: string]: any;
}

export interface RedeemPointsData {
  customerId?: string;
  customer_id?: string; // Alias
  points: number;
  sale_id?: string;
  reason?: string;
  [key: string]: any;
}

// ==================== Status/Enum Types ====================

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE' | 'CLEANING';

export type AlertStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EXPIRED';

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export type DiscountType = 'PERCENTAGE' | 'FIXED' | 'FLAT';

export type UnitType = 'WEIGHT' | 'VOLUME' | 'COUNT' | 'LENGTH';

export type KitchenOrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';

export type BatchStatus = 'ACTIVE' | 'EXPIRED' | 'EXPIRED_REMOVED' | 'BLOCKED';

export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export type CustomerTier = 'BASIC' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export type POStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'APPROVED' | 'PARTIAL' | 'PARTIAL_RECEIVED' | 'RECEIVED' | 'PENDING' | 'CANCELLED';

export type QualityStatus = 'APPROVED' | 'ACCEPTED' | 'REJECTED' | 'PARTIAL' | 'PENDING_REVIEW';

export type ReturnStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED' | 'COMPLETED' | 'CANCELLED';

// ==================== Utility Types ====================

export interface UserRef {
  _id: string;
  name: string;
  email?: string;
  [key: string]: any;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
  search?: string;
  status?: string;
  supplierId?: string;
  [key: string]: any;
}

export interface SystemConfig {
  companyName?: string;
  taxPercentage?: number;
  taxes?: TaxSetting[];
  currency?: any;
  timeZone?: string;
  dateFormat?: string;
  logo?: string;
  businessDetails?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    logo?: string;
  };
  invoiceFormat?: {
    prefix?: string;
    numberLength?: number;
    header?: string;
    footer?: string;
  };
  expiryAlertDays?: number;
  serviceCharge?: number;
  serviceChargeType?: 'FIXED' | 'PERCENTAGE';
  packagingCharge?: number;
  packagingChargeType?: 'FIXED' | 'PERCENTAGE';
  kitchenBillPrintingEnabled?: boolean;
  enableDemoLogin?: boolean;
  pointsPerDollar?: number;
  pointsExpiryDays?: number;
  dailyReceiptNumberLimit?: number;
  pointsMultiplierByTier?: Record<string, number>;
  [key: string]: any;
}

export interface TaxSetting {
  taxPercentage?: number;
  taxName?: string;
  name?: string;
  rate?: number;
  type?: 'INCLUSIVE' | 'EXCLUSIVE' | string;
  isDefault?: boolean;
  description?: string;
  [key: string]: any;
}

export interface CouponValidationResult {
  valid: boolean;
  coupon?: Coupon;
  discount?: number;
  message?: string;
  [key: string]: any;
}

export interface CreateBatchData {
  product: string;
  quantity: number;
  manufacturingDate?: string;
  expiryDate: string;
  costPrice?: number;
  sellingPrice?: number;
  [key: string]: any;
}

export interface PnlSummary {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  period: string;
  [key: string]: any;
}

// ==================== Permission Constants ====================

export const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  
  // Sales
  VIEW_SALES: 'VIEW_SALES',
  CREATE_SALE: 'CREATE_SALE',
  EDIT_SALE: 'EDIT_SALE',
  DELETE_SALE: 'DELETE_SALE',
  VIEW_INVOICES: 'VIEW_INVOICES',
  
  // Returns
  VIEW_CUSTOMER_RETURNS: 'VIEW_CUSTOMER_RETURNS',
  CREATE_CUSTOMER_RETURN: 'CREATE_CUSTOMER_RETURN',
  VIEW_SUPPLIER_RETURNS: 'VIEW_SUPPLIER_RETURNS',
  CREATE_SUPPLIER_RETURN: 'CREATE_SUPPLIER_RETURN',
  
  // Products
  VIEW_PRODUCTS: 'VIEW_PRODUCTS',
  CREATE_PRODUCT: 'CREATE_PRODUCT',
  EDIT_PRODUCT: 'EDIT_PRODUCT',
  DELETE_PRODUCT: 'DELETE_PRODUCT',
  
  // Categories
  VIEW_CATEGORIES: 'VIEW_CATEGORIES',
  CREATE_CATEGORY: 'CREATE_CATEGORY',
  EDIT_CATEGORY: 'EDIT_CATEGORY',
  DELETE_CATEGORY: 'DELETE_CATEGORY',
  
  // Inventory
  VIEW_INVENTORY: 'VIEW_INVENTORY',
  MANAGE_INVENTORY: 'MANAGE_INVENTORY',
  
  // Units
  VIEW_UNITS: 'VIEW_UNITS',
  CREATE_UNIT: 'CREATE_UNIT',
  EDIT_UNIT: 'EDIT_UNIT',
  DELETE_UNIT: 'DELETE_UNIT',
  
  // Discounts
  VIEW_DISCOUNTS: 'VIEW_DISCOUNTS',
  CREATE_DISCOUNT: 'CREATE_DISCOUNT',
  EDIT_DISCOUNT: 'EDIT_DISCOUNT',
  DELETE_DISCOUNT: 'DELETE_DISCOUNT',
  
  // Coupons
  VIEW_COUPONS: 'VIEW_COUPONS',
  CREATE_COUPON: 'CREATE_COUPON',
  EDIT_COUPON: 'EDIT_COUPON',
  DELETE_COUPON: 'DELETE_COUPON',
  
  // Customers
  VIEW_CUSTOMERS: 'VIEW_CUSTOMERS',
  CREATE_CUSTOMER: 'CREATE_CUSTOMER',
  EDIT_CUSTOMER: 'EDIT_CUSTOMER',
  DELETE_CUSTOMER: 'DELETE_CUSTOMER',
  VIEW_LOYALTY: 'VIEW_LOYALTY',
  MANAGE_LOYALTY: 'MANAGE_LOYALTY',
  
  // Suppliers
  VIEW_SUPPLIERS: 'VIEW_SUPPLIERS',
  CREATE_SUPPLIER: 'CREATE_SUPPLIER',
  EDIT_SUPPLIER: 'EDIT_SUPPLIER',
  DELETE_SUPPLIER: 'DELETE_SUPPLIER',
  
  // Purchase Orders
  VIEW_PURCHASE_ORDERS: 'VIEW_PURCHASE_ORDERS',
  CREATE_PURCHASE_ORDER: 'CREATE_PURCHASE_ORDER',
  EDIT_PURCHASE_ORDER: 'EDIT_PURCHASE_ORDER',
  DELETE_PURCHASE_ORDER: 'DELETE_PURCHASE_ORDER',
  
  // GRN
  VIEW_GRN: 'VIEW_GRN',
  CREATE_GRN: 'CREATE_GRN',
  EDIT_GRN: 'EDIT_GRN',
  DELETE_GRN: 'DELETE_GRN',
  MANAGE_GRN_PAYMENTS: 'MANAGE_GRN_PAYMENTS',
  
  // Batches
  VIEW_BATCHES: 'VIEW_BATCHES',
  CREATE_BATCH: 'CREATE_BATCH',
  EDIT_BATCH: 'EDIT_BATCH',
  DELETE_BATCH: 'DELETE_BATCH',
  
  // Tables & Reservations
  VIEW_TABLES: 'VIEW_TABLES',
  MANAGE_TABLES: 'MANAGE_TABLES',
  VIEW_RESERVATIONS: 'VIEW_RESERVATIONS',
  CREATE_RESERVATION: 'CREATE_RESERVATION',
  EDIT_RESERVATION: 'EDIT_RESERVATION',
  DELETE_RESERVATION: 'DELETE_RESERVATION',
  
  // Kitchen
  VIEW_KITCHEN: 'VIEW_KITCHEN',
  MANAGE_KITCHEN_ORDERS: 'MANAGE_KITCHEN_ORDERS',
  
  // Shifts
  VIEW_SHIFTS: 'VIEW_SHIFTS',
  MANAGE_SHIFTS: 'MANAGE_SHIFTS',
  
  // Reports
  VIEW_REPORTS: 'VIEW_REPORTS',
  VIEW_SALES_REPORTS: 'VIEW_SALES_REPORTS',
  VIEW_INVENTORY_REPORTS: 'VIEW_INVENTORY_REPORTS',
  VIEW_FINANCIAL_REPORTS: 'VIEW_FINANCIAL_REPORTS',
  EXPORT_REPORTS: 'EXPORT_REPORTS',
  
  // POS
  VIEW_POS: 'VIEW_POS',
  USE_POS: 'USE_POS',
  
  // Users & Roles
  VIEW_USERS: 'VIEW_USERS',
  CREATE_USER: 'CREATE_USER',
  EDIT_USER: 'EDIT_USER',
  DELETE_USER: 'DELETE_USER',
  VIEW_ROLES: 'VIEW_ROLES',
  CREATE_ROLE: 'CREATE_ROLE',
  EDIT_ROLE: 'EDIT_ROLE',
  DELETE_ROLE: 'DELETE_ROLE',
  
  // Settings
  VIEW_SETTINGS: 'VIEW_SETTINGS',
  EDIT_SETTINGS: 'EDIT_SETTINGS',
} as const;
