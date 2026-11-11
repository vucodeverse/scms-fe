import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusTag from "../components/StatusTag.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import UnassignedManagerNotice from "../components/UnassignedManagerNotice.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { isUnassignedBranchManager, roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { POSITION_LABELS, USER_STATUS_LABELS } from "../config/userConstants.js";
import { usersApi } from "../api/usersApi.js";
import { branchesApi } from "../api/branchesApi.js";
import { fetchAllPages } from "../api/paging.js";

export { POSITION_LABELS };

const PAGE_SIZE = 20;

export default function EmployeesPage() {
  const { user } = useAuth();
  const { query, navigate } = useRouter();
  const toast = useToast();
  const menu = buildMenu(user);
  const isCoo = user?.role === "COO";
  const unassignedManager = isUnassignedBranchManager(user);

  const [page, setPage] = useState({ items: [], totalPages: 0, totalItems: 0 });
  const [uiPage, setUiPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState(() => (query.branchId ? String(query.branchId) : ""));
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(!unassignedManager);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    setBranchFilter(query.branchId ? String(query.branchId) : "");
    setUiPage(1);
  }, [query.branchId]);

  useEffect(() => {
    if (!isCoo) return;
    fetchAllPages((p) => branchesApi.list({ ...p, sortBy: "name", sortDir: "ASC" }))
      .then((items) => setBranches(items))
      .catch(() => setBranches([]));
  }, [isCoo]);

  const load = useCallback(async () => {
    if (unassignedManager) {
      setLoading(false);
      return;
    }
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
  }, [unassignedManager, uiPage, keyword, roleFilter, statusFilter, branchFilter, isCoo, user?.branchId]);

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
          <div style={{ color: "var(--muted)", fontSize: 11.5 }}>{r.email || r.phone || "—"}</div>
        </>
      ),
    },
    { key: "phone", header: "SĐT", render: (r) => r.phone || "—" },
    {
      key: "branchName",
      header: "Chi nhánh",
      render: (r) => r.branchName || (r.roleCode === "COO" || r.position === "COO" ? "Toàn chuỗi" : "Chưa gán"),
    },
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
          <div>
            {r.roleCode === "COO" || r.roleCode === "BRANCH_MANAGER"
              ? "Không dùng PIN"
              : r.hasPin
                ? "PIN ••••"
                : "Chưa có PIN"}
          </div>
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
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() =>
              navigate(`/branch/employees/edit?id=${r.id}${branchFilter ? `&branchId=${branchFilter}` : ""}`)
            }
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

  const labeledField = (label, control, grow = false) => (
    <div style={grow ? { flex: 1, minWidth: 220 } : { minWidth: 150 }}>
      <Form.Label className="mb-1">{label}</Form.Label>
      {control}
    </div>
  );

  const addHref = `/branch/employees/edit${branchFilter ? `?branchId=${branchFilter}` : ""}`;

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
        description="Quản lý hồ sơ, vai trò, PIN và thẻ RFID của nhân viên tại chi nhánh."
        actions={
          unassignedManager ? null : (
            <Button variant="primary" onClick={() => navigate(addHref)}>
              Thêm nhân viên
            </Button>
          )
        }
      />

      {unassignedManager ? (
        <UnassignedManagerNotice />
      ) : (
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
      )}

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
              Ngừng hoạt động hồ sơ của <strong>{confirm?.row.fullName}</strong>?
              {confirm?.row.roleCode === "BRANCH_MANAGER"
                ? " Tài khoản Quản lý cũng sẽ tự động gỡ khỏi chi nhánh."
                : " Nhân viên sẽ không đăng nhập hay chấm công được cho tới khi được kích hoạt lại."}
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
