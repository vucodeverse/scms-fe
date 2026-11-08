import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { branchesApi } from "../api/branchesApi.js";

const PAGE_SIZE = 20;

export const BRANCH_STATUS_LABELS = {
  OPEN: "Đang mở",
  TEMP_CLOSED: "Tạm đóng",
  MAINTENANCE: "Bảo trì",
  INACTIVE: "Ngừng hoạt động",
};
const BRANCH_STATUS_VARIANTS = {
  OPEN: "dark",
  TEMP_CLOSED: "warn",
  MAINTENANCE: "warn",
  INACTIVE: "neutral",
};

const SORT_OPTIONS = [
  { value: "createdAt:DESC", label: "Mới nhất trước" },
  { value: "code:ASC", label: "Mã A–Z" },
  { value: "name:ASC", label: "Tên A–Z" },
];

// SCR-13 — Chi nhánh & Manager (FE-05). Bố cục bám prototype
// (views-chain branches): cột Mã/chi nhánh, Địa chỉ, Liên hệ,
// Giờ mở, Số bàn, Quản lý, POS, Vận hành. Prototype còn cột doanh
// thu hôm nay — backend chưa có API đơn hàng nên không hiển thị.
// Danh sách không chứa nút thao tác (FE-13): bấm vào tên chi nhánh
// để mở trang chi tiết /chain/branches/detail?id=, nơi đặt Sửa,
// Đổi trạng thái và Xoá mềm. Thêm/Sửa là task screen edit(?id=).
export default function BranchesPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const menu = buildMenu(user);

  const [page, setPage] = useState({ items: [], totalPages: 0, totalItems: 0 });
  const [uiPage, setUiPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("createdAt:DESC");
  const [loading, setLoading] = useState(true);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    setLoading(true);
    const [sortBy, sortDir] = sort.split(":");
    try {
      const result = await branchesApi.list({
        uiPage,
        size: PAGE_SIZE,
        keyword: keyword.trim() || undefined,
        status: statusFilter || undefined,
        sortBy,
        sortDir,
      });
      setPage(result);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh sách chi nhánh.");
    } finally {
      setLoading(false);
    }
  }, [uiPage, keyword, statusFilter, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: "branch",
      header: "Mã / chi nhánh",
      render: (r) => (
        <>
          <button
            type="button"
            className="link-btn"
            style={{ fontWeight: 600, fontSize: "inherit" }}
            onClick={() => navigate(`/chain/branches/detail?id=${r.id}`)}
          >
            {r.name}
          </button>
          <div className="mono" style={{ color: "var(--muted)", fontSize: 11.5 }}>
            {r.code}
          </div>
        </>
      ),
    },
    { key: "address", header: "Địa chỉ", render: (r) => r.address || "—" },
    {
      key: "contact",
      header: "Liên hệ",
      render: (r) => (
        <>
          <div>{r.phone || "—"}</div>
          {r.taxCode ? (
            <div style={{ color: "var(--muted)", fontSize: 11.5 }}>MST: {r.taxCode}</div>
          ) : null}
        </>
      ),
    },
    {
      key: "hours",
      header: "Giờ mở",
      render: (r) => `${String(r.openingTime || "").slice(0, 5)}–${String(r.closingTime || "").slice(0, 5)}`,
    },
    { key: "tableCount", header: "Số bàn", numeric: true, render: (r) => r.tableCount ?? "—" },
    { key: "managerName", header: "Quản lý", render: (r) => r.managerName || "Chưa gán" },
    {
      key: "posOnline",
      header: "POS",
      render: (r) =>
        r.posOnline == null ? (
          <StatusTag status="INACTIVE" label="Chưa kết nối" />
        ) : r.posOnline ? (
          <StatusTag status="ACTIVE" label="Online" />
        ) : (
          <StatusTag status="UNAVAILABLE" label="Offline" />
        ),
    },
    {
      key: "status",
      header: "Vận hành",
      render: (r) => (
        <StatusTag
          status={r.status}
          label={BRANCH_STATUS_LABELS[r.status] || r.status}
          variant={BRANCH_STATUS_VARIANTS[r.status]}
        />
      ),
    },
  ];

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Chi nhánh & Manager"
        screenCode="SCR-13"
        description="Hồ sơ chi nhánh, quản lý phụ trách và trạng thái kết nối POS."
        actions={
          <Button variant="primary" onClick={() => navigate("/chain/branches/edit")}>
            Thêm chi nhánh
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={page.items}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="Chưa có chi nhánh nào."
        pagination={{ page: uiPage, totalPages: page.totalPages, onChange: setUiPage }}
        toolbar={
          <>
            <Form.Control
              type="search"
              placeholder="Tìm theo mã hoặc tên chi nhánh…"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setUiPage(1);
              }}
              style={{ maxWidth: 300 }}
            />
            <Form.Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setUiPage(1);
              }}
              style={{ maxWidth: 190 }}
              aria-label="Lọc theo trạng thái"
            >
              <option value="">Mọi trạng thái</option>
              {Object.entries(BRANCH_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Form.Select>
            <Form.Select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{ maxWidth: 170 }}
              aria-label="Sắp xếp"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Form.Select>
          </>
        }
      />
    </AdminLayout>
  );
}
