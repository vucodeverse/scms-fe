import { useState } from "react";
import { Button, Tab, Tabs } from "react-bootstrap";
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
import IngredientsTab from "./menu/IngredientsTab.jsx";

// SCR-11 — Menu chuỗi & Master Data. Gồm Sản phẩm + Danh mục (FE-07/FE-08),
// Topping dùng chung (FE-09), Công thức BOM (FE-10) và Nguyên vật liệu.
export default function MenuPage() {
  const { user } = useAuth();
  const menu = buildMenu(user);
  const { query, navigate } = useRouter();
  const [activeTab, setActiveTab] = useState(() =>
    ["products", "categories", "toppings", "recipe", "ingredients"].includes(query.tab) ? query.tab : "products",
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
        screenCode={activeTab === "recipe" ? "SCR-11 · TAB-06" : activeTab === "ingredients" ? "SCR-11 · TAB-07" : "SCR-11 · TAB-05"}
        description="Quản trị danh mục, giá bán, công thức và nguyên vật liệu chuẩn toàn chuỗi."
        actions={
          user?.role === "COO" ? (
            <Button variant="primary" onClick={() => navigate("/chain/menu/sync")}>
              Đồng bộ xuống chi nhánh
            </Button>
          ) : null
        }
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
        <Tab eventKey="ingredients" title="Nguyên vật liệu">
          <div className="pt-3">
            <IngredientsTab />
          </div>
        </Tab>
      </Tabs>
    </AdminLayout>
  );
}
