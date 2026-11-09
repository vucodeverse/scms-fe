import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import { useRouter } from "../router/HashRouter.jsx";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusTag from "../components/StatusTag.jsx";
import UnassignedManagerNotice from "../components/UnassignedManagerNotice.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { isUnassignedBranchManager, roleLabel } from "../auth/landing.js";
import { buildMenu, buildPosMenu } from "../config/menu.js";
import { formatVnd, formatDateTime } from "../lib/format.js";
import { ordersApi } from "../api/ordersApi.js";
import { branchesApi } from "../api/branchesApi.js";
import { shiftsApi } from "../api/shiftsApi.js";

export const ORDER_STATUS_META = {
  PENDING: { label: "Chờ thanh toán", variant: "warn" },
  PAID: { label: "Đã thanh toán", variant: "dark" },
  PARTIALLY_REFUNDED: { label: "Hoàn một phần", variant: "warn" },
  REFUNDED: { label: "Đã hoàn tiền", variant: "neutral" },
  CANCELLED: { label: "Đã hủy", variant: "neutral" },
};

const PAGE_SIZE = 10;

function dayStartIso(dateStr) {
  if (!dateStr) return undefined;
  return new Date(`${dateStr}T00:00:00`).toISOString();
}
function dayEndIso(dateStr) {
  if (!dateStr) return undefined;
  return new Date(`${dateStr}T23:59:59`).toISOString();
}

export default function OrdersPage() {
  const { navigate } = useRouter();
  const { user, status: authStatus } = useAuth();
  const toast = useToast();
  const [shiftState, setShiftState] = useState({ open: false, handoverPending: false });
  const menu =
    !user || authStatus !== "authenticated"
      ? buildPosMenu({ unlocked: false, shiftOpen: false, handoverPending: false })
      : user.role === "CASHIER"
        ? buildPosMenu({ unlocked: true, shiftOpen: shiftState.open, handoverPending: shiftState.handoverPending })
        : buildMenu(user);
  const unassignedManager = isUnassignedBranchManager(user);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    if (user?.branchId) return user.branchId;
    const saved = localStorage.getItem("scms_pos_branch_id");
    return saved ? Number(saved) : "";
  });

  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [uiPage, setUiPage] = useState(1);
  const [page, setPage] = useState({ content: [], totalPages: 0, totalElements: 0 });
  const [loading, setLoading] = useState(!unassignedManager);

  useEffect(() => {
    if (authStatus === "anonymous") {
      navigate("/branch/shifts");
    }
  }, [authStatus, navigate]);

  useEffect(() => {
    if (authStatus === "authenticated" && user && !unassignedManager && !user?.branchId) {
      branchesApi.list({ uiPage: 1, size: 100 })
        .then((res) => setBranches(res.items || []))
        .catch(() => {});
    }
  }, [authStatus, user, unassignedManager, user?.branchId]);

  const branchMap = useMemo(() => {
    const map = {};
    for (const b of branches) map[b.id] = b.name;
    return map;
  }, [branches]);

  const effectiveBranchId = user?.branchId || (selectedBranchId ? Number(selectedBranchId) : undefined);

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      (user?.role !== "CASHIER" && user?.role !== "BRANCH_MANAGER") ||
      !effectiveBranchId
    ) {
      setShiftState({ open: false, handoverPending: false });
      return;
    }
    shiftsApi
      .current(effectiveBranchId)
      .then((sum) =>
        setShiftState({
          open: true,
          handoverPending: Boolean(sum?.shift?.handoverPending),
        }),
      )
      .catch(() => setShiftState({ open: false, handoverPending: false }));
  }, [authStatus, user?.role, effectiveBranchId]);

  const load = useCallback(async () => {
    if (authStatus !== "authenticated" || !user) return;
    if (unassignedManager) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await ordersApi.list({
        branchId: effectiveBranchId,
        status: status || undefined,
        keyword: keyword.trim() || undefined,
        fromDate: dayStartIso(fromDate),
        toDate: dayEndIso(toDate),
        page: uiPage,
        size: PAGE_SIZE,
      });
      setPage(data);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh sách đơn hàng.");
    } finally {
      setLoading(false);
    }
  }, [authStatus, user, unassignedManager, effectiveBranchId, status, keyword, fromDate, toDate, uiPage]);

  useEffect(() => {
    load();
  }, [load]);

  function search(e) {
    e.preventDefault();
    setUiPage(1);
    load();
  }

  const columns = [
    {
      key: "receiptNo",
      header: "Số hóa đơn",
      render: (r) => (
        <a
          href={`#/branch/orders/detail?id=${r.id}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/branch/orders/detail?id=${r.id}`);
          }}
        >
          <strong className="mono">{r.receiptNo || `#${r.id}`}</strong>
        </a>
      ),
    },
    ...(!user?.branchId
      ? [
          {
            key: "branchId",
            header: "Chi nhánh",
            render: (r) => branchMap[r.branchId] || `CN #${r.branchId}`,
          },
        ]
      : []),
    { key: "createdAt", header: "Thời gian", render: (r) => formatDateTime(r.createdAt) },
    { key: "cashierId", header: "Thu ngân", render: (r) => (r.cashierId ? `NV #${r.cashierId}` : "—") },
    { key: "totalAmount", header: "Tổng tiền", numeric: true, render: (r) => formatVnd(r.totalAmount) },
    { key: "discountAmount", header: "Giảm giá", numeric: true, render: (r) => formatVnd(r.discountAmount) },
    { key: "finalAmount", header: "Phải trả", numeric: true, render: (r) => <strong>{formatVnd(r.finalAmount)}</strong> },
    {
      key: "status",
      header: "Trạng thái",
      render: (r) => {
        const meta = ORDER_STATUS_META[r.status] || { label: r.status, variant: "neutral" };
        return <StatusTag status={r.status} label={meta.label} variant={meta.variant} />;
      },
    },
  ];

  const toolbar = (
    <Form onSubmit={search} className="d-flex gap-2 flex-wrap align-items-center">
      {!user?.branchId && branches.length > 0 ? (
        <Form.Select
          value={selectedBranchId || ""}
          onChange={(e) => {
            const val = e.target.value ? Number(e.target.value) : "";
            setSelectedBranchId(val);
            if (val) localStorage.setItem("scms_pos_branch_id", String(val));
            setUiPage(1);
          }}
          style={{ maxWidth: 190 }}
        >
          <option value="">Tất cả chi nhánh</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Form.Select>
      ) : null}
      <Form.Control
        placeholder="Tìm theo số hóa đơn…"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ maxWidth: 220 }}
      />
      <Form.Select value={status} onChange={(e) => { setStatus(e.target.value); setUiPage(1); }} style={{ maxWidth: 190 }}>
        <option value="">Mọi trạng thái</option>
        {Object.entries(ORDER_STATUS_META).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </Form.Select>
      <Form.Control type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setUiPage(1); }} style={{ maxWidth: 160 }} />
      <Form.Control type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setUiPage(1); }} style={{ maxWidth: 160 }} />
      <Button type="submit" variant="outline-secondary">
        Lọc
      </Button>
    </Form>
  );

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || (selectedBranchId ? branchMap[selectedBranchId] : undefined)}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Đơn hàng"
        screenCode="SCR-05 · Đơn hàng"
        description="Đơn bán tại quầy của chi nhánh. Mở một đơn để thanh toán, áp voucher hoặc hủy đơn."
        actions={
          unassignedManager || authStatus !== "authenticated" ? null : user?.role === "CASHIER" && !shiftState.open ? (
            <Button variant="primary" onClick={() => navigate("/branch/shifts")}>
              Kiểm két &amp; Mở ca →
            </Button>
          ) : shiftState.handoverPending ? (
            <Button variant="primary" onClick={() => navigate("/branch/shifts")}>
              Kiểm két nhận ca →
            </Button>
          ) : (
            <Button variant="primary" onClick={() => navigate("/pos")}>
              + Tạo đơn mới (POS)
            </Button>
          )
        }
      />
      {shiftState.handoverPending ? (
        <div className="notice notice--warn mb-3 justify-content-between align-items-center flex-wrap">
          <span>
            <strong>Đang tạm khóa POS chờ bàn giao két giữa ca:</strong> Tạm dừng tạo đơn mới, thanh toán và hoàn tiền tại quầy cho đến khi người nhận xác nhận kiểm két.
          </span>
          <Button size="sm" variant="outline-secondary" onClick={() => navigate("/branch/shifts")}>
            Mở Ca &amp; két tiền →
          </Button>
        </div>
      ) : null}
      {authStatus !== "authenticated" ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : unassignedManager ? (
        <UnassignedManagerNotice />
      ) : loading && page.content.length === 0 ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={page.content}
          rowKey={(r) => r.id}
          loading={loading}
          emptyMessage="Chưa có đơn hàng nào khớp bộ lọc."
          toolbar={toolbar}
          pagination={{ page: uiPage, totalPages: page.totalPages, onChange: setUiPage }}
        />
      )}
    </AdminLayout>
  );
}
