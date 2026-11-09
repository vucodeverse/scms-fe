import { http, publicHttp } from "./client.js";

// API xác thực của backend scms-be (UC01).
export const authApi = {
  // -> { accessToken, expiresInSec, refreshToken (chỉ khi rememberMe=true,
  //      ngược lại null), user: { id, fullName, role, branchId, branchName },
  //      landing } — user ở đây KHÔNG có username/permissions (xem me()).
  login(username, password, rememberMe) {
    return http.post("/auth/login", { username, password, rememberMe: Boolean(rememberMe) });
  },
  // Danh sách thu ngân của chi nhánh để mở khóa quầy kiểm két bằng PIN (không cần đăng nhập trước).
  cashiers(branchId) {
    return publicHttp.get("/auth/cashiers", { params: { branchId } });
  },
  // Thu ngân đăng nhập bằng chi nhánh + nhân viên + mã PIN 4 số (nhận JWT CASHIER ngắn hạn).
  pinLogin(payload) {
    return publicHttp.post("/auth/pin-login", payload);
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
