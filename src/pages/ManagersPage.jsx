import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusTag from "../components/StatusTag.jsx";
import ManagerCreatePanel from "../components/managers/ManagerCreatePanel.jsx";
import { EditManagerModal, ManagerStatusDialog, ResetPasswordModal } from "../components/managers/ManagerActionModals.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { ASSIGNMENT_FILTER_OPTIONS, USER_STATUS_LABELS } from "../config/userConstants.js";
import { usersApi } from "../api/usersApi.js";

const PAGE_SIZE = 20;

export default function ManagersPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [page, setPage] = useState({ items: [], totalPages: 0, totalItems: 0 });
  const [uiPage, setUiPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const [editTarget, setEditTarget] = useState(null);
  const [pwTarget, setPwTarget] = useState(null);
  const [statusConfirm, setStatusConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await usersApi.list({
        uiPage,
        size: PAGE_SIZE,
        role: "BRANCH_MANAGER",
        keyword: keyword.trim() || undefined,
        status: statusFilter || undefined,
        unassigned: assignedFilter === "" ? undefined : assignedFilter === "true",
      });
      setPage(result);
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được danh sách quản lý.");
    } finally {
      setLoading(false);
    }
  }, [uiPage, keyword, statusFilter, assignedFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function runStatusChange() {
    if (!statusConfirm) return;
    setBusy(true);
    try {
      await usersApi.changeStatus(statusConfirm.row.id, statusConfirm.nextStatus);
      toast.success(
        statusConfirm.nextStatus === "ACTIVE"
          ? `Đã kích hoạt lại tài khoản ${statusConfirm.row.fullName}.`
          : `Đã ngừng hoạt động tài khoản ${statusConfirm.row.fullName}.`,
      );
      setStatusConfirm(null);
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
          <div style={{ color: "var(--muted)", fontSize: 11.5 }}>{r.email || "—"}</div>
        </>
      ),
    },
    { key: "username", header: "Tên đăng nhập", render: (r) => <span className="mono">{r.username || "—"}</span> },
    { key: "phone", header: "SĐT", render: (r) => r.phone || "—" },
    {
      key: "branchName",
      header: "Chi nhánh phụ trách",
      render: (r) =>
        r.branchId ? (
          <button
            type="button"
            className="link-btn"
            style={{ fontWeight: 600, fontSize: "inherit" }}
            onClick={() => navigate(`/chain/branches/detail?id=${r.branchId}`)}
          >
            {r.branchName || `Chi nhánh #${r.branchId}`}
          </button>
        ) : (
          <StatusTag status="DRAFT" variant="neutral" label="Chưa gán" />
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
      width: 230,
      render: (r) => (
        <div className="d-flex gap-1">
          <Button size="sm" variant="outline-secondary" onClick={() => setEditTarget(r)}>Sửa</Button>
          <Button size="sm" variant="outline-secondary" onClick={() => setPwTarget(r)}>Đổi MK</Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setStatusConfirm({ row: r, nextStatus: r.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}
          >
            {r.status === "ACTIVE" ? "Ngừng" : "Kích hoạt"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      menu={buildMenu(user)}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="Tài khoản quản lý"
        screenCode="SCR-13 · QL"
        description="Tạo sẵn tài khoản Quản lý chi nhánh và quản lý danh sách tài khoản chờ gắn hoặc đang phụ trách chi nhánh."
        actions={<Button variant="outline-secondary" onClick={() => navigate("/chain/branches")}>Quản lý chi nhánh</Button>}
      />

      <ManagerCreatePanel onCreated={() => { setUiPage(1); load(); }} />

      <DataTable
        columns={columns}
        rows={page.items}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="Chưa có tài khoản quản lý nào khớp bộ lọc."
        pagination={{ page: uiPage, totalPages: page.totalPages, onChange: setUiPage }}
        toolbar={
          <div className="d-flex gap-2 flex-wrap w-100">
            <Form.Control
              type="search"
              placeholder="Tìm theo họ tên, username, SĐT…"
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setUiPage(1); }}
              style={{ flex: 1, minWidth: 240 }}
            />
            <Form.Select
              value={assignedFilter}
              onChange={(e) => { setAssignedFilter(e.target.value); setUiPage(1); }}
              style={{ maxWidth: 210 }}
              aria-label="Lọc theo phân công chi nhánh"
            >
              {ASSIGNMENT_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
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

      <EditManagerModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={load} />
      <ResetPasswordModal target={pwTarget} onClose={() => setPwTarget(null)} />
      <ManagerStatusDialog
        confirm={statusConfirm}
        busy={busy}
        onConfirm={runStatusChange}
        onCancel={() => !busy && setStatusConfirm(null)}
      />
    </AdminLayout>
  );
}
