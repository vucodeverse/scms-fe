import { useState } from "react";
import { Tab, Tabs } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import CategoriesTab from "./menu/CategoriesTab.jsx";
import ProductsTab from "./menu/ProductsTab.jsx";
import ToppingsTab from "./menu/ToppingsTab.jsx";
import RecipeTab from "./menu/RecipeTab.jsx";

// SCR-11 — Menu chuỗi. TAB-05 gồm Sản phẩm + Danh mục (FE-07/FE-08)
// và Topping dùng chung (FE-09); TAB-06 Công thức (FE-10, chỉ đọc).
export default function MenuPage() {
  const { user } = useAuth();
  const menu = buildMenu(user);
  const { query } = useRouter();
  const [activeTab, setActiveTab] = useState(() =>
    ["products", "categories", "toppings", "recipe"].includes(query.tab) ? query.tab : "products",
  );

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Menu & BOM"
        screenCode={activeTab === "recipe" ? "SCR-11 · TAB-06" : "SCR-11 · TAB-05"}
        description="Quản trị danh mục, giá bán và công thức chuẩn toàn chuỗi."
      />
      <Tabs activeKey={activeTab} onSelect={setActiveTab} id="menu-tabs">
        <Tab eventKey="products" title="Sản phẩm & giá">
          <div className="pt-3">
            <ProductsTab />
          </div>
        </Tab>
        <Tab eventKey="categories" title="Danh mục">
          <div className="pt-3">
            <CategoriesTab />
          </div>
        </Tab>
        <Tab eventKey="toppings" title="Topping">
          <div className="pt-3">
            <ToppingsTab />
          </div>
        </Tab>
        <Tab eventKey="recipe" title="Công thức (BOM)">
          <div className="pt-3">
            <RecipeTab />
          </div>
        </Tab>
      </Tabs>
    </AdminLayout>
  );
}
