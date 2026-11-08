import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner, Tab, Tabs } from "react-bootstrap";
import { useRouter } from "../router/HashRouter.jsx";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { formatVnd } from "../lib/format.js";
import { inventoryApi } from "../api/inventoryApi.js";
import { branchesApi } from "../api/branchesApi.js";

const PAGE_SIZE = 10;

export function fmtQty(v) {
  if (v === null || v === undefined || v === "") return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(v));
}

// SCR-14 — Kho chi nhánh (FE-18, UC28–UC33): tồn kho theo nguyên
// liệu + danh sách sắp hết hàng. Nguyên liệu không có màn hình quản
// lý vì backend chưa có API CRUD nguyên liệu (dữ liệu do seeder nạp).
export default function InventoryPage() {
  const { navigate } = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const menu = buildMenu(user);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(user?.branchId || null);
  const [tab, setTab] = useState("stock");
  const [keyword, setKeyword] = useState("");
  const [uiPage, setUiPage] = useState(1);
  const [page, setPage] = useState({ content: [], totalPages: 0, totalElements: 0 });
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.branchId) {
      branchesApi
        .list({ uiPage: 1, size: 100 })
        .then((p) => {
          setBranches(p.items || []);
          if ((p.items || []).length) setBranchId((cur) => cur || p.items[0].id);
        })
        .catch(() => {});
    }
  }, [user?.branchId]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [stock, low] = await Promise.all([
        inventoryApi.getStock({ branchId, keyword: keyword.trim() || undefined, uiPage, size: PAGE_SIZE }),
        inventoryApi.getLowStock(branchId),
      ]);
      setPage(stock);
      setLowStock(low || []);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được dữ liệu kho.");
    } finally {
      setLoading(false);
    }
  }, [branchId, keyword, uiPage]);

  useEffect(() => {
    load();
  }, [load]);

  const stockColumns = [
    { key: "ingredientCode", header: "Mã NL", render: (r) => <span className="mono">{r.ingredientCode}</span> },
    {
      key: "ingredientName",
      header: "Nguyên liệu",
      render: (r) => (
        <>
          <strong>{r.ingredientName}</strong>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.categoryName || ""}
          </div>
        </>
      ),
    },
    { key: "packUnit", header: "Đơn vị kiện", render: (r) => r.packUnit || "—" },
    { key: "currentPackUnits", header: "Tồn (kiện)", numeric: true, render: (r) => fmtQty(r.currentPackUnits) },
    {
      key: "currentQtyBase",
      header: "Tồn quy đổi",
      numeric: true,
      render: (r) => `${fmtQty(r.currentQtyBase)} ${r.baseUnit || ""}`,
    },
    {
      key: "safetyStockLevel",
      header: "Ngưỡng an toàn",
      numeric: true,
      render: (r) => `${fmtQty(r.safetyStockLevel)} ${r.baseUnit || ""}`,
    },
    { key: "unitCost", header: "Giá vốn", numeric: true, render: (r) => (r.unitCost != null ? formatVnd(r.unitCost) : "—") },
    {
      key: "lowStockFlag",
      header: "Trạng thái",
      render: (r) =>
        r.lowStockFlag ? (
          <StatusTag status="LOW" label="Sắp hết" variant="warn" />
        ) : (
          <StatusTag status="OK" label="Đủ hàng" variant="dark" />
        ),
    },
  ];

  const lowColumns = [
    { key: "ingredientCode", header: "Mã NL", render: (r) => <span className="mono">{r.ingredientCode}</span> },
    { key: "ingredientName", header: "Nguyên liệu", render: (r) => <strong>{r.ingredientName}</strong> },
    {
      key: "currentQtyBase",
      header: "Tồn hiện tại",
      numeric: true,
      render: (r) => `${fmtQty(r.currentQtyBase)} ${r.baseUnit || ""}`,
    },
    {
      key: "safetyStockLevel",
      header: "Ngưỡng an toàn",
      numeric: true,
      render: (r) => `${fmtQty(r.safetyStockLevel)} ${r.baseUnit || ""}`,
    },
    {
      key: "deficitQtyBase",
      header: "Thiếu",
      numeric: true,
      render: (r) => <strong>{`${fmtQty(r.deficitQtyBase)} ${r.baseUnit || ""}`}</strong>,
    },
  ];

  const toolbar = (
    <Form
      className="d-flex gap-2 flex-wrap align-items-center"
      onSubmit={(e) => {
        e.preventDefault();
        setUiPage(1);
        load();
      }}
    >
      <Form.Control
        placeholder="Tìm theo tên nguyên liệu…"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ maxWidth: 240 }}
      />
      <Button type="submit" variant="outline-secondary">
        Lọc
      </Button>
      <span className="text-muted ms-auto">
        {lowStock.length ? `${lowStock.length} nguyên liệu sắp hết` : "Không có nguyên liệu nào sắp hết"}
      </span>
    </Form>
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
        title="Kho"
        screenCode="SCR-14 · Kho"
        description="Tồn kho nguyên liệu của chi nhánh, cảnh báo sắp hết và các phiếu nhập / xuất / hủy, kiểm kê."
        actions={
          <div className="d-flex gap-2 flex-wrap">
            {!user?.branchId ? (
              <Form.Select
                value={branchId || ""}
                onChange={(e) => {
                  setBranchId(Number(e.target.value));
                  setUiPage(1);
                }}
                style={{ minWidth: 210 }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </Form.Select>
            ) : null}
            <Button variant="outline-primary" onClick={() => navigate("/branch/inventory/slip?type=receive")}>
              Nhập kho
            </Button>
            <Button variant="outline-primary" onClick={() => navigate("/branch/inventory/slip?type=issue")}>
              Xuất quầy bar
            </Button>
            <Button variant="outline-danger" onClick={() => navigate("/branch/inventory/slip?type=dispose")}>
              Hủy hàng
            </Button>
            <Button variant="primary" onClick={() => navigate("/branch/inventory/stocktake")}>
              Kiểm kê
            </Button>
          </div>
        }
      />

      <Tabs activeKey={tab} onSelect={(k) => setTab(k || "stock")} className="mb-3">
        <Tab eventKey="stock" title="Tồn kho">
          {loading && page.content.length === 0 ? (
            <div className="text-center py-5">
              <Spinner className="me-2" /> Đang tải…
            </div>
          ) : (
            <DataTable
              columns={stockColumns}
              rows={page.content}
              rowKey={(r) => r.inventoryId}
              loading={loading}
              emptyMessage="Chi nhánh chưa có dữ liệu tồn kho."
              toolbar={toolbar}
              pagination={{ page: uiPage, totalPages: page.totalPages, onChange: setUiPage }}
            />
          )}
        </Tab>
        <Tab eventKey="low" title={`Sắp hết hàng (${lowStock.length})`}>
          <DataTable
            columns={lowColumns}
            rows={lowStock}
            rowKey={(r) => r.ingredientId}
            loading={loading}
            emptyMessage="Không có nguyên liệu nào dưới ngưỡng an toàn."
          />
        </Tab>
      </Tabs>
    </AdminLayout>
  );
}
