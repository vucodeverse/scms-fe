import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import TaskLayout from "../layouts/TaskLayout.jsx";
import StatusTag from "../components/StatusTag.jsx";
import BranchFormFields from "../components/branches/BranchFormFields.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { branchesApi } from "../api/branchesApi.js";
import { usersApi } from "../api/usersApi.js";
import { BRANCH_STATUS_LABELS } from "../config/userConstants.js";

const EMPTY_FORM = () => ({
  code: "",
  name: "",
  address: "",
  phone: "",
  email: "",
  taxCode: "",
  openingTime: "07:00",
  closingTime: "22:00",
  tableCount: "20",
  status: "OPEN",
});

// SCR-13 — Thêm/Sửa chi nhánh. Quản lý phụ trách được chọn từ danh sách
// BRANCH_MANAGER chưa gắn chi nhánh (tạo sẵn ở /chain/managers).
export default function BranchEditPage() {
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const editingId = query.id ? Number(query.id) : null;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [unassignedManagers, setUnassignedManagers] = useState([]);
  const [currentManager, setCurrentManager] = useState(null);
  const [originalManagerId, setOriginalManagerId] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const unassignedReq = usersApi.list({
        uiPage: 1,
        size: 100,
        role: "BRANCH_MANAGER",
        status: "ACTIVE",
        unassigned: true,
      });
      if (!editingId) {
        const pool = await unassignedReq;
        setUnassignedManagers(pool.items || []);
        setLoading(false);
        return;
      }
      const [detail, pool] = await Promise.all([branchesApi.detail(editingId), unassignedReq]);
      setUnassignedManagers(pool.items || []);
      setForm({
        code: detail.code || "",
        name: detail.name || "",
        address: detail.address || "",
        phone: detail.phone || "",
        email: detail.email || "",
        taxCode: detail.taxCode || "",
        openingTime: String(detail.openingTime || "07:00").slice(0, 5),
        closingTime: String(detail.closingTime || "22:00").slice(0, 5),
        tableCount: detail.tableCount != null ? String(detail.tableCount) : "",
        status: detail.status || "OPEN",
      });
      const assignedId = detail.managerUserId ? String(detail.managerUserId) : "";
      setOriginalManagerId(assignedId);
      setSelectedManagerId(assignedId);
      setCurrentManager(
        detail.managerUserId
          ? { id: detail.managerUserId, fullName: detail.managerName || `#${detail.managerUserId}` }
          : null,
      );
    } catch (err) {
      if (err.status === 404) setNotFound(true);
      else toastRef.current.error(err.message || "Không tải được dữ liệu chi nhánh.");
    } finally {
      setLoading(false);
    }
  }, [editingId]);

  useEffect(() => {
    load();
  }, [load]);

  const managerOptions = useMemo(() => {
    const opts = [];
    if (currentManager && !unassignedManagers.some((m) => m.id === currentManager.id)) {
      opts.push({
        id: currentManager.id,
        label: `${currentManager.fullName} (đang phụ trách chi nhánh này)`,
      });
    }
    for (const m of unassignedManagers) {
      opts.push({
        id: m.id,
        label: `${m.fullName}${m.username ? ` (${m.username})` : ""}`,
      });
    }
    return opts;
  }, [currentManager, unassignedManagers]);

  async function submitForm(e) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const managerPayload = form.status === "INACTIVE" || !selectedManagerId ? null : Number(selectedManagerId);
    const base = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      taxCode: form.taxCode.trim() || null,
      openingTime: form.openingTime,
      closingTime: form.closingTime,
      tableCount: form.tableCount === "" ? null : Number(form.tableCount),
      status: form.status,
    };
    setSaving(true);
    try {
      if (editingId) {
        await branchesApi.update(editingId, base);
        if (form.status !== "INACTIVE" && selectedManagerId !== originalManagerId) {
          await branchesApi.assignManager(editingId, managerPayload);
        }
        toast.success(`Đã lưu chi nhánh ${form.code}.`);
      } else {
        await branchesApi.create({
          code: form.code.trim().toUpperCase(),
          ...base,
          managerUserId: managerPayload,
        });
        toast.success(`Đã tạo chi nhánh ${form.code.trim().toUpperCase()}.`);
      }
      navigate("/chain/branches");
    } catch (err) {
      setFormError(err);
      if (!err.fieldErrors?.length) toast.error(err.message || "Không lưu được chi nhánh.");
    } finally {
      setSaving(false);
    }
  }

  const fe = (name) => formError?.fieldError?.(name) || null;
  const formMessage = formError && !formError.fieldErrors?.length ? formError.message : null;

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
      title={editingId ? `Sửa chi nhánh · ${form.code || ""}` : "Thêm chi nhánh"}
      subtitle="Hồ sơ vận hành và phân công quản lý phụ trách."
      screenCode="SCR-13"
      codeLabel="Chi nhánh"
      backTo="/chain/branches"
      meta={
        editingId ? (
          <StatusTag status={form.status} label={BRANCH_STATUS_LABELS[form.status] || form.status} />
        ) : (
          <StatusTag status="DRAFT" label="Chi nhánh mới" />
        )
      }
    >
      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <Form onSubmit={submitForm}>
          <div className="scms-panel panel-pad">
            <div className="panel-head">
              <div>
                <h2>Thông tin chi nhánh</h2>
                <p>Mã chi nhánh dùng trong báo cáo và đồng bộ.</p>
              </div>
            </div>

            {formMessage ? (
              <div className="notice notice--warn mb-3">
                <span>{formMessage}</span>
              </div>
            ) : null}

            <BranchFormFields
              form={form}
              setForm={setForm}
              editingId={editingId}
              fe={fe}
              selectedManagerId={selectedManagerId}
              setSelectedManagerId={setSelectedManagerId}
              managerOptions={managerOptions}
            />

            <div className="form-actions">
              <Button variant="outline-secondary" onClick={() => navigate("/chain/branches")} disabled={saving}>
                Hủy
              </Button>
              <Button variant="primary" type="submit" disabled={saving || !form.name.trim() || (!editingId && !form.code.trim())}>
                {saving ? <Spinner size="sm" className="me-2" /> : null}
                Lưu chi nhánh
              </Button>
            </div>
          </div>
        </Form>
      )}
    </TaskLayout>
  );
}
