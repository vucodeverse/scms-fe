import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Dropdown, Spinner } from "react-bootstrap";
import TaskLayout from "../layouts/TaskLayout.jsx";
import StatusTag from "../components/StatusTag.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import BranchManagerPanel from "../components/branches/BranchManagerPanel.jsx";
import BranchEmployeesPanel from "../components/branches/BranchEmployeesPanel.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { branchesApi } from "../api/branchesApi.js";
import { usersApi } from "../api/usersApi.js";
import { formatDateTime } from "../lib/format.js";
import { BRANCH_STATUS_LABELS } from "../config/userConstants.js";

function InfoRow({ label, children }) {
  return (
    <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
      <span className="text-muted">{label}</span>
      <strong style={{ textAlign: "right" }}>{children}</strong>
    </div>
  );
}

export default function BranchDetailPage() {
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const branchId = query.id ? Number(query.id) : null;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [branch, setBranch] = useState(null);
  const [assignedManagers, setAssignedManagers] = useState([]);
  const [unassignedManagers, setUnassignedManagers] = useState([]);
  const [employeeRefreshKey, setEmployeeRefreshKey] = useState(0);
  const [confirmSoftDelete, setConfirmSoftDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const detail = await branchesApi.detail(branchId);
      setBranch(detail);
      const [assignedRes, unassignedRes] = await Promise.allSettled([
        usersApi.list({ uiPage: 1, size: 50, role: "BRANCH_MANAGER", branchId }),
        usersApi.list({ uiPage: 1, size: 100, role: "BRANCH_MANAGER", status: "ACTIVE", unassigned: true }),
      ]);
      if (assignedRes.status === "fulfilled") setAssignedManagers(assignedRes.value.items || []);
      if (unassignedRes.status === "fulfilled") setUnassignedManagers(unassignedRes.value.items || []);
    } catch (err) {
      if (err.status === 404) setNotFound(true);
      else toastRef.current.error(err.message || "Không tải được dữ liệu chi nhánh.");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshAll() {
    await load();
    setEmployeeRefreshKey((k) => k + 1);
  }

  async function changeStatus(status) {
    try {
      await branchesApi.changeStatus(branchId, status);
      toast.success(`Đã đổi trạng thái sang ${BRANCH_STATUS_LABELS[status]}.`);
      refreshAll();
    } catch (err) {
      toast.error(err.message || "Không đổi được trạng thái.");
    }
  }

  async function runSoftDelete() {
    setBusy(true);
    try {
      await branchesApi.softDelete(branchId);
      toast.success(`Đã xoá mềm chi nhánh ${branch.code}.`);
      setConfirmSoftDelete(false);
      refreshAll();
    } catch (err) {
      toast.error(err.message || "Không xoá mềm được chi nhánh.");
      setConfirmSoftDelete(false);
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <TaskLayout title="Không tìm thấy chi nhánh" screenCode="SCR-13" codeLabel="Chi nhánh" backTo="/chain/branches">
        <div className="scms-panel panel-pad">
          <div className="empty-state">
            <span>Chi nhánh không tồn tại. Quay lại danh sách.</span>
          </div>
        </div>
      </TaskLayout>
    );
  }

  return (
    <TaskLayout
      title={branch ? `Chi tiết chi nhánh · ${branch.code}` : "Chi tiết chi nhánh"}
      subtitle="Hồ sơ đầy đủ, gắn/đổi quản lý phụ trách và nhân viên tại chi nhánh."
      screenCode="SCR-13"
      codeLabel="Chi nhánh"
      backTo="/chain/branches"
      meta={
        branch ? (
          <StatusTag status={branch.status} label={BRANCH_STATUS_LABELS[branch.status] || branch.status} />
        ) : null
      }
    >
      {loading || !branch ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <>
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Button variant="primary" onClick={() => navigate(`/chain/branches/edit?id=${branch.id}`)}>
              Sửa chi nhánh
            </Button>
            <Dropdown>
              <Dropdown.Toggle variant="outline-secondary">Đổi trạng thái</Dropdown.Toggle>
              <Dropdown.Menu>
                {Object.entries(BRANCH_STATUS_LABELS).map(([value, label]) => (
                  <Dropdown.Item key={value} disabled={branch.status === value} onClick={() => changeStatus(value)}>
                    {label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
            <Button variant="outline-danger" disabled={branch.status === "INACTIVE"} onClick={() => setConfirmSoftDelete(true)}>
              Xoá mềm
            </Button>
          </div>

          <div className="scms-panel panel-pad">
            <div className="panel-head">
              <div>
                <h2>{branch.name}</h2>
                <p>Thông tin hồ sơ chi nhánh.</p>
              </div>
            </div>
            <InfoRow label="Mã chi nhánh"><span className="mono">{branch.code}</span></InfoRow>
            <InfoRow label="Địa chỉ">{branch.address || "—"}</InfoRow>
            <InfoRow label="Số điện thoại">{branch.phone || "—"}</InfoRow>
            <InfoRow label="Email">{branch.email || "—"}</InfoRow>
            <InfoRow label="Mã số thuế">{branch.taxCode || "—"}</InfoRow>
            <InfoRow label="Giờ mở cửa">
              {String(branch.openingTime || "").slice(0, 5)} – {String(branch.closingTime || "").slice(0, 5)}
            </InfoRow>
            <InfoRow label="Số bàn">{branch.tableCount ?? "—"}</InfoRow>
            <InfoRow label="Nhân viên đang hoạt động">{branch.employeeCount}</InfoRow>
            <InfoRow label="Trạng thái POS">
              {branch.posOnline == null ? "Chưa kết nối" : branch.posOnline ? "Online" : "Offline"}
            </InfoRow>
            <InfoRow label="Tạo lúc">{formatDateTime(branch.createdAt)}</InfoRow>
            <InfoRow label="Cập nhật lúc">{formatDateTime(branch.updatedAt)}</InfoRow>
          </div>

          <BranchManagerPanel
            branch={branch}
            assignedManagers={assignedManagers}
            unassignedManagers={unassignedManagers}
            onAssigned={refreshAll}
          />

          <BranchEmployeesPanel
            branchId={branch.id}
            refreshKey={employeeRefreshKey}
            onEmployeesChanged={load}
          />

          <ConfirmDialog
            show={confirmSoftDelete}
            title="Xoá mềm chi nhánh"
            body={
              <>
                Xoá mềm chi nhánh <strong>{branch.name}</strong> ({branch.code})? Chi nhánh chuyển sang
                trạng thái Ngừng hoạt động và tự gỡ quản lý phụ trách. Backend sẽ từ chối nếu chi nhánh còn
                nhân viên đang hoạt động.
              </>
            }
            confirmLabel="Xoá mềm"
            busy={busy}
            onConfirm={runSoftDelete}
            onCancel={() => !busy && setConfirmSoftDelete(false)}
          />
        </>
      )}
    </TaskLayout>
  );
}
