import { useEffect, useState } from "react";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import FormField from "../FormField.jsx";
import ConfirmDialog from "../ConfirmDialog.jsx";
import { useToast } from "../ToastContext.jsx";
import { usersApi } from "../../api/usersApi.js";

export function EditManagerModal({ target, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ fullName: "", phone: "", email: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setForm({ fullName: target.fullName || "", phone: target.phone || "", email: target.email || "" });
      setError(null);
    }
  }, [target]);

  async function save(e) {
    e.preventDefault();
    if (!target || saving) return;
    setError(null);
    setSaving(true);
    try {
      await usersApi.update(target.id, {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        position: "BRANCH_MANAGER",
        branchId: target.branchId ?? null,
        username: target.username || null,
        password: null,
        pin: null,
        cardCode: target.cardCode || null,
        hourlyRate: target.hourlyRate ?? null,
        status: target.status || "ACTIVE",
      });
      toast.success(`Đã cập nhật tài khoản ${form.fullName.trim()}.`);
      onClose();
      onSaved();
    } catch (err) {
      setError(err);
      if (!err.fieldErrors?.length) toast.error(err.message || "Không cập nhật được thông tin.");
    } finally {
      setSaving(false);
    }
  }

  const fe = (name) => error?.fieldError?.(name) || null;
  return (
    <Modal show={!!target} onHide={saving ? undefined : onClose} centered>
      <Form onSubmit={save}>
        <Modal.Header closeButton={!saving}>
          <Modal.Title as="h2">Sửa tài khoản quản lý</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-flex flex-column gap-3">
          {error && !error.fieldErrors?.length ? (
            <div className="notice notice--warn"><span>{error.message}</span></div>
          ) : null}
          <FormField label="Tên đăng nhập">
            <Form.Control value={target?.username || ""} disabled />
          </FormField>
          <FormField label="Họ tên" required error={fe("fullName")}>
            <Form.Control value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </FormField>
          <FormField label="Số điện thoại" required error={fe("phone")}>
            <Form.Control value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label="Email" error={fe("email")}>
            <Form.Control type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={saving}>Hủy</Button>
          <Button variant="primary" type="submit" disabled={saving || !form.fullName.trim() || !form.phone.trim()}>
            {saving ? <Spinner size="sm" className="me-2" /> : null}
            Lưu thay đổi
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export function ResetPasswordModal({ target, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setPassword("");
      setError(null);
    }
  }, [target]);

  async function save(e) {
    e.preventDefault();
    if (!target || saving || !password) return;
    setError(null);
    setSaving(true);
    try {
      await usersApi.resetPassword(target.id, password);
      toast.success(`Đã đặt lại mật khẩu cho ${target.fullName}. Phiên đăng nhập cũ đã bị thu hồi.`);
      onClose();
    } catch (err) {
      setError(err);
      if (!err.fieldErrors?.length) toast.error(err.message || "Không đặt lại được mật khẩu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={!!target} onHide={saving ? undefined : onClose} centered>
      <Form onSubmit={save}>
        <Modal.Header closeButton={!saving}>
          <Modal.Title as="h2">Đổi mật khẩu · {target?.username}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <FormField label="Mật khẩu mới" required error={error?.fieldError?.("password")} help="Ít nhất 8 ký tự, gồm chữ và số.">
            <Form.Control
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={saving}>Hủy</Button>
          <Button variant="primary" type="submit" disabled={saving || !password}>
            {saving ? <Spinner size="sm" className="me-2" /> : null}
            Đặt lại mật khẩu
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export function ManagerStatusDialog({ confirm, busy, onConfirm, onCancel }) {
  const row = confirm?.row;
  const activating = confirm?.nextStatus === "ACTIVE";
  return (
    <ConfirmDialog
      show={!!confirm}
      title={activating ? "Kích hoạt tài khoản quản lý" : "Ngừng hoạt động tài khoản quản lý"}
      body={
        activating ? (
          <>
            Kích hoạt lại tài khoản của <strong>{row?.fullName}</strong>? Tài khoản sẽ sẵn sàng trong
            danh sách quản lý chưa gán chi nhánh.
          </>
        ) : (
          <>
            Ngừng hoạt động tài khoản của <strong>{row?.fullName}</strong>?
            {row?.branchId ? (
              <> Tài khoản sẽ tự động được gỡ khỏi chi nhánh <strong>{row.branchName || `#${row.branchId}`}</strong>.</>
            ) : null}
          </>
        )
      }
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
