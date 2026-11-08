import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner, Table } from "react-bootstrap";
import TaskLayout from "../layouts/TaskLayout.jsx";
import FormField from "../components/FormField.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { branchesApi } from "../api/branchesApi.js";
import { usersApi } from "../api/usersApi.js";
import { BRANCH_STATUS_LABELS } from "./BranchesPage.jsx";

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

const EMPTY_MANAGER = () => ({ fullName: "", phone: "", username: "", password: "" });

// SCR-13 — Thêm/Sửa chi nhánh dưới dạng task screen mô phỏng
// branchEdit của prototype: panel Thông tin chi nhánh + form-actions.
// Khác prototype ở dữ liệu backend: không có tên ngắn riêng, trạng
// thái POS chỉ đọc (chưa có heartbeat) nên không có field sửa POS;
// "Quản lý phụ trách" của backend gắn qua tài khoản người dùng
// (role BRANCH_MANAGER + branchId) — panel Tài khoản quản lý ở dưới
// liệt kê các tài khoản manager của chi nhánh và tạo mới tối thiểu
// (phần hồ sơ nhân viên đầy đủ thuộc FE-06).
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

  const [managers, setManagers] = useState([]);
  const [managerForm, setManagerForm] = useState(EMPTY_MANAGER);
  const [managerError, setManagerError] = useState(null);
  const [creatingManager, setCreatingManager] = useState(false);

  const loadManagers = useCallback(async (branchId) => {
    try {
      const page = await usersApi.list({ uiPage: 1, size: 50, role: "BRANCH_MANAGER", branchId });
      setManagers(page.items || []);
    } catch {
      setManagers([]);
    }
  }, []);

  const load = useCallback(async () => {
    if (!editingId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const detail = await branchesApi.detail(editingId);
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
      await loadManagers(editingId);
    } catch (err) {
      if (err.status === 404) setNotFound(true);
      else toastRef.current.error(err.message || "Không tải được dữ liệu chi nhánh.");
    } finally {
      setLoading(false);
    }
  }, [editingId, loadManagers]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitForm(e) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
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
        toast.success(`Đã lưu chi nhánh ${form.code}.`);
      } else {
        await branchesApi.create({ code: form.code.trim().toUpperCase(), ...base });
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

  async function submitManager(e) {
    e.preventDefault();
    if (creatingManager || !editingId) return;
    setManagerError(null);
    setCreatingManager(true);
    try {
      await usersApi.create({
        fullName: managerForm.fullName.trim(),
        phone: managerForm.phone.trim(),
        email: null,
        position: "BRANCH_MANAGER",
        branchId: editingId,
        username: managerForm.username.trim(),
        password: managerForm.password,
        pin: null,
        cardCode: null,
        hourlyRate: null,
        status: "ACTIVE",
      });
      toast.success(`Đã tạo tài khoản quản lý ${managerForm.username.trim()}.`);
      setManagerForm(EMPTY_MANAGER);
      await loadManagers(editingId);
    } catch (err) {
      setManagerError(err);
      if (!err.fieldErrors?.length) toast.error(err.message || "Không tạo được tài khoản quản lý.");
    } finally {
      setCreatingManager(false);
    }
  }

  const fe = (name) => formError?.fieldError?.(name) || null;
  const formMessage = formError && !formError.fieldErrors?.length ? formError.message : null;
  const me = (name) => managerError?.fieldError?.(name) || null;

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
      subtitle="Hồ sơ vận hành và quản lý phụ trách."
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
        <>
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

              <div className="form-grid">
                <FormField label="Mã chi nhánh" required error={fe("code")} className="">
                  <Form.Control
                    value={form.code}
                    disabled={!!editingId}
                    maxLength={10}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="Ví dụ: CN02"
                  />
                </FormField>
                <FormField label="Tên chi nhánh" required error={fe("name")} className="">
                  <Form.Control
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ví dụ: SCMS Nguyễn Trãi"
                  />
                </FormField>
                <FormField label="Địa chỉ" error={fe("address")} className="span-all">
                  <Form.Control
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </FormField>
                <FormField label="Số điện thoại" error={fe("phone")} className="">
                  <Form.Control
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="0xxxxxxxxx"
                  />
                </FormField>
                <FormField label="Mã số thuế" error={fe("taxCode")} className="">
                  <Form.Control
                    value={form.taxCode}
                    onChange={(e) => setForm({ ...form, taxCode: e.target.value })}
                  />
                </FormField>
                <FormField label="Email" error={fe("email")} className="">
                  <Form.Control
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </FormField>
                <FormField label="Số bàn" error={fe("tableCount")} className="">
                  <Form.Control
                    type="number"
                    min="0"
                    step="1"
                    value={form.tableCount}
                    onChange={(e) => setForm({ ...form, tableCount: e.target.value })}
                  />
                </FormField>
                <FormField label="Giờ mở cửa" required error={fe("openingTime")} className="">
                  <Form.Control
                    type="time"
                    value={form.openingTime}
                    onChange={(e) => setForm({ ...form, openingTime: e.target.value })}
                  />
                </FormField>
                <FormField label="Giờ đóng cửa" required error={fe("closingTime")} className="">
                  <Form.Control
                    type="time"
                    value={form.closingTime}
                    onChange={(e) => setForm({ ...form, closingTime: e.target.value })}
                  />
                </FormField>
                <FormField label="Trạng thái vận hành" error={fe("status")} className="">
                  <Form.Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(BRANCH_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Form.Select>
                </FormField>
              </div>

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

          {editingId ? (
            <div className="scms-panel panel-pad mt-3">
              <div className="panel-head">
                <div>
                  <h2>Tài khoản quản lý</h2>
                  <p>
                    Các tài khoản có vai trò Quản lý chi nhánh tại chi nhánh này. Tài khoản quản lý đăng
                    nhập bằng tên đăng nhập và mật khẩu.
                  </p>
                </div>
              </div>

              {managers.length > 0 ? (
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
                      {managers.map((m) => (
                        <tr key={m.id}>
                          <td>{m.fullName}</td>
                          <td className="mono">{m.username || "—"}</td>
                          <td>{m.phone || "—"}</td>
                          <td>
                            <StatusTag
                              status={m.status}
                              label={m.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ) : (
                <div className="notice mb-3">
                  <span>Chi nhánh chưa có tài khoản quản lý. Tạo tài khoản đầu tiên bằng form dưới đây.</span>
                </div>
              )}

              <Form onSubmit={submitManager}>
                <div className="form-grid">
                  <FormField label="Họ tên quản lý" required error={me("fullName")} className="">
                    <Form.Control
                      value={managerForm.fullName}
                      onChange={(e) => setManagerForm({ ...managerForm, fullName: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Số điện thoại" required error={me("phone")} className="">
                    <Form.Control
                      value={managerForm.phone}
                      onChange={(e) => setManagerForm({ ...managerForm, phone: e.target.value })}
                      placeholder="0xxxxxxxxx"
                    />
                  </FormField>
                  <FormField label="Tên đăng nhập" required error={me("username")} className="">
                    <Form.Control
                      value={managerForm.username}
                      onChange={(e) => setManagerForm({ ...managerForm, username: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Mật khẩu" required error={me("password")} className="">
                    <Form.Control
                      type="password"
                      value={managerForm.password}
                      onChange={(e) => setManagerForm({ ...managerForm, password: e.target.value })}
                      autoComplete="new-password"
                    />
                  </FormField>
                </div>
                {managerError && !managerError.fieldErrors?.length ? (
                  <div className="notice notice--warn mt-3">
                    <span>{managerError.message}</span>
                  </div>
                ) : null}
                <div className="form-actions">
                  <Button variant="primary" type="submit" disabled={creatingManager || !managerForm.fullName.trim() || !managerForm.username.trim() || !managerForm.password}>
                    {creatingManager ? <Spinner size="sm" className="me-2" /> : null}
                    Tạo tài khoản quản lý
                  </Button>
                </div>
              </Form>
            </div>
          ) : null}
        </>
      )}
    </TaskLayout>
  );
}
