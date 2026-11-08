import { http } from "./client.js";

// API xác thực của backend scms-be (UC01).
export const authApi = {
  // -> { accessToken, expiresInSec, refreshToken (chỉ khi rememberMe=true,
  //      ngược lại null), user: { id, fullName, role, branchId, branchName },
  //      landing } — user ở đây KHÔNG có username/permissions (xem me()).
  login(username, password, rememberMe) {
    return http.post("/auth/login", { username, password, rememberMe: Boolean(rememberMe) });
  },
  // Đổi mật khẩu bắt buộc (khi backend trả mustChangePassword) vẫn đi qua
  // phiên hiện tại: POST /auth/change-password.
  changePassword(currentPassword, newPassword) {
    return http.post("/auth/change-password", { currentPassword, newPassword });
  },
  logout() {
    return http.post("/auth/logout", {});
  },
  // -> { id, username, fullName, role, branchId, branchName, permissions }
  me() {
    return http.get("/auth/me");
  },
};
