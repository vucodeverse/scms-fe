import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";
import StatusTag from "../components/StatusTag.jsx";
import FormField from "../components/FormField.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleLabel } from "../auth/landing.js";
import { buildMenu } from "../config/menu.js";
import { formatDateTime } from "../lib/format.js";
import { paymentConfigApi } from "../api/paymentConfigApi.js";

// SCR-16 TAB-10 — Cấu hình SePay & thanh toán (FE-19, UC15). Bố cục
// bám prototype (views-settings renderSepay): panel form "Kết nối
// SePay" bên trái + aside "Trạng thái tích hợp" bên phải. Các field
// prototype có mà backend không có (môi trường, hết hạn QR, webhook
// secret) không hiển thị. Token chỉ hiện dạng che do backend trả;
// nhập token mới dạng password, để trống = giữ nguyên.
export default function SepaySettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const menu = buildMenu(user);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({
    bankName: "",
    accountNumber: "",
    accountHolder: "",
    paymentPrefix: "",
    apiToken: "",
    webhookUrl: "",
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formMessage, setFormMessage] = useState(null);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState(null); // { success, message, testedAt }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await paymentConfigApi.get();
      setConfig(data);
      setForm({
        bankName: data.bankName || "",
        accountNumber: data.accountNumber || "",
        accountHolder: data.accountHolder || "",
        paymentPrefix: data.paymentPrefix || "",
        apiToken: "",
        webhookUrl: data.webhookUrl || "",
        active: !!data.active,
      });
    } catch (err) {
      toastRef.current.error(err.message || "Không tải được cấu hình thanh toán.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFormMessage(null);
    const payload = {
      bankName: form.bankName.trim(),
      accountNumber: form.accountNumber.trim(),
      accountHolder: form.accountHolder.trim(),
      paymentPrefix: form.paymentPrefix.trim().toUpperCase(),
      apiToken: form.apiToken.trim() ? form.apiToken.trim() : null,
      webhookUrl: form.webhookUrl.trim(),
      active: form.active,
    };
    try {
      const saved = await paymentConfigApi.update(payload);
      setConfig(saved);
      setForm((f) => ({ ...f, apiToken: "" }));
      toast.success("Đã lưu cấu hình SePay.");
    } catch (err) {
      setFormError(err);
      if (!err.fieldErrors?.length) setFormMessage(err.message || "Không lưu được cấu hình.");
    } finally {
      setSaving(false);
    }
  }

  async function runPing() {
    setPinging(true);
    setPingResult(null);
    try {
      const result = await paymentConfigApi.ping({
        apiToken: form.apiToken.trim() ? form.apiToken.trim() : null,
        webhookUrl: form.webhookUrl.trim() || null,
      });
      setPingResult(result);
    } catch (err) {
      setPingResult({ success: false, message: err.message || "Kiểm tra kết nối thất bại." });
    } finally {
      setPinging(false);
    }
  }

  return (
    <AdminLayout
      menu={menu}
      branchName={user?.branchName || undefined}
      headerRight={<SessionHeaderRight />}
      userName={user?.fullName}
      userRole={roleLabel(user?.role)}
    >
      <PageHeader
        title="SePay & thanh toán"
        screenCode="SCR-16 · TAB-10"
        description="Tài khoản nhận chuyển khoản và webhook xác nhận thanh toán VietQR cho toàn chuỗi."
      />

      {loading ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <div className="grid-2">
          <div className="scms-panel panel-pad">
            <div className="panel-head">
              <div>
                <h2>Kết nối SePay</h2>
                <p>Thông tin tài khoản nhận chuyển khoản và Webhook xác nhận thanh toán.</p>
              </div>
              {config ? (
                <StatusTag
                  status={config.active ? "ACTIVE" : "INACTIVE"}
                  label={config.active ? "Đang kích hoạt" : "Chưa kích hoạt"}
                />
              ) : null}
            </div>
            <Form onSubmit={submit}>
              {formMessage ? (
                <div className="notice notice--warn">
                  <span>{formMessage}</span>
                </div>
              ) : null}
              <div className="form-grid">
                <FormField label="Ngân hàng" required error={formError?.fieldError?.("bankName") || null}>
                  <Form.Control
                    value={form.bankName}
                    onChange={(e) => set("bankName", e.target.value)}
                    placeholder="Ví dụ: Vietcombank"
                  />
                </FormField>
                <FormField
                  label="Số tài khoản"
                  required
                  error={formError?.fieldError?.("accountNumber") || null}
                >
                  <Form.Control
                    className="mono"
                    value={form.accountNumber}
                    onChange={(e) => set("accountNumber", e.target.value)}
                  />
                </FormField>
                <FormField
                  label="Chủ tài khoản"
                  required
                  error={formError?.fieldError?.("accountHolder") || null}
                  className="span-all"
                >
                  <Form.Control
                    value={form.accountHolder}
                    onChange={(e) => set("accountHolder", e.target.value)}
                  />
                </FormField>
                <FormField
                  label="API Token"
                  error={formError?.fieldError?.("apiToken") || null}
                  help={config?.maskedApiToken ? `Token hiện tại: ${config.maskedApiToken}` : undefined}
                >
                  <Form.Control
                    type="password"
                    autoComplete="new-password"
                    value={form.apiToken}
                    onChange={(e) => set("apiToken", e.target.value)}
                    placeholder="Để trống nếu không thay đổi"
                  />
                </FormField>
                <FormField
                  label="Cú pháp chuyển khoản"
                  required
                  error={formError?.fieldError?.("paymentPrefix") || null}
                  help="Tiền tố nội dung chuyển khoản, 2–10 ký tự in hoa hoặc số. Mã tham chiếu đơn hàng được sinh theo tiền tố này."
                >
                  <Form.Control
                    className="mono"
                    value={form.paymentPrefix}
                    onChange={(e) => set("paymentPrefix", e.target.value.toUpperCase())}
                    maxLength={10}
                  />
                </FormField>
                <FormField
                  label="Webhook URL"
                  required
                  error={formError?.fieldError?.("webhookUrl") || null}
                  className="span-all"
                >
                  <Form.Control
                    className="mono"
                    value={form.webhookUrl}
                    onChange={(e) => set("webhookUrl", e.target.value)}
                  />
                </FormField>
                <FormField label="Trạng thái cổng thanh toán">
                  <Form.Check
                    type="switch"
                    id="sepay-active"
                    label={form.active ? "Đang kích hoạt" : "Tạm tắt"}
                    checked={form.active}
                    onChange={(e) => set("active", e.target.checked)}
                  />
                </FormField>
                <FormField label="Kiểm tra kết nối">
                  <div>
                    <Button variant="outline-secondary" onClick={runPing} disabled={pinging}>
                      {pinging ? <Spinner size="sm" className="me-2" /> : null}
                      Kiểm tra kết nối
                    </Button>
                  </div>
                </FormField>
              </div>
              {pingResult ? (
                <div className={`notice mt-3 ${pingResult.success ? "" : "notice--warn"}`}>
                  <span>
                    {pingResult.success ? "Kết nối thành công. " : "Kết nối thất bại. "}
                    {pingResult.message || ""}
                    {pingResult.testedAt ? ` (${formatDateTime(pingResult.testedAt)})` : ""}
                  </span>
                </div>
              ) : null}
              <div className="form-actions">
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? <Spinner size="sm" className="me-2" /> : null}
                  Lưu cấu hình
                </Button>
              </div>
            </Form>
          </div>

          <aside>
            <div className="scms-panel panel-pad">
              <div className="panel-head">
                <div>
                  <h2>Trạng thái tích hợp</h2>
                  <p>Thông tin nhận tiền hiện tại</p>
                </div>
              </div>
              <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="text-muted">Ngân hàng</span>
                <strong>{config?.bankName || "—"}</strong>
              </div>
              <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="text-muted">Số tài khoản</span>
                <strong className="mono">{config?.accountNumber || "—"}</strong>
              </div>
              <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="text-muted">Chủ tài khoản</span>
                <strong>{config?.accountHolder || "—"}</strong>
              </div>
              <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="text-muted">Cú pháp chuyển khoản</span>
                <strong className="mono">{config?.paymentPrefix || "—"}</strong>
              </div>
              <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="text-muted">Cổng thanh toán</span>
                <strong>{config?.active ? "Đang kích hoạt" : "Chưa kích hoạt"}</strong>
              </div>
              <div className="stat-line">
                <span className="text-muted">Cập nhật lúc</span>
                <strong>{config?.updatedAt ? formatDateTime(config.updatedAt) : "—"}</strong>
              </div>
              <div className="notice notice--warn mt-3">
                <span>API token không hiển thị lại sau khi lưu — hệ thống chỉ cho biết token đã được che.</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </AdminLayout>
  );
}
