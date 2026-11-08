import { useEffect, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import AuthLayout from "../layouts/AuthLayout.jsx";
import FormField from "../components/FormField.jsx";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { landingPath } from "../auth/landing.js";
import { useRouter } from "../router/HashRouter.jsx";

// SCR-01 — Đăng nhập. Bố cục và nhãn theo prototype:
// "Tên đăng nhập / mã nhân viên", "Mật khẩu", "Ghi nhớ đăng nhập".
export default function LoginPage() {
  const { status, user, login } = useAuth();
  const { navigate } = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showForgotNote, setShowForgotNote] = useState(false);

  // Đã có phiên (đăng nhập sẵn / vừa khôi phục) -> đi thẳng tới landing.
  useEffect(() => {
    if (status === "authenticated" && user) {
      navigate(landingPath({ user }));
    }
  }, [status, user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(username.trim(), password, rememberMe);
      navigate(landingPath({ landing: result.landing, user: result.user }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const formError = (() => {
    if (!error) return null;
    if (error.status === 429) return "Quá nhiều lần đăng nhập từ địa chỉ này. Vui lòng chờ ít phút rồi thử lại.";
    // INVALID_CREDENTIALS / ACCOUNT_LOCKED / VALIDATION_ERROR: dùng message của backend.
    return error.message;
  })();

  return (
    <AuthLayout>
      <div className="page-code">
        <span>SCR-01</span>
        <b>LOGIN</b>
      </div>
      <h2 className="mb-1">Đăng nhập vận hành</h2>
      <p className="text-muted-scms mb-4" style={{ fontSize: 13 }}>
        Đăng nhập để vào đúng phạm vi nghiệp vụ của bạn.
      </p>

      {status === "restoring" ? (
        <div className="text-muted-scms">
          <Spinner size="sm" className="me-2" /> Đang khôi phục phiên đăng nhập…
        </div>
      ) : (
        <Form onSubmit={handleSubmit} noValidate>
          <FormField
            label="Tên đăng nhập / mã nhân viên"
            required
            error={error?.fieldError?.("username") || null}
          >
            <Form.Control
              size="lg"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              placeholder="Ví dụ: coo"
            />
          </FormField>
          <FormField label="Mật khẩu" required error={error?.fieldError?.("password") || null}>
            <Form.Control
              size="lg"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
            />
          </FormField>

          <div className="d-flex justify-content-between align-items-center mb-3">
            <Form.Check
              type="checkbox"
              id="remember-me"
              label="Ghi nhớ đăng nhập"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <button type="button" className="link-btn" onClick={() => setShowForgotNote((v) => !v)}>
              Quên mật khẩu?
            </button>
          </div>

          {showForgotNote ? (
            <p className="small text-muted-scms">
              Hệ thống chưa có luồng tự đặt lại mật khẩu. Vui lòng liên hệ quản trị viên — tài khoản
              của bạn sẽ được đặt lại mật khẩu từ màn hình quản lý nhân viên.
            </p>
          ) : null}

          {formError ? <div className="auth-error">{formError}</div> : null}

          <Button type="submit" variant="primary" size="lg" className="w-100" disabled={busy || !username || !password}>
            {busy ? (
              <>
                <Spinner size="sm" /> Đang đăng nhập…
              </>
            ) : (
              <>
                Đăng nhập <Icon name="arrowRight" size={15} />
              </>
            )}
          </Button>

          <div className="text-center mt-3">
            <button type="button" className="link-btn" onClick={() => navigate("/kiosk")}>
              Chuyển sang Kiosk chấm công
            </button>
          </div>
        </Form>
      )}
    </AuthLayout>
  );
}
