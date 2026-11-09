import { useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import FormField from "../FormField.jsx";
import { useToast } from "../ToastContext.jsx";
import { usersApi } from "../../api/usersApi.js";

const EMPTY_FORM = () => ({
  fullName: "",
  phone: "",
  email: "",
  username: "",
  password: "",
});

export default function ManagerCreatePanel({ onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const created = await usersApi.create({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        position: "BRANCH_MANAGER",
        branchId: null,
        username: form.username.trim(),
        password: form.password,
        pin: null,
        cardCode: null,
        hourlyRate: null,
        status: "ACTIVE",
      });
      toast.success(`Đã tạo tài khoản quản lý ${created.username || created.fullName} (Chưa gán chi nhánh).`);
      setForm(EMPTY_FORM);
      onCreated?.();
    } catch (err) {
      setError(err);
      if (!err.fieldErrors?.length) toast.error(err.message || "Không tạo được tài khoản quản lý.");
    } finally {
      setSaving(false);
    }
  }

  const fe = (name) => error?.fieldError?.(name) || null;
  const generalMsg = error && !error.fieldErrors?.length ? error.message : null;
  const canSubmit = !saving && form.fullName.trim() && form.phone.trim() && form.username.trim() && form.password;

  return (
    <div className="scms-panel panel-pad mb-3">
      <div className="panel-head">
        <div>
          <h2>Tạo tài khoản quản lý</h2>
          <p>
            Tài khoản mới tạo sẽ ở trạng thái <strong>Chưa gán chi nhánh</strong>. Vào mục Chi nhánh để
            gắn từ danh sách quản lý khả dụng.
          </p>
        </div>
      </div>

      {generalMsg ? (
        <div className="notice notice--warn mb-3">
          <span>{generalMsg}</span>
        </div>
      ) : null}

      <Form onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Họ tên" required error={fe("fullName")}>
            <Form.Control
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Ví dụ: Nguyễn Văn A"
            />
          </FormField>
          <FormField label="Số điện thoại" required error={fe("phone")} help="10–11 số, bắt đầu bằng 0.">
            <Form.Control
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="09xxxxxxxx"
            />
          </FormField>
          <FormField label="Email" error={fe("email")}>
            <Form.Control
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="manager@scms.local"
            />
          </FormField>
          <FormField label="Tên đăng nhập" required error={fe("username")}>
            <Form.Control
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Ví dụ: bm_nguyentrai"
            />
          </FormField>
          <FormField label="Mật khẩu" required error={fe("password")} help="Ít nhất 8 ký tự, gồm chữ và số.">
            <Form.Control
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
          </FormField>
        </div>
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={!canSubmit}>
            {saving ? <Spinner size="sm" className="me-2" /> : null}
            Tạo tài khoản quản lý
          </Button>
        </div>
      </Form>
    </div>
  );
}
