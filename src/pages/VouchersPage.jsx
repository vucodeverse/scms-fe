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
import { formatDate, formatVnd } from "../lib/format.js";
import { vouchersApi } from "../api/vouchersApi.js";

const PAGE_SIZE = 20;

const STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };

// SCR-12 — Khuyến mãi & Voucher (FE-11). Bố cục bám prototype
// (views-chain promotions): tiêu đề trang + bảng trong thẻ, cột
// Mã / Loại giảm / Giá trị / Đơn tối thiểu / Đã dùng / Hiệu lực /
// Phạm vi / Trạng thái. Sửa voucher là task screen riêng
// (/chain/vouchers/edit) như promotionEdit của prototype.
// Danh sách không chứa nút thao tác (FE-14): bấm vào mã voucher
// để mở trang chi tiết /chain/vouchers/detail?id=, nơi đặt Sửa,
// Xoá mềm / Kích hoạt lại và Xóa hẳn.
export default function VouchersPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const menu = buildMenu(user);

  const [page, setPage] = useState({ items: [], uiPage: 1, totalPages: 0, totalItems: 0 });
  const [uiPage, setUiPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [scopes, setScopes] = useState({}); // voucherId -> text phạm vi
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await vouchersApi.list({
        uiPage,
        size: PAGE_SIZE,
        keyword: keyword.trim() || undefined,
        status: statusFilter || undefined,
      });
      setPage(result);
      // Phạm vi áp dụng không có trong DTO danh sách — nạp chi tiết
      // từng dòng của trang hiện tại để hiển thị cột Phạm vi.
      const entries = await Promise.allSettled(result.items.map((v) => vouchersApi.detail(v.id)));
      const map = {};
      entries.forEach((entry, i) => {
        if (entry.status !== "fulfilled") return;
        const d = entry.value;
        const pCount = d.products?.length || 0;
        const cCount = d.categories?.length || 0;
        map[result.items[i].id] =
          pCount === 0 && cCount === 0
            ? "Toàn bộ sản phẩm"
            : [pCount ? `${pCount} sản phẩm` : null, cCount ? `${cCount} danh mục` : null]
                .filter(Boolean)
                .join(" · ");
      });
      setScopes(map);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh sách voucher.");
    } finally {
      setLoading(false);
    }
  }, [uiPage, keyword, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: "code",
      header: "Mã",
      render: (r) => (
        <button
          type="button"
          className="link-btn mono"
          style={{ fontWeight: 700, fontSize: "inherit" }}
          onClick={() => navigate(`/chain/vouchers/detail?id=${r.id}`)}
        >
          {r.code}
        </button>
      ),
    },
    {
      key: "discountType",
      header: "Loại giảm",
      render: (r) => (r.discountType === "PERCENT" ? "Phần trăm" : "Số tiền"),
    },
    {
      key: "discountValue",
      header: "Giá trị",
      numeric: true,
      render: (r) => (r.discountType === "PERCENT" ? `${Number(r.discountValue)}%` : formatVnd(r.discountValue)),
    },
    {
      key: "minOrderAmount",
      header: "Đơn tối thiểu",
      numeric: true,
      render: (r) => formatVnd(r.minOrderAmount),
    },
    {
      key: "used",
      header: "Đã dùng / giới hạn",
      render: (r) => (
        <>
          <strong>{r.usedCount}</strong> / {r.usageLimit ?? "Không giới hạn"}
        </>
      ),
    },
    {
      key: "validity",
      header: "Hiệu lực",
      render: (r) => (
        <span>
          {formatDate(r.startDate)} – {formatDate(r.endDate)}
        </span>
      ),
    },
    {
      key: "scope",
      header: "Phạm vi",
      render: (r) => scopes[r.id] ?? "…",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (r) => <StatusTag status={r.status} label={STATUS_LABELS[r.status] || r.status} />,
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
        title="Khuyến mãi & Voucher"
        screenCode="SCR-12"
        description="Quản lý chương trình giảm giá, điều kiện áp dụng và giới hạn lượt dùng."
        actions={
          <Button variant="primary" onClick={() => navigate("/chain/vouchers/edit")}>
            Thêm voucher
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={page.items}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="Chưa có voucher nào."
        pagination={{ page: uiPage, totalPages: page.totalPages, onChange: setUiPage }}
        toolbar={
          <>
            <Form.Control
              type="search"
              placeholder="Tìm theo mã voucher…"
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
              style={{ maxWidth: 200 }}
              aria-label="Lọc theo trạng thái"
            >
              <option value="">Mọi trạng thái</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Ngừng hoạt động</option>
            </Form.Select>
          </>
        }
      />
    </AdminLayout>
  );
}
