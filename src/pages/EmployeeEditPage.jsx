import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import TaskLayout from "../layouts/TaskLayout.jsx";
import FormField from "../components/FormField.jsx";
import StatusTag from "../components/StatusTag.jsx";
import UnassignedManagerNotice from "../components/UnassignedManagerNotice.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { isUnassignedBranchManager } from "../auth/landing.js";
import { POSITION_LABELS, USER_STATUS_LABELS } from "../config/userConstants.js";
import { usersApi } from "../api/usersApi.js";
import { branchesApi } from "../api/branchesApi.js";

const LOGIN_POSITIONS = ["COO", "BRANCH_MANAGER"];

const EMPTY_FORM = () => ({
  fullName: "",
  phone: "",
  email: "",
  position: "CASHIER",
  branchId: "",
  username: "",
  password: "",
  pin: "",
  cardCode: "",
  status: "ACTIVE",
});

export default function EmployeeEditPage() {
  const { user } = useAuth();
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const isCoo = user?.role === "COO";
  const unassignedManager = isUnassignedBranchManager(user);
  const editingId = query.id ? Number(query.id) : null;
  const presetBranchId = query.branchId ? String(query.branchId) : "";
  const backPath =
    query.returnTo || (presetBranchId ? `/branch/employees?branchId=${presetBranchId}` : "/branch/employees");

  const [loading, setLoading] = useState(!unassignedManager);
  const [notFound, setNotFound] = useState(false);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [originalPosition, setOriginalPosition] = useState(null);
  const [hasUsername, setHasUsername] = useState(false);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    if (unassignedManager) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (isCoo) {
        const page = await branchesApi.list({ uiPage: 1, size: 100, sortBy: "name", sortDir: "ASC" });
        setBranches(page.items || []);
      }
      if (editingId) {
        const detail = await usersApi.detail(editingId);
        setOriginalPosition(detail.roleCode || detail.position || "CASHIER");
        setHasUsername(!!detail.username);
        setForm({
          fullName: detail.fullName || "",
          phone: detail.phone || "",
          email: detail.email || "",
          position: detail.roleCode || "CASHIER",
          branchId: detail.branchId ? String(detail.branchId) : "",
          username: detail.username || "",
          password: "",
          pin: "",
          cardCode: detail.cardCode || "",
          status: detail.status || "ACTIVE",
        });
      } else {
        setForm((f) => ({
          ...f,
          branchId: isCoo ? presetBranchId : user?.branchId ? String(user.branchId) : "",
        }));
      }
    } catch (err) {
      if (editingId && (err.status === 404 || err.status === 403)) setNotFound(true);
      else toastRef.current.error(err.message || "Không tải được dữ liệu nhân viên.");
    } finally {
      setLoading(false);
    }
  }, [unassignedManager, editingId, isCoo, user?.branchId, presetBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  const isLoginPosition = editingId
    ? hasUsername || LOGIN_POSITIONS.includes(form.position)
    : LOGIN_POSITIONS.includes(form.position);
  const BM_CREATABLE_ROLES = ["CASHIER", "BARISTA", "WAITER"];
  const roleOptions = Object.entries(POSITION_LABELS).filter(([value]) => {
    if (isCoo) return value !== "COO";
    if (editingId && value === originalPosition) return true;
    return BM_CREATABLE_ROLES.includes(value);
  });

  const lockBranchEdit = Boolean(isCoo && editingId && originalPosition === "BRANCH_MANAGER");
  const canHavePin = Boolean(form.branchId || (!isCoo && user?.branchId));

  async function submitForm(e) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const resolvedBranchId = form.branchId ? Number(form.branchId) : isCoo ? null : user?.branchId || null;
    const payload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      position: editingId ? originalPosition : form.position,
      branchId: resolvedBranchId,
      username: isLoginPosition ? form.username.trim() || null : null,
      password: !editingId && isLoginPosition ? form.password || null : null,
      pin: resolvedBranchId && form.pin.trim() ? form.pin.trim() : null,
      cardCode: form.cardCode.trim() || null,
      hourlyRate: null,
      status: form.status,
    };
    setSaving(true);
    try {
      let savedId = editingId;
      if (editingId) {
        await usersApi.update(editingId, payload);
      } else {
        const created = await usersApi.create(payload);
        savedId = created.id;
      }
      if (editingId && isCoo && form.position !== originalPosition) {
        await usersApi.assignRole(editingId, form.position);
        toast.success("Đã gán vai trò mới — hiệu lực từ lần đăng nhập sau của nhân viên.");
      }
      toast.success(
        editingId ? `Đã lưu hồ sơ ${payload.fullName}.` : `Đã tạo hồ sơ ${payload.fullName}.`,
      );
      navigate(backPath);
      return savedId;
    } catch (err) {
      setFormError(err);
      if (!err.fieldErrors?.length) toast.error(err.message || "Không lưu được hồ sơ.");
    } finally {
      setSaving(false);
    }
  }

  async function runResetPassword() {
    if (!editingId || resetting || !newPassword) return;
    setResetting(true);
    try {
      await usersApi.resetPassword(editingId, newPassword);
      toast.success("Đã đặt lại mật khẩu. Toàn bộ phiên đăng nhập của nhân viên đã bị thu hồi.");
      setNewPassword("");
    } catch (err) {
      toast.error(err.message || "Không đặt lại được mật khẩu.");
    } finally {
      setResetting(false);
    }
  }

  const fe = (name) => formError?.fieldError?.(name) || null;
  const formMessage = formError && !formError.fieldErrors?.length ? formError.message : null;

  if (unassignedManager) {
    return (
      <TaskLayout title="Hồ sơ nhân sự" screenCode="TAB-03" codeLabel="Hồ sơ nhân sự" backTo={backPath}>
        <UnassignedManagerNotice />
      </TaskLayout>
    );
  }

  if (notFound) {
    return (
      <TaskLayout title="Không tìm thấy nhân viên" screenCode="TAB-03" codeLabel="Hồ sơ nhân sự" backTo={backPath}>
        <div className="scms-panel panel-pad">
          <div className="empty-state">
            <span>Hồ sơ không tồn tại hoặc nằm ngoài chi nhánh của bạn. Quay lại danh sách nhân sự.</span>
          </div>
        </div>
      </TaskLayout>
    );
  }

  return (
    <TaskLayout
      title={editingId ? `Sửa hồ sơ · ${form.fullName || ""}` : "Thêm nhân viên"}
      subtitle="Thông tin nhân sự, PIN chấm công và tài khoản đăng nhập."
      screenCode="TAB-03"
      codeLabel="Hồ sơ nhân sự"
      backTo={backPath}
      meta={
        editingId ? (
          <StatusTag status={form.status} label={USER_STATUS_LABELS[form.status] || form.status} />
        ) : (
          <StatusTag status="DRAFT" label="Hồ sơ mới" />
        )
      }
    >
      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <>
          <Form onSubmit={submitForm}>
            <div className="scms-panel panel-pad">
              <div className="panel-head">
                <div>
                  <h2>Thông tin cơ bản</h2>
                  <p>
                    {isCoo
                      ? "COO quản lý hồ sơ của mọi chi nhánh."
                      : `Chi nhánh ${user?.branchName || ""} — hồ sơ ngoài chi nhánh sẽ bị backend từ chối.`}
                  </p>
                </div>
              </div>

              {formMessage ? (
                <div className="notice notice--warn mb-3">
                  <span>{formMessage}</span>
                </div>
              ) : null}

              <div className="form-grid">
                <FormField label="Họ tên" required error={fe("fullName")}>
                  <Form.Control value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                </FormField>
                <FormField label="Số điện thoại" required error={fe("phone")} help="10–11 số, bắt đầu bằng 0.">
                  <Form.Control
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="0xxxxxxxxx"
                  />
                </FormField>
                <FormField label="Email" error={fe("email")}>
                  <Form.Control
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </FormField>
                <FormField label="Vai trò" required error={fe("position")}>
                  <Form.Select
                    value={form.position}
                    disabled={!!editingId && !isCoo}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                  >
                    {roleOptions.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Form.Select>
                </FormField>
                {isCoo ? (
                  <FormField
                    label="Chi nhánh"
                    required={!isLoginPosition}
                    error={fe("branchId")}
                    help={
                      lockBranchEdit
                        ? "Đổi chi nhánh của Quản lý thực hiện tại màn Chi nhánh."
                        : form.position === "BRANCH_MANAGER"
                          ? "Có thể để trống để tạo Quản lý chưa gán chi nhánh."
                          : undefined
                    }
                  >
                    <Form.Select
                      value={form.branchId}
                      disabled={lockBranchEdit}
                      onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                    >
                      <option value="">
                        {form.position === "BRANCH_MANAGER" ? "— Chưa gán chi nhánh —" : "— Chọn chi nhánh —"}
                      </option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </Form.Select>
                  </FormField>
                ) : null}
                {isLoginPosition ? (
                  <>
                    <FormField label="Tên đăng nhập" required={!editingId} error={fe("username")}>
                      <Form.Control
                        value={form.username}
                        disabled={!!editingId && hasUsername}
                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                      />
                    </FormField>
                    {!editingId ? (
                      <FormField label="Mật khẩu" required error={fe("password")}>
                        <Form.Control
                          type="password"
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                          autoComplete="new-password"
                        />
                      </FormField>
                    ) : null}
                  </>
                ) : null}
                <FormField
                  label="PIN 4 số"
                  required={!editingId && !isLoginPosition}
                  error={fe("pin")}
                  help={
                    !canHavePin
                      ? "Chỉ nhân sự thuộc chi nhánh mới dùng PIN."
                      : editingId
                        ? "Để trống nếu giữ nguyên PIN hiện tại. PIN là duy nhất trong chi nhánh."
                        : isLoginPosition
                          ? "Không bắt buộc với Quản lý; nếu nhập, PIN là duy nhất trong chi nhánh."
                          : "Duy nhất trong chi nhánh."
                  }
                >
                  <Form.Control
                    value={form.pin}
                    maxLength={4}
                    inputMode="numeric"
                    disabled={!canHavePin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                    placeholder={editingId ? "••••" : ""}
                  />
                </FormField>
                <FormField label="Mã RFID" error={fe("cardCode")}>
                  <Form.Control value={form.cardCode} onChange={(e) => setForm({ ...form, cardCode: e.target.value })} />
                </FormField>
                <FormField label="Trạng thái" error={fe("status")}>
                  <Form.Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="INACTIVE">Ngừng hoạt động</option>
                  </Form.Select>
                </FormField>
              </div>

              <div className="form-actions">
                <Button variant="outline-secondary" onClick={() => navigate(backPath)} disabled={saving}>
                  Hủy
                </Button>
                <Button variant="primary" type="submit" disabled={saving || !form.fullName.trim() || !form.phone.trim()}>
                  {saving ? <Spinner size="sm" className="me-2" /> : null}
                  Lưu hồ sơ
                </Button>
              </div>
            </div>
          </Form>

          {editingId && hasUsername ? (
            <div className="scms-panel panel-pad mt-3">
              <div className="panel-head">
                <div>
                  <h2>Đặt lại mật khẩu</h2>
                  <p>Đặt mật khẩu mới sẽ thu hồi toàn bộ phiên đăng nhập hiện tại của nhân viên.</p>
                </div>
              </div>
              <div className="d-flex gap-2 align-items-end flex-wrap">
                <div style={{ flex: 1, minWidth: 240 }}>
                  <Form.Label>Mật khẩu mới</Form.Label>
                  <Form.Control
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Ít nhất 8 ký tự, gồm chữ và số"
                    autoComplete="new-password"
                  />
                </div>
                <Button variant="primary" onClick={runResetPassword} disabled={resetting || !newPassword}>
                  {resetting ? <Spinner size="sm" className="me-2" /> : null}
                  Đặt lại mật khẩu
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </TaskLayout>
  );
}
