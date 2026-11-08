import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusTag from "../components/StatusTag.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { usersApi } from "../api/usersApi.js";
import { branchesApi } from "../api/branchesApi.js";

const PAGE_SIZE = 20;

export const POSITION_LABELS = {
  COO: "COO",
  BRANCH_MANAGER: "Quản lý chi nhánh",
  CASHIER: "Thu ngân",
  BARISTA: "Pha chế",
  WAITER: "Phục vụ",
};

const USER_STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };

// SCR-09 · TAB-03 — Hồ sơ nhân sự (FE-06). Bố cục bám prototype
// (views-branch employees): toolbar có nhãn trong thẻ bảng (Tìm kiếm /
// Vai trò / Trạng thái), cột Họ tên, SĐT, Vai trò, PIN/thẻ, Trạng thái.
// Khác prototype theo dữ liệu backend: không có mã NV và backend
// không trả PIN thật (chỉ hasPin) nên cột PIN hiển thị trạng thái cấp;
// không có cột lương/giờ vì backend chưa lưu trường này (issue #6).
// COO xem toàn chuỗi và lọc theo chi nhánh; BM bị khóa trong chi
// nhánh của mình (backend trả 403 CROSS_BRANCH_DENIED nếu vượt).
export default function EmployeesPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const menu = buildMenu(user);
  const isCoo = user?.role === "COO";

  const [page, setPage] = useState({ items: [], totalPages: 0, totalItems: 0 });
  const [uiPage, setUiPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { row, nextStatus }
  const [busy, setBusy] = useState(false);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!isCoo) return;
    branchesApi
      .list({ uiPage: 1, size: 100, sortBy: "name", sortDir: "ASC" })
      .then((r) => setBranches(r.items || []))
      .catch(() => setBranches([]));
  }, [isCoo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await usersApi.list({
        uiPage,
        size: PAGE_SIZE,
        keyword: keyword.trim() || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        branchId: isCoo ? (branchFilter ? Number(branchFilter) : undefined) : user?.branchId || undefined,
      });
      setPage(result);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh sách nhân viên.");
    } finally {
      setLoading(false);
    }
  }, [uiPage, keyword, roleFilter, statusFilter, branchFilter, isCoo, user?.branchId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runStatusChange() {
    if (!confirm) return;
    setBusy(true);
    try {
      await usersApi.changeStatus(confirm.row.id, confirm.nextStatus);
      toast.success(
        confirm.nextStatus === "ACTIVE"
          ? `Đã kích hoạt lại nhân viên ${confirm.row.fullName}.`
          : `Đã ngừng hoạt động nhân viên ${confirm.row.fullName}.`,
      );
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err.message || "Không đổi được trạng thái.");
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: "fullName",
      header: "Họ tên",
      render: (r) => (
        <>
          <div style={{ fontWeight: 600 }}>{r.fullName}</div>
          <div style={{ color: "var(--muted)", fontSize: 11.5 }}>{r.username || r.email || "—"}</div>
        </>
      ),
    },
    { key: "phone", header: "SĐT", render: (r) => r.phone || "—" },
    { key: "branchName", header: "Chi nhánh", render: (r) => r.branchName || "—" },
    {
      key: "role",
      header: "Vai trò",
      render: (r) => POSITION_LABELS[r.roleCode] || r.position || r.roleCode || "—",
    },
    {
      key: "pinCard",
      header: "PIN / thẻ",
      render: (r) => (
        <>
          <div>{r.hasPin ? "PIN ••••" : "Chưa có PIN"}</div>
          <div className="mono" style={{ color: "var(--muted)", fontSize: 11.5 }}>
            {r.cardCode || "Chưa có thẻ"}
          </div>
        </>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (r) => <StatusTag status={r.status} label={USER_STATUS_LABELS[r.status] || r.status} />,
    },
    {
      key: "actions",
      header: "Thao tác",
      width: 190,
      render: (r) => (
        <div className="d-flex gap-1">
          <Button size="sm" variant="outline-secondary" onClick={() => navigate(`/branch/employees/edit?id=${r.id}`)}>
            Sửa hồ sơ
          </Button>
          {r.status === "ACTIVE" ? (
            <Button size="sm" variant="outline-secondary" onClick={() => setConfirm({ row: r, nextStatus: "INACTIVE" })}>
              Ngừng
            </Button>
          ) : (
            <Button size="sm" variant="outline-secondary" onClick={() => setConfirm({ row: r, nextStatus: "ACTIVE" })}>
              Kích hoạt
            </Button>
          )}
        </div>
      ),
    },
  ];

  const labeledField = (label, control, grow = false) => (
    <div style={grow ? { flex: 1, minWidth: 220 } : { minWidth: 150 }}>
      <Form.Label className="mb-1">{label}</Form.Label>
      {control}
    </div>
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
        title="Hồ sơ nhân sự"
        screenCode="SCR-09 · TAB-03"
        description="Quản lý hồ sơ, vai trò, PIN và thẻ RFID của nhân viên tại chi nhánh."
        actions={
          <Button variant="primary" onClick={() => navigate("/branch/employees/edit")}>
            Thêm nhân viên
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={page.items}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="Không có nhân viên nào khớp bộ lọc."
        pagination={{ page: uiPage, totalPages: page.totalPages, onChange: setUiPage }}
        toolbar={
          <div className="d-flex gap-2 align-items-end flex-wrap w-100">
            {labeledField(
              "Tìm kiếm",
              <Form.Control
                type="search"
                placeholder="Họ tên, số điện thoại…"
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setUiPage(1);
                }}
              />,
              true,
            )}
            {isCoo
              ? labeledField(
                  "Chi nhánh",
                  <Form.Select
                    value={branchFilter}
                    onChange={(e) => {
                      setBranchFilter(e.target.value);
                      setUiPage(1);
                    }}
                  >
                    <option value="">Tất cả chi nhánh</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Form.Select>,
                )
              : null}
            {labeledField(
              "Vai trò",
              <Form.Select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setUiPage(1);
                }}
              >
                <option value="">Tất cả</option>
                {Object.entries(POSITION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Form.Select>,
            )}
            {labeledField(
              "Trạng thái",
              <Form.Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setUiPage(1);
                }}
              >
                <option value="">Tất cả</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </Form.Select>,
            )}
          </div>
        }
      />

      <ConfirmDialog
        show={!!confirm}
        title={confirm?.nextStatus === "ACTIVE" ? "Kích hoạt nhân viên" : "Ngừng hoạt động nhân viên"}
        body={
          confirm?.nextStatus === "ACTIVE" ? (
            <>
              Kích hoạt lại hồ sơ của <strong>{confirm?.row.fullName}</strong>?
            </>
          ) : (
            <>
              Ngừng hoạt động hồ sơ của <strong>{confirm?.row.fullName}</strong>? Nhân viên sẽ không đăng
              nhập hay chấm công được cho tới khi được kích hoạt lại.
            </>
          )
        }
        confirmLabel="Xác nhận"
        busy={busy}
        onConfirm={runStatusChange}
        onCancel={() => !busy && setConfirm(null)}
      />
    </AdminLayout>
  );
}
