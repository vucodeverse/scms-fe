import { useEffect } from "react";
import { Spinner } from "react-bootstrap";
import { HashRouter, Routes, useRouter } from "./router/HashRouter.jsx";
import { ToastProvider } from "./components/ToastContext.jsx";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import { RequireAuth, RequireRole } from "./auth/guards.jsx";
import { landingPath } from "./auth/landing.js";
import LoginPage from "./pages/LoginPage.jsx";
import RoleHomePage from "./pages/RoleHomePage.jsx";
import MenuPage from "./pages/MenuPage.jsx";
import ProductEditPage from "./pages/menu/ProductEditPage.jsx";
import ProductDetailPage from "./pages/menu/ProductDetailPage.jsx";
import CategoryDetailPage from "./pages/menu/CategoryDetailPage.jsx";
import CategoryEditPage from "./pages/menu/CategoryEditPage.jsx";
import ToppingDetailPage from "./pages/menu/ToppingDetailPage.jsx";
import ToppingEditPage from "./pages/menu/ToppingEditPage.jsx";
import KioskPage from "./pages/KioskPage.jsx";
import RolesPage from "./pages/RolesPage.jsx";
import SepaySettingsPage from "./pages/SepaySettingsPage.jsx";
import PosPage from "./pages/PosPage.jsx";
import InventoryPage from "./pages/InventoryPage.jsx";
import StockSlipPage from "./pages/StockSlipPage.jsx";
import StocktakePage from "./pages/StocktakePage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import OrderDetailPage from "./pages/OrderDetailPage.jsx";
import EmployeesPage from "./pages/EmployeesPage.jsx";
import EmployeeEditPage from "./pages/EmployeeEditPage.jsx";
import BranchesPage from "./pages/BranchesPage.jsx";
import BranchEditPage from "./pages/BranchEditPage.jsx";
import BranchDetailPage from "./pages/BranchDetailPage.jsx";
import VouchersPage from "./pages/VouchersPage.jsx";
import VoucherDetailPage from "./pages/VoucherDetailPage.jsx";
import VoucherEditPage from "./pages/VoucherEditPage.jsx";
import {
  ShowcaseAdminPage,
  ShowcaseAuthPage,
  ShowcaseKioskPage,
  ShowcaseTaskPage,
} from "./showcase/ShowcasePage.jsx";
import SessionShowcasePage from "./showcase/SessionShowcasePage.jsx";

// Điểm vào "/": đã đăng nhập -> trang đích theo vai trò (SCR-03);
// chưa đăng nhập -> SCR-01 Đăng nhập.
function RootDispatch() {
  const { status, user } = useAuth();
  const { navigate } = useRouter();

  useEffect(() => {
    if (status === "authenticated" && user) navigate(landingPath({ user }));
    else if (status === "anonymous") navigate("/login");
  }, [status, user, navigate]);

  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "60vh" }}>
      <Spinner className="me-2" /> Đang tải…
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes
            routes={[
              { pattern: "/", render: () => <RootDispatch /> },
              { pattern: "/login", render: () => <LoginPage /> },
              { pattern: "/kiosk", render: () => <KioskPage /> },
              {
                pattern: "/chain/overview",
                render: () => (
                  <RequireAuth>
                    <RoleHomePage title="Tổng quan chuỗi" screenCode="SCR-10" />
                  </RequireAuth>
                ),
              },
              {
                pattern: "/branch/overview",
                render: () => (
                  <RequireAuth>
                    <RoleHomePage title="Tổng quan chi nhánh" screenCode="SCR-07" />
                  </RequireAuth>
                ),
              },
              {
                pattern: "/pos",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO", "BRANCH_MANAGER", "CASHIER"]}>
                      <PosPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/branch/inventory/slip",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO", "BRANCH_MANAGER"]}>
                      <StockSlipPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/branch/inventory/stocktake",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO", "BRANCH_MANAGER"]}>
                      <StocktakePage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/branch/inventory",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO", "BRANCH_MANAGER"]}>
                      <InventoryPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/branch/orders/detail",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO", "BRANCH_MANAGER", "CASHIER"]}>
                      <OrderDetailPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/branch/orders",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO", "BRANCH_MANAGER", "CASHIER"]}>
                      <OrdersPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/menu",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <MenuPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/menu/detail",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <ProductDetailPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/menu/category-detail",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <CategoryDetailPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/menu/category-edit",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <CategoryEditPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/menu/topping-detail",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <ToppingDetailPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/menu/topping-edit",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <ToppingEditPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/menu/edit",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <ProductEditPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/branches",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <BranchesPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/branches/detail",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <BranchDetailPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/branches/edit",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <BranchEditPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/branch/employees",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO", "BRANCH_MANAGER"]}>
                      <EmployeesPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/branch/employees/edit",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO", "BRANCH_MANAGER"]}>
                      <EmployeeEditPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/settings/sepay",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <SepaySettingsPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/settings/roles",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <RolesPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/vouchers",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <VouchersPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/vouchers/detail",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <VoucherDetailPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              {
                pattern: "/chain/vouchers/edit",
                render: () => (
                  <RequireAuth>
                    <RequireRole roles={["COO"]}>
                      <VoucherEditPage />
                    </RequireRole>
                  </RequireAuth>
                ),
              },
              { pattern: "/_showcase", render: () => <ShowcaseAdminPage /> },
              { pattern: "/_showcase/session", render: () => <SessionShowcasePage /> },
              { pattern: "/_showcase/auth", render: () => <ShowcaseAuthPage /> },
              { pattern: "/_showcase/kiosk", render: () => <ShowcaseKioskPage /> },
              { pattern: "/_showcase/task", render: () => <ShowcaseTaskPage /> },
            ]}
            fallback={<RootDispatch />}
          />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}
