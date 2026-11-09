import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import DataTable from "../DataTable.jsx";
import StatusTag from "../StatusTag.jsx";
import ConfirmDialog from "../ConfirmDialog.jsx";
import { useToast } from "../ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { usersApi } from "../../api/usersApi.js";
import { POSITION_LABELS, USER_STATUS_LABELS } from "../../config/userConstants.js";

const PAGE_SIZE = 10;
const BRANCH_ROLE_OPTIONS = ["BRANCH_MANAGER", "CASHIER", "BARISTA", "WAITER"];

export default function BranchEmployeesPanel({ branchId, refreshKey = 0, onEmployeesChanged }) {
  const { navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [page, setPage] = useState({ items: [], totalPages: 0, totalItems: 0 });
  const [uiPage, setUiPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const returnTo = encodeURIComponent(`/chain/branches/detail?id=${branchId}`);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersApi.list({
        uiPage,
        size: PAGE_SIZE,
        branchId,
        keyword: keyword.trim() || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      });
      setPage(res);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh sách nhân viên chi nhánh.");
    } finally {
      setLoading(false);
    }
  }, [uiPage, branchId, keyword, roleFilter, statusFilter, refreshKey]);

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
      await load();
      await onEmployeesChanged?.();
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
    { key: "role", header: "Vai trò", render: (r) => POSITION_LABELS[r.roleCode] || r.roleCode || "—" },
    { key: "phone", header: "SĐT", render: (r) => r.phone || "—" },
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
      width: 185,
      render: (r) => (
        <div className="d-flex gap-1">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => navigate(`/branch/employees/edit?id=${r.id}&branchId=${branchId}&returnTo=${returnTo}`)}
          >
            Sửa hồ sơ
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setConfirm({ row: r, nextStatus: r.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}
          >
            {r.status === "ACTIVE" ? "Ngừng" : "Kích hoạt"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mt-3">
      <div className="scms-panel panel-pad mb-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h2 className="mb-1">Nhân viên tại chi nhánh ({page.totalItems})</h2>
          <p className="mb-0 text-muted-scms">Xem, lọc và quản lý hồ sơ nhân sự thuộc chi nhánh này.</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => navigate(`/branch/employees?branchId=${branchId}`)}
          >
            Mở Hồ sơ nhân sự
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => navigate(`/branch/employees/edit?branchId=${branchId}&returnTo=${returnTo}`)}
          >
            Thêm nhân viên
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={page.items}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="Không có nhân viên nào trong chi nhánh khớp bộ lọc."
        pagination={{ page: uiPage, totalPages: page.totalPages, onChange: setUiPage }}
        toolbar={
          <div className="d-flex gap-2 flex-wrap w-100">
            <Form.Control
              type="search"
              placeholder="Tìm họ tên, SĐT nhân viên…"
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setUiPage(1); }}
              style={{ flex: 1, minWidth: 220 }}
            />
            <Form.Select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setUiPage(1); }}
              style={{ maxWidth: 190 }}
              aria-label="Lọc theo vai trò"
            >
              <option value="">Tất cả vai trò</option>
              {BRANCH_ROLE_OPTIONS.map((code) => (
                <option key={code} value={code}>{POSITION_LABELS[code]}</option>
              ))}
            </Form.Select>
            <Form.Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setUiPage(1); }}
              style={{ maxWidth: 190 }}
              aria-label="Lọc theo trạng thái"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Ngừng hoạt động</option>
            </Form.Select>
          </div>
        }
      />

      <ConfirmDialog
        show={!!confirm}
        title={confirm?.nextStatus === "ACTIVE" ? "Kích hoạt nhân viên" : "Ngừng hoạt động nhân viên"}
        body={
          confirm?.nextStatus === "ACTIVE" ? (
            <>Kích hoạt lại hồ sơ của <strong>{confirm?.row.fullName}</strong>?</>
          ) : (
            <>
              Ngừng hoạt động hồ sơ của <strong>{confirm?.row.fullName}</strong>?
              {confirm?.row.roleCode === "BRANCH_MANAGER"
                ? " Tài khoản Quản lý cũng sẽ được gỡ khỏi chi nhánh."
                : " Nhân viên sẽ không chấm công được cho tới khi được kích hoạt lại."}
            </>
          )
        }
        busy={busy}
        onConfirm={runStatusChange}
        onCancel={() => !busy && setConfirm(null)}
      />
    </div>
  );
}
