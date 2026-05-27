import { useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import LoginPage from "./pages/LoginPage";
import PosPage from "./pages/PosPage";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import CategoriesPage from "./pages/CategoriesPage";
import InventoryPage from "./pages/InventoryPage";
import SuppliersPage from "./pages/SuppliersPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import GRNPage from "./pages/GRNPage";
import GRNPaymentsPage from "./pages/GRNPaymentsPage";
import BatchesPage from "./pages/BatchesPage";
import CustomersPage from "./pages/CustomersPage";
import ReturnsPage from "./pages/ReturnsPage";
import ComprehensiveReportsPage from "./pages/ComprehensiveReportsPage";
import SettingsPage from "./pages/SettingsPage";
import UnitsPage from "./pages/UnitsPage";
import LoyaltyPage from "./pages/LoyaltyPage";
import TablesPage from "./pages/TablesPage";
import KitchenPage from "./pages/KitchenPage";
import ReservationsPage from "./pages/ReservationsPage";
import ShiftsPage from "./pages/ShiftsPage";
import CouponsPage from "./pages/CouponsPage";
import DiscountsPage from "./pages/DiscountsPage";
import RolesPage from "./pages/RolesPage";
import UsersPage from "./pages/UsersPage";
import SalesPage from "./pages/SalesPage";
import { useAuthStore } from "./store/auth.store";
import { authApi } from "./api";

const getJwtExpiryMs = (token: string): number | null => {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;

    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (base64.length % 4)) % 4);
    const json = window.atob(base64 + pad);
    const payload = JSON.parse(json);

    const exp = payload?.exp;
    if (typeof exp !== "number") return null;

    return exp * 1000;
  } catch {
    return null;
  }
};

export default function App() {
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const setUser = useAuthStore((s) => s.setUser);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;

    (async () => {
      try {
        const me = await authApi.getMe();
        if (!cancelled) setUser(me);
      } catch (err) {
        // 401 is handled centrally in the axios interceptor; other errors can be ignored here.
        console.warn("Failed to refresh user:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, setUser]);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!token) return;

    const expMs = getJwtExpiryMs(token);
    if (!expMs) return;

    const remainingMs = expMs - Date.now();

    if (remainingMs <= 0) {
      logout();
      if (window.location.pathname !== "/") window.location.assign("/");
      return;
    }

    timerRef.current = window.setTimeout(() => {
      logout();
      if (window.location.pathname !== "/") window.location.assign("/");
    }, remainingMs);
  }, [token, logout]);

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="/grn" element={<GRNPage />} />
        <Route path="/grn-payments" element={<GRNPaymentsPage />} />
        <Route path="/batches" element={<BatchesPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/loyalty" element={<LoyaltyPage />} />
        <Route path="/coupons" element={<CouponsPage />} />
        <Route path="/discounts" element={<DiscountsPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/reports" element={<ComprehensiveReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/units" element={<UnitsPage />} />
        <Route path="/tables" element={<TablesPage />} />
        <Route path="/kitchen" element={<KitchenPage />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/shifts" element={<ShiftsPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/users" element={<UsersPage />} />
      </Routes>
    </BrowserRouter>
  );
}