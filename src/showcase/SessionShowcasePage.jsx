import { useState } from "react";
import { Button, Form } from "react-bootstrap";
import AdminLayout from "../layouts/AdminLayout.jsx";
import FormField from "../components/FormField.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusTag from "../components/StatusTag.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { authApi } from "../api/authApi.js";
import { buildMenu } from "../config/menu.js";
import { tokenStore } from "../api/tokenStore.js";

// Trang kiểm chứng nội bộ của FE-02 (route /_showcase/session):
// đăng nhập thật vào backend local, xem /auth/me, menu theo quyền,
// thử luồng refresh khi access token bị xoá, và đăng xuất.
const MENU = [
  {
    group: "Design system",
    items: [
      { key: "admin", label: "Admin shell + components", path: "/_showcase" },
      { key: "session", label: "Phiên đăng nhập (FE-02)", path: "/_showcase/session" },
      { key: "auth", label: "Auth shell", path: "/_showcase/auth" },
      { key: "kiosk", label: "Kiosk shell", path: "/_showcase/kiosk" },
      { key: "task", label: "Task shell", path: "/_showcase/task" },
    ],
  },
];

export default function SessionShowcasePage() {
  const { user, status, landing, login, logout } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState("coo");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [meResult, setMeResult] = useState(null);
  const [refreshNote, setRefreshNote] = useState(null);

  const menu = buildMenu(user);

  async function handleLogin(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(username, password, rememberMe);
      toast.success(`Đăng nhập thành công — landing: ${result.landing}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleMe() {
    try {
      const me = await authApi.me();
      setMeResult(me);
      toast.success("Gọi /auth/me thành công.");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleRefreshTest() {
    // Xoá access token ở storage: lần gọi /auth/me tiếp theo buộc client
    // phải tự refresh bằng refresh token và ghi đè token mới (xoay vòng).
    const before = tokenStore.getRefreshToken();
    sessionStorage.removeItem("scms.accessToken");
    try {
      const me = await authApi.me();
      const after = tokenStore.getRefreshToken();
      setMeResult(me);
      setRefreshNote(
        before && after && before !== after
          ? "Refresh thành công: refresh token đã được xoay vòng (token mới khác token cũ)."
          : "Refresh thành công.",
      );
    } catch (err) {
      setRefreshNote(`Refresh thất bại: ${err.message}`);
    }
  }

  return (
    <AdminLayout menu={MENU} branchName={user?.branchName || undefined} screenCode="FE-02">
      <PageHeader title="Kiểm chứng phiên đăng nhập" screenCode="FE-02" description="Trang nội bộ kiểm chứng API client + phiên với backend local." />

      <div className="scms-panel p-4 mb-4" style={{ maxWidth: 720 }}>
        <div className="d-flex align-items-center gap-3 mb-3">
          <strong>Trạng thái phiên:</strong>
          <StatusTag
            status={status === "authenticated" ? "ACTIVE" : "INACTIVE"}
            label={status === "authenticated" ? "Đã đăng nhập" : status === "restoring" ? "Đang khôi phục" : "Chưa đăng nhập"}
          />
          {landing ? <span className="small text-muted-scms">Landing: {landing}</span> : null}
        </div>

        {status !== "authenticated" ? (
          <Form onSubmit={handleLogin}>
            <FormField label="Tên đăng nhập" required>
              <Form.Control value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </FormField>
            <FormField label="Mật khẩu" required error={error ? `${error.code}: ${error.message}` : null}>
              <Form.Control type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </FormField>
            <Form.Check
              type="checkbox"
              label="Ghi nhớ đăng nhập (bật để có refresh token — backend chỉ cấp refresh token khi rememberMe = true)"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="mb-3"
            />
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Đang đăng nhập…" : "Đăng nhập (API thật)"}
            </Button>
          </Form>
        ) : (
          <>
            <p className="mb-1">
              <strong>{user.fullName}</strong> — {user.username} · Vai trò: {user.role}
              {user.branchName ? ` · ${user.branchName}` : ""}
            </p>
            <p className="small text-muted-scms">Quyền: {(user.permissions || []).join(", ") || "—"}</p>
            <div className="d-flex gap-2 flex-wrap mt-3">
              <Button variant="outline-secondary" onClick={handleMe}>
                Gọi /auth/me
              </Button>
              <Button variant="outline-secondary" onClick={handleRefreshTest}>
                Xoá access token rồi gọi /auth/me (thử refresh)
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await logout();
                  setMeResult(null);
                  setRefreshNote(null);
                  toast.info("Đã đăng xuất.");
                }}
              >
                Đăng xuất
              </Button>
            </div>
            {refreshNote ? <p className="small mt-3 mb-0">{refreshNote}</p> : null}
          </>
        )}
      </div>

      {user ? (
        <div className="scms-panel p-4 mb-4" style={{ maxWidth: 720 }}>
          <h2 className="mb-3">Menu sinh từ permissions</h2>
          {menu.length === 0 ? (
            <p className="text-muted-scms mb-0">Không có mục menu nào khớp quyền hiện tại.</p>
          ) : (
            menu.map((section) => (
              <div key={section.group} className="mb-2">
                <div className="small text-muted-scms" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {section.group}
                </div>
                <div>{section.items.map((i) => i.label).join(" · ")}</div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {meResult ? (
        <div className="scms-panel p-4" style={{ maxWidth: 720 }}>
          <h2 className="mb-3">Kết quả /auth/me</h2>
          <pre className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(meResult, null, 2)}
          </pre>
        </div>
      ) : null}
    </AdminLayout>
  );
}
