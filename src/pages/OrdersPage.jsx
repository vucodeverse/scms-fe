import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
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
import { formatVnd, formatDateTime } from "../lib/format.js";
import { ordersApi } from "../api/ordersApi.js";

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

// SCR-05 — Danh sách đơn hàng của chi nhánh (FE-17, UC18). Hàng không
// mang cụm nút thao tác: bấm vào số hóa đơn để mở trang chi tiết đơn,
// nơi chứa thanh toán/hủy đơn (chuẩn FE-13).
export default function OrdersPage() {
  const { navigate } = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const menu = buildMenu(user);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [uiPage, setUiPage] = useState(1);
  const [page, setPage] = useState({ content: [], totalPages: 0, totalElements: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ordersApi.list({
        branchId: user?.branchId || undefined,
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
  }, [user?.branchId, status, keyword, fromDate, toDate, uiPage]);

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
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Đơn hàng"
        screenCode="SCR-05 · Đơn hàng"
        description="Đơn bán tại quầy của chi nhánh. Mở một đơn để thanh toán, áp voucher hoặc hủy đơn."
      />
      {loading && page.content.length === 0 ? (
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
