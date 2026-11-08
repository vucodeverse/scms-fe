import { useCallback, useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import DataTable from "../../components/DataTable.jsx";
import StatusTag from "../../components/StatusTag.jsx";
import { useToast } from "../../components/ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { toppingsApi } from "../../api/toppingsApi.js";
import { formatVnd } from "../../lib/format.js";

// Tab Topping dùng chung trong màn hình Menu & BOM (SCR-11 TAB-05) — UC11.
// Danh sách backend trả toàn bộ (không phân trang). Danh sách không
// chứa nút thao tác (FE-16): bấm vào tên topping để mở trang chi
// tiết /chain/menu/topping-detail?id=, nơi đặt Sửa, Xoá mềm / Kích
// hoạt lại và Xóa hẳn. Thêm/Sửa là task screen topping-edit(?id=).
const STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };

export default function ToppingsTab() {
  const toast = useToast();
  const { navigate } = useRouter();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await toppingsApi.list());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: "name",
      header: "Tên topping",
      render: (r) => (
        <button
          type="button"
          className="link-btn"
          style={{ fontWeight: 600, fontSize: "inherit" }}
          onClick={() => navigate(`/chain/menu/topping-detail?id=${r.id}`)}
        >
          {r.name}
        </button>
      ),
    },
    {
      key: "defaultPrice",
      header: "Giá mặc định",
      numeric: true,
      render: (r) => formatVnd(Number(r.defaultPrice)),
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (r) => <StatusTag label={STATUS_LABELS[r.status]} status={r.status} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      emptyMessage="Chưa có topping nào."
      toolbar={
        <>
          <div className="flex-grow-1" />
          <Button variant="primary" onClick={() => navigate("/chain/menu/topping-edit")}>
            Thêm topping
          </Button>
        </>
      }
    />
  );
}
