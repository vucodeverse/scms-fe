import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authApi } from "../api/authApi.js";
import { tokenStore } from "../api/tokenStore.js";

// Quản lý phiên đăng nhập toàn ứng dụng (FE-02).
// status: "restoring" (đang khôi phục phiên khi tải lại trang) |
//         "authenticated" | "anonymous"

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải dùng bên trong <AuthProvider>.");
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [landing, setLanding] = useState(null);
  const [status, setStatus] = useState(() => (tokenStore.hasSession() ? "restoring" : "anonymous"));
  const restored = useRef(false);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setLanding(null);
    setStatus("anonymous");
  }, []);

  // Khôi phục phiên khi tải lại trang: còn refresh token thì /auth/me
  // (interceptor của http client sẽ tự refresh access token khi gặp 401).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (!tokenStore.hasSession()) return;
    authApi
      .me()
      .then((me) => {
        setUser(me);
        setStatus("authenticated");
      })
      .catch(() => {
        clearSession();
      });
  }, [clearSession]);

  // Client phát sự kiện này khi refresh thất bại / phiên bị thu hồi.
  useEffect(() => {
    const onExpired = () => clearSession();
    window.addEventListener("scms:session-expired", onExpired);
    return () => window.removeEventListener("scms:session-expired", onExpired);
  }, [clearSession]);

  const login = useCallback(async (username, password, rememberMe) => {
    const result = await authApi.login(username, password, rememberMe);
    tokenStore.save(result, rememberMe);
    // User trong response login không có username/permissions — hai trường
    // này chỉ có ở /auth/me, nên gọi tiếp để có hồ sơ đầy đủ cho menu/guard.
    let fullUser = result.user;
    try {
      fullUser = await authApi.me();
    } catch {
      // Giữ user rút gọn từ login nếu /me lỗi; menu sẽ thiếu mục theo quyền.
    }
    setUser(fullUser);
    setLanding(result.landing || null);
    setStatus("authenticated");
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Backend không reachable hoặc phiên đã bị thu hồi: vẫn xoá phiên local.
    }
    clearSession();
  }, [clearSession]);

  const hasPermission = useCallback(
    (permission) => {
      if (!permission) return true;
      return Array.isArray(user?.permissions) && user.permissions.includes(permission);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, landing, status, login, logout, hasPermission, clearSession }),
    [user, landing, status, login, logout, hasPermission, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
