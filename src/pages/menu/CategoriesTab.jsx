import { useCallback, useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
import DataTable from "../../components/DataTable.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { categoriesApi } from "../../api/categoriesApi.js";
import { formatDateTime } from "../../lib/format.js";

// Tab Danh mục trong màn hình Menu & sản phẩm (SCR-11 TAB-05) — UC09.
// Thứ tự hiển thị của danh mục áp dụng cho menu bán hàng toàn chuỗi.
// Danh sách không chứa nút thao tác (FE-15): bấm vào tên danh mục
// để mở trang chi tiết /chain/menu/category-detail?id=, nơi đặt
// Sửa, đổi thứ tự, Ngừng/Kích hoạt, Xoá mềm và Xóa hẳn. Thêm/Sửa là
// task screen /chain/menu/category-edit(?id=).
const STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };
const PAGE_SIZE = 10;

export default function CategoriesTab() {
  const toast = useToast();
  const { navigate } = useRouter();

  const [page, setPage] = useState({ items: [], uiPage: 1, totalPages: 0, totalItems: 0 });
  const [uiPage, setUiPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await categoriesApi.list({
        uiPage,
        size: PAGE_SIZE,
        keyword: keyword || undefined,
        status: statusFilter || undefined,
      });
      setPage(result);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [uiPage, keyword, statusFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { key: "sortOrder", header: "Thứ tự", numeric: true, width: 80 },
    { key: "code", header: "Mã", width: 110 },
    {
      key: "name",
      header: "Tên danh mục",
      render: (r) => (
        <button
          type="button"
          className="link-btn"
          style={{ fontWeight: 600, fontSize: "inherit" }}
          onClick={() => navigate(`/chain/menu/category-detail?id=${r.id}`)}
        >
          {r.name}
        </button>
      ),
    },
    {
      key: "description",
      header: "Mô tả",
      render: (r) => <span className="text-muted-scms">{r.description || "—"}</span>,
    },
    { key: "productCount", header: "Số sản phẩm", numeric: true },
    {
      key: "status",
      header: "Trạng thái",
      render: (r) => <StatusTag status={r.status} label={STATUS_LABELS[r.status]} />,
    },
    { key: "updatedAt", header: "Cập nhật", render: (r) => formatDateTime(r.updatedAt) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={page.items}
      rowKey={(r) => r.id}
      loading={loading}
      emptyMessage="Chưa có danh mục nào."
      pagination={{ page: uiPage, totalPages: page.totalPages, onChange: setUiPage }}
      toolbar={
        <>
          <Form.Control
            type="search"
            placeholder="Tìm theo mã hoặc tên danh mục…"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setUiPage(1);
            }}
            style={{ maxWidth: 320 }}
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
          <div className="flex-grow-1" />
          <Button variant="primary" onClick={() => navigate("/chain/menu/category-edit")}>
            Thêm danh mục
          </Button>
        </>
      }
    />
  );
}
