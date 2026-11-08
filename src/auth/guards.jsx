import { useEffect } from "react";
import { Button, Spinner } from "react-bootstrap";
import { useRouter } from "../router/HashRouter.jsx";
import { useAuth } from "./AuthContext.jsx";

// Guard tuyến đường: chưa đăng nhập (hoặc phiên hết hạn) -> về /login.
// Đang khôi phục phiên -> hiển thị trạng thái chờ, không nháy màn hình.
export function RequireAuth({ children }) {
  const { status } = useAuth();
  const { navigate } = useRouter();

  useEffect(() => {
    if (status === "anonymous") navigate("/login");
  }, [status, navigate]);

  if (status === "restoring") {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "60vh" }}>
        <Spinner className="me-2" /> Đang khôi phục phiên đăng nhập…
      </div>
    );
  }
  if (status !== "authenticated") return null;
  return children;
}

// Guard theo vai trò: đã đăng nhập nhưng không đúng role -> màn hình 403.
export function RequireRole({ roles = [], children }) {
  const { user } = useAuth();
  const { navigate } = useRouter();

  if (!user) return null;
  if (roles.length > 0 && !roles.includes(user.role)) {
    return (
      <div className="scms-panel p-4" style={{ maxWidth: 560, margin: "48px auto" }}>
        <h2 className="mb-2">Không có quyền truy cập</h2>
        <p className="text-muted-scms">
          Vai trò hiện tại ({user.role}) không được phép mở màn hình này. Việc kiểm soát quyền
          thực tế do backend thực thi; màn hình này chỉ phản ánh đúng kết quả đó.
        </p>
        <Button variant="outline-secondary" onClick={() => navigate("/")}>
          Về trang chính
        </Button>
      </div>
    );
  }
  return children;
}
