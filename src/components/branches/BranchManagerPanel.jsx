import { useEffect, useState } from "react";
import { Button, Form, Spinner, Table } from "react-bootstrap";
import StatusTag from "../StatusTag.jsx";
import ConfirmDialog from "../ConfirmDialog.jsx";
import { useToast } from "../ToastContext.jsx";
import { useRouter } from "../../router/HashRouter.jsx";
import { branchesApi } from "../../api/branchesApi.js";
import { USER_STATUS_LABELS } from "../../config/userConstants.js";

export default function BranchManagerPanel({
  branch,
  assignedManagers,
  unassignedManagers,
  onAssigned,
}) {
  const { navigate } = useRouter();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState("");
  const [confirmAction, setConfirmAction] = useState(null); // { managerUserId, label, isUnassign }
  const [busy, setBusy] = useState(false);

  const isInactive = branch.status === "INACTIVE";
  const currentManager = assignedManagers.find((m) => m.id === branch.managerUserId) || assignedManagers[0] || null;
  const hasCurrent = Boolean(branch.managerUserId || currentManager);

  useEffect(() => {
    setSelectedId("");
  }, [branch.id, branch.managerUserId]);

  async function executeAssign(managerUserId) {
    setBusy(true);
    try {
      await branchesApi.assignManager(branch.id, managerUserId);
      toast.success(
        managerUserId == null ? "Đã gỡ quản lý khỏi chi nhánh." : "Đã cập nhật quản lý phụ trách chi nhánh.",
      );
      setConfirmAction(null);
      setSelectedId("");
      await onAssigned?.();
    } catch (err) {
      toast.error(err.message || "Không cập nhật được quản lý chi nhánh.");
      setConfirmAction(null);
    } finally {
      setBusy(false);
    }
  }

  function handleAssignClick() {
    if (!selectedId) return;
    const nextId = Number(selectedId);
    const chosen = unassignedManagers.find((m) => m.id === nextId);
    if (hasCurrent) {
      setConfirmAction({
        managerUserId: nextId,
        isUnassign: false,
        chosenName: chosen?.fullName || `#${nextId}`,
      });
      return;
    }
    executeAssign(nextId);
  }

  return (
    <div className="scms-panel panel-pad mt-3">
      <div className="panel-head">
        <div>
          <h2>Quản lý phụ trách</h2>
          <p>Mỗi chi nhánh có tối đa 1 quản lý chính được chọn từ danh sách tài khoản chưa gán chi nhánh.</p>
        </div>
        <Button size="sm" variant="outline-secondary" onClick={() => navigate("/chain/managers")}>
          Quản lý tài khoản
        </Button>
      </div>

      {assignedManagers.length === 0 ? (
        <div className="empty-state mb-3">
          <span>Chi nhánh chưa có quản lý phụ trách.</span>
        </div>
      ) : (
        <div className="table-responsive mb-3">
          <Table hover className="mb-0">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Tên đăng nhập</th>
                <th>Số điện thoại</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {assignedManagers.map((m) => (
                <tr key={m.id}>
                  <td>{m.fullName}</td>
                  <td className="mono">{m.username || "—"}</td>
                  <td>{m.phone || "—"}</td>
                  <td>
                    <StatusTag status={m.status} label={USER_STATUS_LABELS[m.status] || m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {isInactive ? (
        <div className="notice">
          <span>Chi nhánh đang ngừng hoạt động nên không thể gắn quản lý.</span>
        </div>
      ) : (
        <div className="d-flex gap-2 align-items-end flex-wrap">
          <div style={{ flex: 1, minWidth: 260 }}>
            <Form.Label className="mb-1">
              {hasCurrent ? "Đổi sang quản lý khác (chưa gán chi nhánh)" : "Gắn quản lý từ danh sách chưa gán"}
            </Form.Label>
            <Form.Select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={busy}
            >
              <option value="">
                {unassignedManagers.length
                  ? "— Chọn tài khoản quản lý khả dụng —"
                  : "— Không còn quản lý chưa gán —"}
              </option>
              {unassignedManagers.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.fullName} ({m.username || m.phone})
                </option>
              ))}
            </Form.Select>
          </div>
          <Button variant="primary" onClick={handleAssignClick} disabled={busy || !selectedId}>
            {busy ? <Spinner size="sm" className="me-1" /> : null}
            {hasCurrent ? "Đổi quản lý" : "Gắn quản lý"}
          </Button>
          {hasCurrent ? (
            <Button
              variant="outline-danger"
              disabled={busy}
              onClick={() => setConfirmAction({ managerUserId: null, isUnassign: true })}
            >
              Gỡ quản lý
            </Button>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        show={!!confirmAction}
        title={confirmAction?.isUnassign ? "Gỡ quản lý khỏi chi nhánh" : "Đổi quản lý chi nhánh"}
        body={
          confirmAction?.isUnassign ? (
            <>
              Gỡ <strong>{currentManager?.fullName || branch.managerName}</strong> khỏi chi nhánh{" "}
              <strong>{branch.name}</strong>? Quản lý sẽ quay về danh sách chưa gán và bị thu hồi phiên
              đăng nhập hiện tại.
            </>
          ) : (
            <>
              Đổi quản lý chi nhánh <strong>{branch.name}</strong> sang{" "}
              <strong>{confirmAction?.chosenName}</strong>? Quản lý cũ sẽ quay về danh sách chưa gán.
            </>
          )
        }
        danger={confirmAction?.isUnassign}
        busy={busy}
        onConfirm={() => executeAssign(confirmAction.managerUserId)}
        onCancel={() => !busy && setConfirmAction(null)}
      />
    </div>
  );
}
